import debug from 'debug';
import type Redis from 'ioredis';

import { getAgentRuntimeRedisClient } from '@/server/modules/AgentRuntime/redis';

import { buildMessageQueueRedisKeys } from './ctxKey';
import {
  CHECK_AND_ENQUEUE_SCRIPT,
  CHECK_AND_ENQUEUE_SHA,
  DRAIN_ON_COMPLETE_SCRIPT,
  DRAIN_ON_COMPLETE_SHA,
  evalScript,
} from './luaScripts';
import {
  DEFAULT_MESSAGE_QUEUE_CONFIG,
  type EnqueueDecision,
  type MessageQueueConfig,
  type QueuedInboundMessage,
} from './types';

const log = debug('lobe-server:message-queue');

export type { ServerCtxKeyInput } from './ctxKey';
export { buildBotCtxKey, buildMessageQueueRedisKeys, buildServerCtxKey } from './ctxKey';
export type { MergedQueuedInboundGroup } from './merge';
export { mergeQueuedInboundMessages } from './merge';
export type { EnqueueDecision, MessageQueueConfig, QueuedInboundMessage } from './types';

const ENQUEUE_DECISIONS: ReadonlySet<EnqueueDecision> = new Set<EnqueueDecision>([
  'queued',
  'proceed',
  'duplicate',
  'rejected',
]);

const parseQueueEntry = (raw: unknown): QueuedInboundMessage | null => {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as QueuedInboundMessage;
  } catch (error) {
    log('failed to parse queue entry: %o', error);
    return null;
  }
};

export class MessageQueueService {
  private readonly redis: Redis;
  private readonly config: MessageQueueConfig;

  constructor(redis: Redis, config: Partial<MessageQueueConfig> = {}) {
    this.redis = redis;
    this.config = { ...DEFAULT_MESSAGE_QUEUE_CONFIG, ...config };
  }

  /**
   * Atomically decide whether a new message can run now or must be queued.
   *
   * @param ctxKey - Context key from `buildServerCtxKey`.
   * @param msg    - The inbound message to enqueue if active.
   */
  async checkAndEnqueue(ctxKey: string, msg: QueuedInboundMessage): Promise<EnqueueDecision> {
    const keys = buildMessageQueueRedisKeys(ctxKey);
    const result = await evalScript<string>(
      this.redis,
      CHECK_AND_ENQUEUE_SCRIPT,
      CHECK_AND_ENQUEUE_SHA,
      [keys.active, keys.queue, keys.dedup],
      [
        JSON.stringify(msg),
        msg.id,
        this.config.maxQueueLen,
        this.config.queueTtlSec,
        this.config.dedupTtlSec,
      ],
    );

    const decision = result as EnqueueDecision;
    if (!ENQUEUE_DECISIONS.has(decision)) {
      log('unexpected decision from Lua: %s', result);
      throw new Error(`MessageQueueService: unexpected decision ${String(result)}`);
    }
    log('checkAndEnqueue(%s, %s) -> %s', ctxKey, msg.id, decision);
    return decision;
  }

  /**
   * Mark the context as currently occupied by the given operation.
   * Sets the active key with TTL so a lost completion eventually unblocks
   * the queue.
   */
  async markActive(ctxKey: string, operationId: string, ttlSec?: number): Promise<void> {
    const { active } = buildMessageQueueRedisKeys(ctxKey);
    const ttl = ttlSec ?? this.config.activeTtlSec;
    await this.redis.set(active, operationId, 'EX', ttl);
    log('markActive(%s, %s, ttl=%d)', ctxKey, operationId, ttl);
  }

  /**
   * Read back the active operationId, if any.
   */
  async getActiveOperationId(ctxKey: string): Promise<string | null> {
    const { active } = buildMessageQueueRedisKeys(ctxKey);
    return this.redis.get(active);
  }

  /**
   * Atomically release the active slot and return every queued message.
   * No-op when the opId does not match (webhook retries / stale callbacks).
   */
  async drainOnComplete(ctxKey: string, operationId: string): Promise<QueuedInboundMessage[]> {
    const keys = buildMessageQueueRedisKeys(ctxKey);
    const rows = await evalScript<string[]>(
      this.redis,
      DRAIN_ON_COMPLETE_SCRIPT,
      DRAIN_ON_COMPLETE_SHA,
      [keys.active, keys.queue, keys.dedup],
      [operationId],
    );

    const parsed = rows
      .map((row) => parseQueueEntry(row))
      .filter((msg): msg is QueuedInboundMessage => msg !== null);
    log('drainOnComplete(%s, %s) -> %d msgs', ctxKey, operationId, parsed.length);
    return parsed;
  }

  /**
   * Read pending messages without mutating queue state.
   */
  async peekQueue(ctxKey: string): Promise<QueuedInboundMessage[]> {
    const { queue } = buildMessageQueueRedisKeys(ctxKey);
    const rows = await this.redis.lrange(queue, 0, -1);
    return rows
      .map((row) => parseQueueEntry(row))
      .filter((msg): msg is QueuedInboundMessage => msg !== null);
  }

  /**
   * Remove a single pending message by id. Returns the number of entries
   * removed (0 or 1 in practice — dedup guarantees no duplicate id).
   */
  async removeQueued(ctxKey: string, messageId: string): Promise<number> {
    const keys = buildMessageQueueRedisKeys(ctxKey);
    const rows = await this.redis.lrange(keys.queue, 0, -1);
    let removed = 0;
    for (const row of rows) {
      const parsed = parseQueueEntry(row);
      if (parsed?.id === messageId) {
        removed += await this.redis.lrem(keys.queue, 1, row);
      }
    }
    if (removed > 0) {
      await this.redis.srem(keys.dedup, messageId);
    }
    log('removeQueued(%s, %s) -> %d', ctxKey, messageId, removed);
    return removed;
  }

  /**
   * Clear the active slot and every pending message. Used by /stop, topic
   * delete, and other force-abort paths.
   */
  async cancelAndClear(ctxKey: string): Promise<void> {
    const keys = buildMessageQueueRedisKeys(ctxKey);
    await this.redis.del(keys.active, keys.queue, keys.dedup);
    log('cancelAndClear(%s)', ctxKey);
  }
}

/**
 * Lazily construct the default MessageQueueService backed by the shared
 * agent-runtime Redis client. Returns null when Redis is not configured so
 * callers can fall back to a degraded (no-queue) path instead of crashing.
 */
export const getMessageQueueService = (
  config?: Partial<MessageQueueConfig>,
): MessageQueueService | null => {
  let redis: ReturnType<typeof getAgentRuntimeRedisClient>;
  try {
    redis = getAgentRuntimeRedisClient();
  } catch (error) {
    log('getMessageQueueService: redis client unavailable: %o', error);
    return null;
  }
  if (!redis) return null;
  return new MessageQueueService(redis, config);
};
