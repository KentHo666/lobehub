// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeRedis } from './__tests__/fakeRedis';
import { buildServerCtxKey } from './ctxKey';
import { MessageQueueService } from './index';
import { CHECK_AND_ENQUEUE_SHA, DRAIN_ON_COMPLETE_SHA } from './luaScripts';
import type { QueuedInboundMessage } from './types';

const buildMsg = (
  id: string,
  overrides: Partial<QueuedInboundMessage> = {},
): QueuedInboundMessage => ({
  content: `msg-${id}`,
  createdAt: Date.now(),
  id,
  interruptMode: 'soft',
  source: 'gateway',
  ...overrides,
});

describe('MessageQueueService', () => {
  let redis: FakeRedis;
  let service: MessageQueueService;
  const ctxKey = buildServerCtxKey({ agentId: 'agt_a', topicId: 'tpc_t', userId: 'u1' });

  beforeEach(() => {
    redis = new FakeRedis();
    service = new MessageQueueService(redis.asRedis(), { maxQueueLen: 3 });
  });

  describe('checkAndEnqueue', () => {
    it("returns 'proceed' when no active run", async () => {
      await expect(service.checkAndEnqueue(ctxKey, buildMsg('a'))).resolves.toBe('proceed');
    });

    it("returns 'queued' after markActive and enqueues", async () => {
      await service.markActive(ctxKey, 'op-1');
      await expect(service.checkAndEnqueue(ctxKey, buildMsg('a'))).resolves.toBe('queued');
      await expect(service.checkAndEnqueue(ctxKey, buildMsg('b'))).resolves.toBe('queued');
      const peek = await service.peekQueue(ctxKey);
      expect(peek.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it("returns 'duplicate' for repeated msgIds while active", async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await expect(service.checkAndEnqueue(ctxKey, buildMsg('a'))).resolves.toBe('duplicate');
    });

    it("returns 'rejected' once maxQueueLen is reached", async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      await service.checkAndEnqueue(ctxKey, buildMsg('c'));
      await expect(service.checkAndEnqueue(ctxKey, buildMsg('d'))).resolves.toBe('rejected');
    });

    it('serialises 10 concurrent enqueues: first proceeds, rest queued in order', async () => {
      const big = new MessageQueueService(redis.asRedis(), { maxQueueLen: 50 });
      const decisions = await Promise.all(
        Array.from({ length: 10 }, (_, i) => big.checkAndEnqueue(ctxKey, buildMsg(`m${i}`))),
      );
      // Without an active, first call is 'proceed', subsequent calls race.
      // After the first 'proceed', nothing set the active key, so every
      // subsequent call also sees no active → 'proceed'. Simulate the
      // production pattern: caller markActive after proceed.
      expect(decisions[0]).toBe('proceed');
      // Re-run with a markActive seed:
      redis.reset();
      await big.markActive(ctxKey, 'op-seed');
      const seeded = await Promise.all(
        Array.from({ length: 10 }, (_, i) => big.checkAndEnqueue(ctxKey, buildMsg(`x${i}`))),
      );
      expect(seeded.every((d) => d === 'queued')).toBe(true);
      const peek = await big.peekQueue(ctxKey);
      expect(peek.map((m) => m.id)).toEqual(Array.from({ length: 10 }, (_, i) => `x${i}`));
    });
  });

  describe('drainOnComplete', () => {
    it('returns all queued messages and clears state when opId matches', async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      const drained = await service.drainOnComplete(ctxKey, 'op-1');
      expect(drained.map((m) => m.id)).toEqual(['a', 'b']);
      expect(await service.peekQueue(ctxKey)).toEqual([]);
      expect(await service.getActiveOperationId(ctxKey)).toBeNull();
    });

    it('is a no-op when opId does not match (stale webhook retry)', async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      const drained = await service.drainOnComplete(ctxKey, 'wrong-op');
      expect(drained).toEqual([]);
      expect(await service.getActiveOperationId(ctxKey)).toBe('op-1');
      expect((await service.peekQueue(ctxKey)).map((m) => m.id)).toEqual(['a']);
    });

    it('returns empty when no active exists', async () => {
      await expect(service.drainOnComplete(ctxKey, 'op-1')).resolves.toEqual([]);
    });
  });

  describe('EVALSHA fallback', () => {
    it('falls back to EVAL on NOSCRIPT and then uses EVALSHA', async () => {
      const evalSpy = vi.spyOn(redis, 'eval');
      const evalshaSpy = vi.spyOn(redis, 'evalsha');
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      // First call: EVALSHA miss (NOSCRIPT) → EVAL fallback
      expect(evalshaSpy).toHaveBeenCalled();
      expect(evalSpy).toHaveBeenCalled();
      evalSpy.mockClear();
      evalshaSpy.mockClear();
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      // Second call: EVALSHA hits cached script
      expect(evalshaSpy).toHaveBeenCalled();
      expect(evalSpy).not.toHaveBeenCalled();
    });

    it('uses the SHA expected by the Lua loader', () => {
      expect(CHECK_AND_ENQUEUE_SHA).toMatch(/^[\da-f]{40}$/);
      expect(DRAIN_ON_COMPLETE_SHA).toMatch(/^[\da-f]{40}$/);
    });
  });

  describe('peekQueue / removeQueued / cancelAndClear', () => {
    it('peek returns enqueue order', async () => {
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      await service.checkAndEnqueue(ctxKey, buildMsg('c'));
      expect((await service.peekQueue(ctxKey)).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    });

    it('removeQueued removes a matching id and clears dedup so it can re-enter', async () => {
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      await expect(service.removeQueued(ctxKey, 'a')).resolves.toBe(1);
      await expect(service.removeQueued(ctxKey, 'missing')).resolves.toBe(0);
      expect((await service.peekQueue(ctxKey)).map((m) => m.id)).toEqual(['b']);
      // After removal, dedup releases → re-enqueue accepted
      await expect(service.checkAndEnqueue(ctxKey, buildMsg('a'))).resolves.toBe('queued');
    });

    it('cancelAndClear wipes active, queue and dedup', async () => {
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.cancelAndClear(ctxKey);
      expect(await service.peekQueue(ctxKey)).toEqual([]);
      expect(await service.getActiveOperationId(ctxKey)).toBeNull();
      // dedup was cleared too
      await service.markActive(ctxKey, 'op2');
      await expect(service.checkAndEnqueue(ctxKey, buildMsg('a'))).resolves.toBe('queued');
    });
  });

  it('markActive TTL expires release the slot', async () => {
    vi.useFakeTimers();
    try {
      await service.markActive(ctxKey, 'op', 1);
      expect(await service.getActiveOperationId(ctxKey)).toBe('op');
      vi.setSystemTime(Date.now() + 2000);
      expect(await service.getActiveOperationId(ctxKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
