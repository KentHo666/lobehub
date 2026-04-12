import { describe, expect, it } from 'vitest';

import type { JsonPatchOperation } from './json';
import { applyJsonPatch, createJsonPatch } from './json';

const createTextNode = (id: string, text: string) => ({
  detail: 0,
  format: 0,
  id,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
});

const createParagraphNode = (id: string, text?: string) => ({
  children: text ? [createTextNode(`${id}-text`, text)] : [],
  direction: null,
  format: 'start',
  id,
  indent: 0,
  textFormat: 0,
  textStyle: '',
  type: 'paragraph',
  version: 1,
});

describe('json patch diff', () => {
  it('should emit a stable remove op for arrays keyed by id', () => {
    const base = {
      root: {
        children: [
          createParagraphNode('1'),
          createParagraphNode('2'),
          createParagraphNode('3', 'tail'),
        ],
      },
    };
    const current = {
      root: {
        children: [createParagraphNode('1'), createParagraphNode('3', 'tail')],
      },
    };

    const patch = createJsonPatch(base, current);

    expect(patch).toEqual([{ op: 'remove', path: ['root', 'children', 1] }]);
    expect(applyJsonPatch(base, patch)).toEqual(current);
  });

  it('should emit an insert op for arrays keyed by id', () => {
    const base = {
      root: {
        children: [createParagraphNode('1'), createParagraphNode('3', 'tail')],
      },
    };
    const current = {
      root: {
        children: [
          createParagraphNode('1'),
          createParagraphNode('2'),
          createParagraphNode('3', 'tail'),
        ],
      },
    };

    const patch = createJsonPatch(base, current);

    expect(patch).toEqual([
      { op: 'insert', path: ['root', 'children', 1], value: createParagraphNode('2') },
    ]);
    expect(applyJsonPatch(base, patch)).toEqual(current);
  });

  it('should preserve legacy array add replay semantics', () => {
    const base = { items: ['a', 'b'] };
    const patch: JsonPatchOperation[] = [
      { op: 'replace', path: ['items', 1], value: 'x' },
      { op: 'add', path: ['items', 2], value: 'b' },
    ];

    expect(applyJsonPatch(base, patch)).toEqual({ items: ['a', 'x', 'b'] });
  });

  it('should align lexical nodes by content when ids are fully regenerated', () => {
    const base = {
      root: {
        children: [
          createParagraphNode('p-1', 'alpha'),
          createParagraphNode('p-2', 'beta'),
          createParagraphNode('p-3', 'gamma'),
        ],
      },
    };
    const current = {
      root: {
        children: [
          createParagraphNode('next-1', 'alpha'),
          createParagraphNode('next-2', 'beta updated'),
          createParagraphNode('next-3', 'gamma'),
        ],
      },
    };

    const patch = createJsonPatch(base, current);

    expect(patch.some((operation) => operation.op === 'remove')).toBe(false);
    expect(patch.some((operation) => operation.op === 'insert')).toBe(false);
    expect(applyJsonPatch(base, patch)).toEqual(current);
  });
});
