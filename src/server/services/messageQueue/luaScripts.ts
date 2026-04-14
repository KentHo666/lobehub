import { createHash } from 'node:crypto';

import debug from 'debug';
import type Redis from 'ioredis';

const log = debug('lobe-server:message-queue:lua');

/**
 * checkAndEnqueue: atomically decide whether a new inbound message can proceed
 * immediately or must be queued behind the current active run.
 *
 * KEYS[1] = active, KEYS[2] = queue, KEYS[3] = dedup
 * ARGV[1] = msgJson, ARGV[2] = msgId, ARGV[3] = maxLen (<=0 disables cap),
 * ARGV[4] = queueTtl (s), ARGV[5] = dedupTtl (s)
 *
 * Returns: 'proceed' | 'queued' | 'duplicate' | 'rejected'
 */
export const CHECK_AND_ENQUEUE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return 'proceed'
end

if redis.call('SISMEMBER', KEYS[3], ARGV[2]) == 1 then
  return 'duplicate'
end

local maxLen = tonumber(ARGV[3])
if maxLen and maxLen > 0 then
  local len = redis.call('LLEN', KEYS[2])
  if len >= maxLen then
    return 'rejected'
  end
end

redis.call('RPUSH', KEYS[2], ARGV[1])
redis.call('SADD', KEYS[3], ARGV[2])
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[5]))
return 'queued'
`.trim();

/**
 * drainOnComplete: atomically take every queued message and release the
 * active slot, but only if the completion belongs to the currently active
 * operation (idempotent for webhook retries).
 *
 * KEYS[1] = active, KEYS[2] = queue, KEYS[3] = dedup
 * ARGV[1] = expected operationId
 *
 * Returns: list of msgJson strings (possibly empty). An empty list is
 * returned when the opId does not match — callers treat that as a no-op.
 */
export const DRAIN_ON_COMPLETE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current or current ~= ARGV[1] then
  return {}
end

local msgs = redis.call('LRANGE', KEYS[2], 0, -1)
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
return msgs
`.trim();

const sha1 = (src: string): string => createHash('sha1').update(src).digest('hex');

export const CHECK_AND_ENQUEUE_SHA = sha1(CHECK_AND_ENQUEUE_SCRIPT);
export const DRAIN_ON_COMPLETE_SHA = sha1(DRAIN_ON_COMPLETE_SCRIPT);

const NOSCRIPT_MARKER = 'NOSCRIPT';

const isNoScriptError = (err: unknown): boolean => {
  if (!err) return false;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes(NOSCRIPT_MARKER);
};

/**
 * Evaluate a Lua script, preferring EVALSHA and transparently falling back to
 * EVAL + SCRIPT LOAD when the server has not cached the script yet (cold
 * shard, replica promotion, SCRIPT FLUSH, …).
 */
export const evalScript = async <T>(
  redis: Redis,
  script: string,
  sha: string,
  keys: string[],
  args: (string | number)[],
): Promise<T> => {
  try {
    return (await redis.evalsha(sha, keys.length, ...keys, ...args)) as T;
  } catch (error) {
    if (!isNoScriptError(error)) throw error;
    log('EVALSHA miss (sha=%s); falling back to EVAL', sha);
    return (await redis.eval(script, keys.length, ...keys, ...args)) as T;
  }
};
