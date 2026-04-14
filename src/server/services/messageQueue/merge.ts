import type {
  QueuedInboundBotPayload,
  QueuedInboundMessage,
  QueuedInboundMessageSource,
} from './types';

/**
 * Result of merging a contiguous slice of {@link QueuedInboundMessage}s that
 * share the same source.
 *
 * Mirrors the frontend `MergedQueuedMessage` shape plus server fields that
 * downstream handlers need to rehydrate platform context.
 */
export interface MergedQueuedInboundGroup {
  content: string;
  editorData?: Record<string, unknown>;
  /** Deduped union of file ids, in encounter order. */
  files: string[];
  /** Retained from the last message in the group. */
  rawBotPayload?: QueuedInboundBotPayload;
  source: QueuedInboundMessageSource;
  /** Message ids that fed into this group; useful for logging / cleanup. */
  sourceMessageIds: string[];
}

const dedupPreservingOrder = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
};

/**
 * Merge queued inbound messages for re-injection after drain.
 *
 * Rules:
 * - Sorted by createdAt ascending.
 * - Contiguous messages of the same source are merged together; crossing
 *   sources splits into separate groups (bot and gateway have distinct
 *   downstream re-injection paths).
 * - `content` joined with `\n\n`.
 * - `files` are a deduped union in encounter order.
 * - `editorData` takes the last-seen value within the group.
 * - `rawBotPayload` takes the last-seen value within the group (only one
 *   platform context is needed to rebuild the Chat SDK thread).
 */
export const mergeQueuedInboundMessages = (
  messages: QueuedInboundMessage[],
): MergedQueuedInboundGroup[] => {
  if (messages.length === 0) return [];

  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const groups: MergedQueuedInboundGroup[] = [];

  let currentSource: QueuedInboundMessageSource | null = null;
  let buffer: QueuedInboundMessage[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const source = buffer[0].source;
    const last = buffer.at(-1)!;
    const editorData = [...buffer].reverse().find((m) => m.editorData)?.editorData;
    groups.push({
      content: buffer.map((m) => m.content).join('\n\n'),
      editorData,
      files: dedupPreservingOrder(buffer.flatMap((m) => m.files ?? [])),
      rawBotPayload: last.rawBotPayload,
      source,
      sourceMessageIds: buffer.map((m) => m.id),
    });
    buffer = [];
  };

  for (const msg of sorted) {
    if (currentSource !== null && msg.source !== currentSource) {
      flush();
    }
    currentSource = msg.source;
    buffer.push(msg);
  }
  flush();

  return groups;
};
