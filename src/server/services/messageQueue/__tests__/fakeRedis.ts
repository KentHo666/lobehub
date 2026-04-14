import type Redis from 'ioredis';

import {
  CHECK_AND_ENQUEUE_SCRIPT,
  CHECK_AND_ENQUEUE_SHA,
  DRAIN_ON_COMPLETE_SCRIPT,
  DRAIN_ON_COMPLETE_SHA,
} from '../luaScripts';

type StringEntry = { type: 'string'; value: string; expiresAt: number | null };
type ListEntry = { type: 'list'; value: string[]; expiresAt: number | null };
type SetEntry = { type: 'set'; value: Set<string>; expiresAt: number | null };
type Entry = StringEntry | ListEntry | SetEntry;

/**
 * Minimal ioredis stand-in that emulates just the commands exercised by
 * MessageQueueService and the two Lua scripts. Not a general-purpose mock —
 * just enough to keep the service tests self-contained.
 */
export class FakeRedis {
  private store = new Map<string, Entry>();
  private loadedScripts = new Set<string>();

  reset() {
    this.store.clear();
    this.loadedScripts.clear();
  }

  private readEntry(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.readEntry(key);
    if (!entry) return null;
    if (entry.type !== 'string') throw new Error(`WRONGTYPE at ${key}`);
    return entry.value;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<'OK'> {
    let expiresAt: number | null = null;
    if (mode === 'EX' && typeof ttl === 'number') {
      expiresAt = Date.now() + ttl * 1000;
    }
    this.store.set(key, { expiresAt, type: 'string', value });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) removed += 1;
    }
    return removed;
  }

  async exists(key: string): Promise<number> {
    return this.readEntry(key) ? 1 : 0;
  }

  async expire(key: string, ttl: number): Promise<number> {
    const entry = this.readEntry(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ttl * 1000;
    return 1;
  }

  async rpush(key: string, value: string): Promise<number> {
    let entry = this.readEntry(key) as ListEntry | undefined;
    if (!entry) {
      entry = { expiresAt: null, type: 'list', value: [] };
      this.store.set(key, entry);
    } else if (entry.type !== 'list') {
      throw new Error(`WRONGTYPE at ${key}`);
    }
    entry.value.push(value);
    return entry.value.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const entry = this.readEntry(key);
    if (!entry) return [];
    if (entry.type !== 'list') throw new Error(`WRONGTYPE at ${key}`);
    const end = stop === -1 ? entry.value.length : stop + 1;
    return entry.value.slice(start, end);
  }

  async llen(key: string): Promise<number> {
    const entry = this.readEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'list') throw new Error(`WRONGTYPE at ${key}`);
    return entry.value.length;
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    const entry = this.readEntry(key) as ListEntry | undefined;
    if (!entry) return 0;
    if (entry.type !== 'list') throw new Error(`WRONGTYPE at ${key}`);
    let remaining = count === 0 ? Infinity : Math.abs(count);
    const filtered: string[] = [];
    let removed = 0;
    for (const item of entry.value) {
      if (remaining > 0 && item === value) {
        remaining -= 1;
        removed += 1;
        continue;
      }
      filtered.push(item);
    }
    entry.value = filtered;
    if (filtered.length === 0) this.store.delete(key);
    return removed;
  }

  async sadd(key: string, value: string): Promise<number> {
    let entry = this.readEntry(key) as SetEntry | undefined;
    if (!entry) {
      entry = { expiresAt: null, type: 'set', value: new Set() };
      this.store.set(key, entry);
    } else if (entry.type !== 'set') {
      throw new Error(`WRONGTYPE at ${key}`);
    }
    const before = entry.value.size;
    entry.value.add(value);
    return entry.value.size - before;
  }

  async sismember(key: string, value: string): Promise<number> {
    const entry = this.readEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'set') throw new Error(`WRONGTYPE at ${key}`);
    return entry.value.has(value) ? 1 : 0;
  }

  async srem(key: string, value: string): Promise<number> {
    const entry = this.readEntry(key) as SetEntry | undefined;
    if (!entry) return 0;
    if (entry.type !== 'set') throw new Error(`WRONGTYPE at ${key}`);
    const removed = entry.value.delete(value) ? 1 : 0;
    if (entry.value.size === 0) this.store.delete(key);
    return removed;
  }

  async eval(script: string, numKeys: number, ...rest: (string | number)[]): Promise<unknown> {
    const keys = rest.slice(0, numKeys).map(String);
    const args = rest.slice(numKeys).map(String);
    if (script === CHECK_AND_ENQUEUE_SCRIPT) {
      this.loadedScripts.add(CHECK_AND_ENQUEUE_SHA);
      return this.runCheckAndEnqueue(keys, args);
    }
    if (script === DRAIN_ON_COMPLETE_SCRIPT) {
      this.loadedScripts.add(DRAIN_ON_COMPLETE_SHA);
      return this.runDrainOnComplete(keys, args);
    }
    throw new Error(`FakeRedis: unknown EVAL script`);
  }

  async evalsha(sha: string, numKeys: number, ...rest: (string | number)[]): Promise<unknown> {
    if (!this.loadedScripts.has(sha)) {
      const err = new Error('NOSCRIPT No matching script. Please use EVAL.');
      throw err;
    }
    const keys = rest.slice(0, numKeys).map(String);
    const args = rest.slice(numKeys).map(String);
    if (sha === CHECK_AND_ENQUEUE_SHA) return this.runCheckAndEnqueue(keys, args);
    if (sha === DRAIN_ON_COMPLETE_SHA) return this.runDrainOnComplete(keys, args);
    throw new Error(`FakeRedis: unknown EVALSHA sha=${sha}`);
  }

  scriptFlush() {
    this.loadedScripts.clear();
  }

  private async runCheckAndEnqueue(keys: string[], args: string[]): Promise<string> {
    const [activeKey, queueKey, dedupKey] = keys;
    const [msgJson, msgId, maxLenStr, queueTtlStr, dedupTtlStr] = args;

    if ((await this.exists(activeKey)) === 0) return 'proceed';
    if ((await this.sismember(dedupKey, msgId)) === 1) return 'duplicate';

    const maxLen = Number(maxLenStr);
    if (Number.isFinite(maxLen) && maxLen > 0) {
      const len = await this.llen(queueKey);
      if (len >= maxLen) return 'rejected';
    }

    await this.rpush(queueKey, msgJson);
    await this.sadd(dedupKey, msgId);
    await this.expire(queueKey, Number(queueTtlStr));
    await this.expire(dedupKey, Number(dedupTtlStr));
    return 'queued';
  }

  private async runDrainOnComplete(keys: string[], args: string[]): Promise<string[]> {
    const [activeKey, queueKey, dedupKey] = keys;
    const [expectedOpId] = args;
    const current = await this.get(activeKey);
    if (!current || current !== expectedOpId) return [];
    const msgs = await this.lrange(queueKey, 0, -1);
    await this.del(activeKey, queueKey, dedupKey);
    return msgs;
  }

  /** Direct TTL inspection — used only by tests. */
  peekExpiresAt(key: string): number | null {
    const entry = this.store.get(key);
    return entry?.expiresAt ?? null;
  }

  asRedis(): Redis {
    return this as unknown as Redis;
  }
}
