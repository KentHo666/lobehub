/**
 * Source channel for a queued inbound message.
 */
export type QueuedInboundMessageSource = 'bot' | 'gateway';

/**
 * Soft-only in v1; hard interrupt is out of scope per LOBE-7160 non-goals.
 */
export type QueuedInboundInterruptMode = 'soft';

/**
 * Raw bot-side context required to re-inject a merged message back into the
 * Chat SDK handler pipeline after drain.
 */
export interface QueuedInboundBotPayload {
  appId: string;
  messageId: string;
  /** Bot platform slug, e.g. 'discord' | 'slack' | 'telegram' | 'feishu' | 'wechat' | 'qq'. */
  platform: string;
  threadId: string;
}

/**
 * A message enqueued while an agent run is active.
 * Field-aligned with the frontend `QueuedMessage` (see
 * src/store/chat/slices/operation/types.ts); adds `source` and optional
 * `rawBotPayload` for the server side.
 */
export interface QueuedInboundMessage {
  content: string;
  createdAt: number;
  editorData?: Record<string, unknown>;
  files?: string[];
  id: string;
  interruptMode: QueuedInboundInterruptMode;
  rawBotPayload?: QueuedInboundBotPayload;
  source: QueuedInboundMessageSource;
}

export type EnqueueDecision = 'queued' | 'proceed' | 'duplicate' | 'rejected';

export interface MessageQueueConfig {
  /** Active-key TTL in seconds. Guards against lost completion callbacks. */
  activeTtlSec: number;
  /** Dedup-set TTL in seconds. Protects against webhook retry storms. */
  dedupTtlSec: number;
  /** Max pending messages per ctxKey; further enqueues return 'rejected'. */
  maxQueueLen: number;
  /** Queue-list TTL in seconds. Matches active TTL so both expire together. */
  queueTtlSec: number;
}

export const DEFAULT_MESSAGE_QUEUE_CONFIG: MessageQueueConfig = {
  activeTtlSec: 1800,
  dedupTtlSec: 300,
  maxQueueLen: 50,
  queueTtlSec: 1800,
};
