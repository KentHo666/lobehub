/**
 * Claude Code Adapter
 *
 * Converts Claude Code CLI stream-json (ndjson) events into
 * HeterogeneousAgentEvent[] that map to Gateway's AgentStreamEvent.
 *
 * Claude Code stream-json event types:
 * - { type: 'system', subtype: 'init', session_id, model, ... }
 * - { type: 'assistant', message: { content: [{ type: 'text'|'thinking'|'tool_use'|'tool_result', ... }] } }
 * - { type: 'result', result: '...', subtype: 'success'|'error', ... }
 * - { type: 'rate_limit_event', ... }   (ignored)
 */

import type {
  AgentCLIPreset,
  AgentEventAdapter,
  HeterogeneousAgentEvent,
  StreamChunkData,
  ToolCallPayload,
} from '../types';

// ─── CLI Preset ───

export const claudeCodePreset: AgentCLIPreset = {
  baseArgs: [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
  ],
  promptMode: 'positional',
  resumeArgs: (sessionId) => ['--resume', sessionId],
};

// ─── Adapter ───

export class ClaudeCodeAdapter implements AgentEventAdapter {
  sessionId?: string;

  private stepIndex = 0;
  /** Tool calls currently in-progress (id → payload). Used to emit tool_end when next event arrives. */
  private pendingToolCalls = new Map<string, ToolCallPayload>();
  /** Track whether we've emitted stream_start */
  private started = false;

  adapt(raw: any): HeterogeneousAgentEvent[] {
    if (!raw || typeof raw !== 'object') return [];

    switch (raw.type) {
      case 'system': {
        return this.handleSystem(raw);
      }
      case 'assistant': {
        return this.handleAssistant(raw);
      }
      case 'result': {
        return this.handleResult(raw);
      }
      default: {
        return [];
      } // rate_limit_event, etc.
    }
  }

  flush(): HeterogeneousAgentEvent[] {
    const events = [...this.pendingToolCalls.keys()].map((id) =>
      this.makeEvent('tool_end', { isSuccess: true, toolCallId: id }),
    );
    this.pendingToolCalls.clear();
    return events;
  }

  // ─── Private handlers ───

  private handleSystem(raw: any): HeterogeneousAgentEvent[] {
    if (raw.subtype === 'init') {
      this.sessionId = raw.session_id;
      this.started = true;
      return [
        this.makeEvent('stream_start', {
          model: raw.model,
          provider: 'acp-agent',
        }),
      ];
    }
    return [];
  }

  private handleAssistant(raw: any): HeterogeneousAgentEvent[] {
    const content = raw.message?.content;
    if (!Array.isArray(content)) return [];

    const events: HeterogeneousAgentEvent[] = [];

    // If we haven't emitted stream_start yet (e.g., --bare mode skips init)
    if (!this.started) {
      this.started = true;
      events.push(this.makeEvent('stream_start', { provider: 'acp-agent' }));
    }

    // First: close any pending tools from previous assistant turn
    // (Claude Code emits a new assistant event after tools complete)
    events.push(...this.closePendingTools());

    // Process content blocks
    const textParts: string[] = [];
    const reasoningParts: string[] = [];
    const newToolCalls: ToolCallPayload[] = [];

    for (const block of content) {
      switch (block.type) {
        case 'text': {
          if (block.text) textParts.push(block.text);
          break;
        }
        case 'thinking': {
          if (block.thinking) reasoningParts.push(block.thinking);
          break;
        }
        case 'tool_use': {
          const toolPayload: ToolCallPayload = {
            apiName: block.name,
            arguments: JSON.stringify(block.input || {}),
            id: block.id,
            identifier: 'acp-agent',
            type: 'default',
          };
          newToolCalls.push(toolPayload);
          this.pendingToolCalls.set(block.id, toolPayload);
          break;
        }
        case 'tool_result': {
          // tool_result in assistant message means tool already executed
          const toolCallId = block.tool_use_id;
          if (toolCallId && this.pendingToolCalls.has(toolCallId)) {
            events.push(this.makeEvent('tool_end', { isSuccess: !block.is_error, toolCallId }));
            this.pendingToolCalls.delete(toolCallId);
          }
          break;
        }
      }
    }

    // Emit text chunk
    if (textParts.length > 0) {
      events.push(this.makeChunkEvent({ chunkType: 'text', content: textParts.join('') }));
    }

    // Emit reasoning chunk
    if (reasoningParts.length > 0) {
      events.push(
        this.makeChunkEvent({ chunkType: 'reasoning', reasoning: reasoningParts.join('') }),
      );
    }

    // Emit tool calls chunk + tool_start for each new tool
    if (newToolCalls.length > 0) {
      events.push(this.makeChunkEvent({ chunkType: 'tools_calling', toolsCalling: newToolCalls }));
    }

    return events;
  }

  private handleResult(raw: any): HeterogeneousAgentEvent[] {
    const finalEvent = raw.is_error
      ? this.makeEvent('error', {
          error: raw.result || 'Agent execution failed',
          message: raw.result || 'Agent execution failed',
        })
      : this.makeEvent('agent_runtime_end', {});

    return [...this.closePendingTools(), this.makeEvent('stream_end', {}), finalEvent];
  }

  /**
   * Emit tool_end for all pending tools (called when a new assistant turn starts
   * or when the result event arrives).
   */
  private closePendingTools(): HeterogeneousAgentEvent[] {
    const events = [...this.pendingToolCalls.keys()].map((id) =>
      this.makeEvent('tool_end', { isSuccess: true, toolCallId: id }),
    );
    this.pendingToolCalls.clear();
    return events;
  }

  // ─── Event factories ───

  private makeEvent(type: HeterogeneousAgentEvent['type'], data: any): HeterogeneousAgentEvent {
    return { data, stepIndex: this.stepIndex, timestamp: Date.now(), type };
  }

  private makeChunkEvent(data: StreamChunkData): HeterogeneousAgentEvent {
    return { data, stepIndex: this.stepIndex, timestamp: Date.now(), type: 'stream_chunk' };
  }
}
