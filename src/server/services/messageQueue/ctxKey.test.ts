// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import { buildBotCtxKey, buildMessageQueueRedisKeys, buildServerCtxKey } from './ctxKey';

describe('buildBotCtxKey', () => {
  it('assembles the bot ctxKey from userId, platform, and threadId', () => {
    expect(buildBotCtxKey('u1', 'discord', 'discord:g:c:t')).toBe('u1:bot:discord:discord:g:c:t');
  });

  it('throws when userId is empty', () => {
    expect(() => buildBotCtxKey('', 'discord', 't')).toThrow(/userId is required/);
  });
});

describe('buildServerCtxKey', () => {
  it('prefixes userId before the frontend messageMapKey output', () => {
    const input = { agentId: 'agt_xxx', topicId: 'tpc_yyy' };
    expect(buildServerCtxKey({ userId: 'user-1', ...input })).toBe(
      `user-1:${messageMapKey(input)}`,
    );
  });

  it('matches the frontend key for an existing thread', () => {
    const input = { agentId: 'agt_xxx', threadId: 'thd_zzz', topicId: 'tpc_yyy' };
    expect(buildServerCtxKey({ userId: 'u', ...input })).toBe(`u:${messageMapKey(input)}`);
    expect(buildServerCtxKey({ userId: 'u', ...input })).toBe('u:thread_agt_xxx_tpc_yyy_thd_zzz');
  });

  it('matches the frontend key for a new main topic', () => {
    const input = { agentId: 'agt_xxx' };
    expect(buildServerCtxKey({ userId: 'u', ...input })).toBe('u:main_agt_xxx_new');
  });

  it('matches the frontend key for a group conversation', () => {
    const input = { agentId: 'agt_xxx', groupId: 'grp_yyy', topicId: 'tpc_zzz' };
    expect(buildServerCtxKey({ userId: 'u', ...input })).toBe(`u:${messageMapKey(input)}`);
  });

  it('throws when userId is empty', () => {
    expect(() => buildServerCtxKey({ agentId: 'agt_xxx', userId: '' })).toThrow(
      /userId is required/,
    );
  });

  it('keeps userId isolation across identical conversation contexts', () => {
    const input = { agentId: 'agt_xxx', topicId: 'tpc_yyy' };
    const k1 = buildServerCtxKey({ userId: 'a', ...input });
    const k2 = buildServerCtxKey({ userId: 'b', ...input });
    expect(k1).not.toBe(k2);
  });
});

describe('buildMessageQueueRedisKeys', () => {
  it('derives four namespaced keys from a ctxKey', () => {
    const keys = buildMessageQueueRedisKeys('u:main_agt_xxx_tpc_yyy');
    expect(keys).toEqual({
      active: 'queue:active:u:main_agt_xxx_tpc_yyy',
      dedup: 'queue:dedup:u:main_agt_xxx_tpc_yyy',
      lock: 'queue:lock:u:main_agt_xxx_tpc_yyy',
      queue: 'queue:msg:u:main_agt_xxx_tpc_yyy',
    });
  });
});
