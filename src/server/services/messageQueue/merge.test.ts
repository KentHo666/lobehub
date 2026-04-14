// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { mergeQueuedInboundMessages } from './merge';
import type { QueuedInboundMessage } from './types';

const botMsg = (
  id: string,
  content: string,
  createdAt: number,
  files?: string[],
  threadId = 't1',
): QueuedInboundMessage => ({
  content,
  createdAt,
  files,
  id,
  interruptMode: 'soft',
  rawBotPayload: { appId: 'app', messageId: id, platform: 'discord', threadId },
  source: 'bot',
});

const gatewayMsg = (
  id: string,
  content: string,
  createdAt: number,
  files?: string[],
): QueuedInboundMessage => ({
  content,
  createdAt,
  files,
  id,
  interruptMode: 'soft',
  source: 'gateway',
});

describe('mergeQueuedInboundMessages', () => {
  it('returns [] for empty input', () => {
    expect(mergeQueuedInboundMessages([])).toEqual([]);
  });

  it('merges three bot messages by createdAt ascending', () => {
    const msgs = [botMsg('b', 'second', 2), botMsg('c', 'third', 3), botMsg('a', 'first', 1)];
    const groups = mergeQueuedInboundMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].content).toBe('first\n\nsecond\n\nthird');
    expect(groups[0].source).toBe('bot');
    expect(groups[0].sourceMessageIds).toEqual(['a', 'b', 'c']);
  });

  it('merges three gateway messages into one group', () => {
    const groups = mergeQueuedInboundMessages([
      gatewayMsg('g1', 'A', 1),
      gatewayMsg('g2', 'B', 2),
      gatewayMsg('g3', 'C', 3),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].content).toBe('A\n\nB\n\nC');
    expect(groups[0].source).toBe('gateway');
    expect(groups[0].rawBotPayload).toBeUndefined();
  });

  it('splits mixed sources into ordered groups', () => {
    const groups = mergeQueuedInboundMessages([
      botMsg('b1', 'bot1', 1),
      botMsg('b2', 'bot2', 2),
      gatewayMsg('g1', 'gw1', 3),
      botMsg('b3', 'bot3', 4),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.source)).toEqual(['bot', 'gateway', 'bot']);
    expect(groups[0].content).toBe('bot1\n\nbot2');
    expect(groups[1].content).toBe('gw1');
    expect(groups[2].content).toBe('bot3');
  });

  it('dedupes file ids while preserving encounter order', () => {
    const groups = mergeQueuedInboundMessages([
      gatewayMsg('g1', 'A', 1, ['f1', 'f2']),
      gatewayMsg('g2', 'B', 2, ['f2', 'f3']),
      gatewayMsg('g3', 'C', 3, ['f1', 'f4']),
    ]);
    expect(groups[0].files).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('takes rawBotPayload from the last bot message in a group', () => {
    const groups = mergeQueuedInboundMessages([
      botMsg('b1', 'first', 1, undefined, 'thread-early'),
      botMsg('b2', 'second', 2, undefined, 'thread-late'),
    ]);
    expect(groups[0].rawBotPayload?.threadId).toBe('thread-late');
    expect(groups[0].rawBotPayload?.messageId).toBe('b2');
  });

  it('takes the last editorData seen within a group', () => {
    const withEditor = (
      id: string,
      createdAt: number,
      editorData?: Record<string, unknown>,
    ): QueuedInboundMessage => ({
      content: id,
      createdAt,
      editorData,
      id,
      interruptMode: 'soft',
      source: 'gateway',
    });
    const groups = mergeQueuedInboundMessages([
      withEditor('g1', 1, { v: 1 }),
      withEditor('g2', 2, undefined),
      withEditor('g3', 3, { v: 3 }),
    ]);
    expect(groups[0].editorData).toEqual({ v: 3 });
  });
});
