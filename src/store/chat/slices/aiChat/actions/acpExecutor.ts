import type { HeterogeneousAgentEvent, ToolCallPayload } from '@lobechat/heterogeneous-agents';
import { createAdapter } from '@lobechat/heterogeneous-agents';
import type { AgentProviderConfig, ConversationContext } from '@lobechat/types';

import type { AgentStreamEvent } from '@/libs/agent-stream/types';
import { acpService } from '@/services/electron/acp';
import { messageService } from '@/services/message';
import type { ChatStore } from '@/store/chat/store';

import { createGatewayEventHandler } from './gatewayEventHandler';

export interface ACPExecutorParams {
  agentProvider: AgentProviderConfig;
  assistantMessageId: string;
  context: ConversationContext;
  message: string;
  operationId: string;
}

/**
 * Map agentProvider.command to adapter type key.
 */
const resolveAdapterType = (config: AgentProviderConfig): string => {
  // Explicit adapterType in config takes priority
  if ((config as any).adapterType) return (config as any).adapterType;

  // Infer from command name
  const cmd = config.command || 'claude';
  if (cmd.includes('claude')) return 'claude-code';
  if (cmd.includes('codex')) return 'codex';
  if (cmd.includes('kimi')) return 'kimi-cli';

  return 'claude-code'; // default
};

/**
 * Convert HeterogeneousAgentEvent to AgentStreamEvent (add operationId).
 */
const toStreamEvent = (event: HeterogeneousAgentEvent, operationId: string): AgentStreamEvent => ({
  data: event.data,
  operationId,
  stepIndex: event.stepIndex,
  timestamp: event.timestamp,
  type: event.type,
});

/**
 * Subscribe to Electron IPC broadcasts for raw agent lines.
 * Returns unsubscribe function.
 */
const subscribeBroadcasts = (
  sessionId: string,
  callbacks: {
    onComplete: () => void;
    onError: (error: string) => void;
    onRawLine: (line: any) => void;
  },
): (() => void) => {
  if (!window.electron?.ipcRenderer) return () => {};

  const ipc = window.electron.ipcRenderer;

  const onLine = (_e: any, data: { line: any; sessionId: string }) => {
    if (data.sessionId === sessionId) callbacks.onRawLine(data.line);
  };
  const onComplete = (_e: any, data: { sessionId: string }) => {
    if (data.sessionId === sessionId) callbacks.onComplete();
  };
  const onError = (_e: any, data: { error: string; sessionId: string }) => {
    if (data.sessionId === sessionId) callbacks.onError(data.error);
  };

  ipc.on('acpRawLine' as any, onLine);
  ipc.on('acpSessionComplete' as any, onComplete);
  ipc.on('acpSessionError' as any, onError);

  return () => {
    ipc.removeListener('acpRawLine' as any, onLine);
    ipc.removeListener('acpSessionComplete' as any, onComplete);
    ipc.removeListener('acpSessionError' as any, onError);
  };
};

/**
 * Create tool messages in DB for tool_use blocks from the adapter.
 * Called before feeding tool-related events to the gateway handler.
 */
const persistToolCalls = async (
  toolCalls: ToolCallPayload[],
  assistantMessageId: string,
  context: ConversationContext,
) => {
  for (const tool of toolCalls) {
    try {
      // Create tool message + messagePlugins record
      await messageService.createMessage({
        agentId: context.agentId,
        content: '',
        parentId: assistantMessageId,
        plugin: {
          apiName: tool.apiName,
          arguments: tool.arguments,
          identifier: tool.identifier,
          type: tool.type,
        },
        role: 'tool',
        tool_call_id: tool.id,
        topicId: context.topicId ?? undefined,
      });
    } catch (err) {
      console.error('[ACP] Failed to create tool message:', err);
    }
  }

  // Update assistant message's tools JSONB
  try {
    await messageService.updateMessage(
      assistantMessageId,
      { tools: toolCalls },
      {
        agentId: context.agentId,
        topicId: context.topicId,
      },
    );
  } catch (err) {
    console.error('[ACP] Failed to update assistant tools:', err);
  }
};

/**
 * Execute a prompt via an external agent CLI.
 *
 * Flow:
 * 1. Subscribe to IPC broadcasts
 * 2. Spawn agent process via acpService
 * 3. Raw stdout lines → Adapter → HeterogeneousAgentEvent → AgentStreamEvent
 * 4. Feed AgentStreamEvents into createGatewayEventHandler (unified handler)
 * 5. Tool messages created via messageService before emitting tool events
 */
export const executeACPAgent = async (
  get: () => ChatStore,
  params: ACPExecutorParams,
): Promise<void> => {
  const { agentProvider, assistantMessageId, context, message, operationId } = params;

  // Create adapter for this agent type
  const adapterType = resolveAdapterType(agentProvider);
  const adapter = createAdapter(adapterType);

  // Create the unified event handler (same one Gateway uses)
  const eventHandler = createGatewayEventHandler(get, {
    assistantMessageId,
    context,
    operationId,
  });

  let acpSessionId: string | undefined;
  let unsubscribe: (() => void) | undefined;
  let completed = false;

  // Track state for DB persistence
  // (Gateway handler accumulates in memory; ACP needs to persist since no server does it)
  let allToolCalls: ToolCallPayload[] = [];
  let accumulatedContent = '';
  let accumulatedReasoning = '';

  try {
    // Start session
    const result = await acpService.startSession({
      agentType: adapterType,
      args: agentProvider.args,
      command: agentProvider.command || 'claude',
      cwd: agentProvider.workingDirectory,
      env: agentProvider.env,
    });
    acpSessionId = result.sessionId;

    // Subscribe to broadcasts BEFORE sending prompt
    unsubscribe = subscribeBroadcasts(acpSessionId, {
      onRawLine: (line) => {
        // Adapter converts raw → HeterogeneousAgentEvent[]
        const events = adapter.adapt(line);

        for (const event of events) {
          // Accumulate content for DB persistence
          // (Gateway server persists during streaming; ACP has no server, so we persist at stream end)
          if (event.type === 'stream_chunk') {
            const chunk = event.data;
            if (chunk?.chunkType === 'text' && chunk.content) {
              accumulatedContent += chunk.content;
            }
            if (chunk?.chunkType === 'reasoning' && chunk.reasoning) {
              accumulatedReasoning += chunk.reasoning;
            }
            if (chunk?.chunkType === 'tools_calling') {
              const tools = chunk.toolsCalling as ToolCallPayload[];
              if (tools?.length) {
                allToolCalls = [...allToolCalls, ...tools];
                persistToolCalls(allToolCalls, assistantMessageId, context);
              }
            }
          }

          // Feed into unified handler
          eventHandler(toStreamEvent(event, operationId));
        }
      },

      onComplete: async () => {
        if (completed) return;
        completed = true;

        // Flush any remaining adapter state
        const flushEvents = adapter.flush();
        for (const event of flushEvents) {
          eventHandler(toStreamEvent(event, operationId));
        }

        // Persist accumulated content to DB before completing
        // (Gateway server does this during streaming; ACP has no server)
        if (accumulatedContent || accumulatedReasoning) {
          const updateValue: Record<string, any> = {};
          if (accumulatedContent) updateValue.content = accumulatedContent;
          if (accumulatedReasoning) updateValue.reasoning = { content: accumulatedReasoning };

          await messageService
            .updateMessage(assistantMessageId, updateValue, {
              agentId: context.agentId,
              topicId: context.topicId,
            })
            .catch(console.error);
        }

        // Now emit agent_runtime_end — handler will fetchAndReplaceMessages from DB
        const hasEnd = flushEvents.some((e) => e.type === 'agent_runtime_end');
        if (!hasEnd) {
          eventHandler(
            toStreamEvent(
              {
                data: {},
                stepIndex: 0,
                timestamp: Date.now(),
                type: 'agent_runtime_end',
              },
              operationId,
            ),
          );
        }
      },

      onError: async (error) => {
        if (completed) return;
        completed = true;

        // Persist any partial content before reporting error
        if (accumulatedContent) {
          await messageService
            .updateMessage(
              assistantMessageId,
              { content: accumulatedContent },
              {
                agentId: context.agentId,
                topicId: context.topicId,
              },
            )
            .catch(console.error);
        }

        eventHandler(
          toStreamEvent(
            {
              data: { error, message: error },
              stepIndex: 0,
              timestamp: Date.now(),
              type: 'error',
            },
            operationId,
          ),
        );
      },
    });

    // Send the prompt — blocks until process exits
    await acpService.sendPrompt(acpSessionId, message);

    // Store agent session ID for multi-turn resume
    const sessionInfo = await acpService.getSessionInfo(acpSessionId).catch(() => null);
    if (sessionInfo?.agentSessionId && context.topicId) {
      // TODO: persist to topic.metadata for cross-restart resume
      // For now, agent session ID is only in memory (AcpCtr stores it)
    }
  } catch (error) {
    if (!completed) {
      completed = true;
      const errorMsg = error instanceof Error ? error.message : 'Agent execution failed';
      eventHandler(
        toStreamEvent(
          {
            data: { error: errorMsg, message: errorMsg },
            stepIndex: 0,
            timestamp: Date.now(),
            type: 'error',
          },
          operationId,
        ),
      );
    }
  } finally {
    unsubscribe?.();
    if (acpSessionId) {
      acpService.stopSession(acpSessionId).catch(() => {});
    }
  }
};
