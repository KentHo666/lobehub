// @vitest-environment node
import { type LobeChatDatabase } from '@lobechat/database';
import { documentHistories, documents, users } from '@lobechat/database/schemas';
import { getTestDB } from '@lobechat/database/test-utils';
import { and, asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DocumentHistoryService } from '../history';
import { DocumentService } from '../index';

const serverDB: LobeChatDatabase = await getTestDB();

const userId = 'document-history-service-integration-user';

const createEditorData = (text: string) => ({
  content: [
    {
      content: [{ text, type: 'text' }],
      type: 'paragraph',
    },
  ],
  type: 'doc',
});

const createLexicalTextNode = (id: string, text: string) => ({
  detail: 0,
  format: 0,
  id,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
});

const createLexicalParagraphNode = (id: string, text?: string) => ({
  children: text ? [createLexicalTextNode(`${id}-text`, text)] : [],
  direction: null,
  format: 'start',
  id,
  indent: 0,
  textFormat: 0,
  textStyle: '',
  type: 'paragraph',
  version: 1,
});

const createLexicalEditorData = (nodes: ReturnType<typeof createLexicalParagraphNode>[]) => ({
  root: {
    children: nodes,
    direction: null,
    format: '',
    id: 'root',
    indent: 0,
    type: 'root',
    version: 1,
  },
});

const createLexicalEditorDataFromTexts = (prefix: string, texts: string[]) =>
  createLexicalEditorData(
    texts.map((text, index) => createLexicalParagraphNode(`${prefix}-${index + 1}`, text)),
  );

describe('Document history integration', () => {
  beforeEach(async () => {
    await serverDB.delete(users).where(eq(users.id, userId));
    await serverDB.insert(users).values({ id: userId });
  });

  afterEach(async () => {
    await serverDB.delete(users).where(eq(users.id, userId));
  });

  it('should list, resolve, and compare history versions from editorData-only updates', async () => {
    const documentService = new DocumentService(serverDB, userId);
    const version1 = createEditorData('v1');
    const version2 = createEditorData('v2');
    const version3 = createEditorData('v3');

    const document = await documentService.createDocument({
      content: 'v1',
      editorData: version1,
      title: 'History doc',
    });

    await documentService.updateDocument(document.id, {
      editorData: version2,
      saveSource: 'manual',
    });
    await documentService.updateDocument(document.id, {
      editorData: version3,
      saveSource: 'autosave',
    });

    const historyList = await documentService.listDocumentHistory({
      documentId: document.id,
      includeCurrent: true,
    });

    expect(historyList.headVersion).toBe(3);
    expect(historyList.items.map((item) => item.version)).toEqual([3, 2, 1]);
    expect(historyList.items[0]).toMatchObject({
      isCurrent: true,
      storageKind: 'head',
      version: 3,
    });
    expect(historyList.items[1]).toMatchObject({
      isCurrent: false,
      saveSource: 'autosave',
      version: 2,
    });
    expect(historyList.items[2]).toMatchObject({
      isCurrent: false,
      saveSource: 'manual',
      storageKind: 'snapshot',
      version: 1,
    });

    const resolvedVersion1 = await documentService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 1,
    });
    const resolvedVersion2 = await documentService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 2,
    });
    const resolvedVersion3 = await documentService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 3,
    });

    expect(resolvedVersion1.editorData).toEqual(version1);
    expect(resolvedVersion1.isCurrent).toBe(false);
    expect(resolvedVersion2.editorData).toEqual(version2);
    expect(resolvedVersion2.isCurrent).toBe(false);
    expect(resolvedVersion3.editorData).toEqual(version3);
    expect(resolvedVersion3.isCurrent).toBe(true);

    const comparison = await documentService.compareDocumentHistoryVersions({
      documentId: document.id,
      fromVersion: 1,
      toVersion: 3,
    });

    expect(comparison.from.editorData).toEqual(version1);
    expect(comparison.to.editorData).toEqual(version3);
    expect(comparison.to.isCurrent).toBe(true);
  });

  it('should trim obsolete snapshot-only history rows during compaction', async () => {
    const documentService = new DocumentService(serverDB, userId);
    const historyService = new DocumentHistoryService(serverDB, userId);
    const version1 = createEditorData('v1');
    const version2 = createEditorData('v2');
    const version3 = createEditorData('v3');
    const version4 = createEditorData('v4');

    const document = await documentService.createDocument({
      content: 'v1',
      editorData: version1,
      title: 'Compaction doc',
    });

    await documentService.updateDocument(document.id, { editorData: version2 });
    await documentService.updateDocument(document.id, { editorData: version3 });
    await documentService.updateDocument(document.id, { editorData: version4 });

    await historyService.compactHistory(document.id, 2);

    const retainedRows = await serverDB.query.documentHistories.findMany({
      orderBy: [asc(documentHistories.version)],
      where: eq(documentHistories.documentId, document.id),
    });

    expect(retainedRows.map((row) => row.version)).toEqual([2, 3]);

    const historyList = await documentService.listDocumentHistory({
      documentId: document.id,
      includeCurrent: true,
    });

    expect(historyList.headVersion).toBe(4);
    expect(historyList.items.map((item) => item.version)).toEqual([4, 3, 2]);

    await expect(
      historyService.getDocumentHistoryVersion({ documentId: document.id, version: 1 }),
    ).rejects.toThrow(`Document history version not found: ${document.id}@1`);

    const resolvedVersion2 = await historyService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 2,
    });
    const resolvedVersion3 = await historyService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 3,
    });

    expect(resolvedVersion2.editorData).toEqual(version2);
    expect(resolvedVersion3.editorData).toEqual(version3);
  });

  it('should preserve an external base snapshot needed by retained patch rows during compaction', async () => {
    const documentService = new DocumentService(serverDB, userId);
    const historyService = new DocumentHistoryService(serverDB, userId);
    const initialNodes = [
      createLexicalParagraphNode('empty-1'),
      createLexicalParagraphNode('empty-2'),
      createLexicalParagraphNode('empty-3'),
      createLexicalParagraphNode('body-1', 'alpha'),
      createLexicalParagraphNode('body-2', 'beta'),
      createLexicalParagraphNode('body-3', 'gamma'),
      createLexicalParagraphNode('body-4', 'delta'),
      createLexicalParagraphNode('body-5', 'epsilon'),
    ];
    const version1 = createLexicalEditorData(initialNodes);
    const version2 = createLexicalEditorData(initialNodes.filter((node) => node.id !== 'empty-1'));
    const version3 = createLexicalEditorData(
      initialNodes.filter((node) => node.id !== 'empty-1' && node.id !== 'empty-2'),
    );
    const version4 = createLexicalEditorData(
      initialNodes.filter((node) => !['empty-1', 'empty-2', 'empty-3'].includes(String(node.id))),
    );

    const document = await documentService.createDocument({
      content: 'Patch compaction doc',
      editorData: version1,
      title: 'Patch compaction doc',
    });

    await documentService.updateDocument(document.id, { editorData: version2 });
    await documentService.updateDocument(document.id, { editorData: version3 });
    await documentService.updateDocument(document.id, { editorData: version4 });

    await historyService.compactHistory(document.id, 2);

    const retainedRows = await serverDB.query.documentHistories.findMany({
      orderBy: [asc(documentHistories.version)],
      where: eq(documentHistories.documentId, document.id),
    });

    expect(retainedRows.map((row) => row.version)).toEqual([1, 2, 3]);
    expect(retainedRows.map((row) => row.storageKind)).toEqual(['snapshot', 'patch', 'patch']);

    const resolvedVersion2 = await historyService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 2,
    });
    const resolvedVersion3 = await historyService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 3,
    });

    expect(resolvedVersion2.editorData).toEqual(version2);
    expect(resolvedVersion3.editorData).toEqual(version3);
  });

  it('should limit front-end history queries to versions saved within the last 30 days', async () => {
    const documentService = new DocumentService(serverDB, userId);
    const now = Date.now();
    const historySince = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const oldSavedAt = new Date(now - 40 * 24 * 60 * 60 * 1000);
    const recentSavedAt = new Date(now - 5 * 24 * 60 * 60 * 1000);

    const version1 = createEditorData('v1');
    const version2 = createEditorData('v2');
    const version3 = createEditorData('v3');

    const document = await documentService.createDocument({
      content: 'v1',
      editorData: version1,
      title: 'History access window doc',
    });

    await documentService.updateDocument(document.id, {
      editorData: version2,
      saveSource: 'manual',
    });
    await documentService.updateDocument(document.id, {
      editorData: version3,
      saveSource: 'manual',
    });

    await serverDB
      .update(documentHistories)
      .set({ savedAt: oldSavedAt })
      .where(
        and(
          eq(documentHistories.documentId, document.id),
          eq(documentHistories.version, 1),
          eq(documentHistories.userId, userId),
        ),
      );

    await serverDB
      .update(documentHistories)
      .set({ savedAt: recentSavedAt })
      .where(
        and(
          eq(documentHistories.documentId, document.id),
          eq(documentHistories.version, 2),
          eq(documentHistories.userId, userId),
        ),
      );

    const historyList = await documentService.listDocumentHistory(
      {
        documentId: document.id,
        includeCurrent: true,
      },
      { historySince },
    );

    expect(historyList.items.map((item) => item.version)).toEqual([3, 2]);

    await expect(
      documentService.getDocumentHistoryVersion(
        {
          documentId: document.id,
          version: 1,
        },
        { historySince },
      ),
    ).rejects.toThrow(`Document history version not found: ${document.id}@1`);

    const currentVersion = await documentService.getDocumentHistoryVersion(
      {
        documentId: document.id,
        version: 3,
      },
      { historySince },
    );

    expect(currentVersion.isCurrent).toBe(true);
    expect(currentVersion.editorData).toEqual(version3);
  });

  it('should store patches for keyed editor node deletions instead of snapshots', async () => {
    const documentService = new DocumentService(serverDB, userId);
    const initialNodes = [
      createLexicalParagraphNode('empty-1'),
      createLexicalParagraphNode('empty-2'),
      createLexicalParagraphNode('empty-3'),
      createLexicalParagraphNode('body-1', 'alpha'),
      createLexicalParagraphNode('body-2', 'beta'),
      createLexicalParagraphNode('body-3', 'gamma'),
      createLexicalParagraphNode('body-4', 'delta'),
      createLexicalParagraphNode('body-5', 'epsilon'),
    ];
    const version1 = createLexicalEditorData(initialNodes);
    const version2 = createLexicalEditorData(initialNodes.filter((node) => node.id !== 'empty-1'));
    const version3 = createLexicalEditorData(
      initialNodes.filter((node) => node.id !== 'empty-1' && node.id !== 'empty-2'),
    );
    const version4 = createLexicalEditorData(
      initialNodes.filter((node) => !['empty-1', 'empty-2', 'empty-3'].includes(String(node.id))),
    );

    const document = await documentService.createDocument({
      content: 'History patch doc',
      editorData: version1,
      title: 'History patch doc',
    });

    await documentService.updateDocument(document.id, { editorData: version2 });
    await documentService.updateDocument(document.id, { editorData: version3 });
    await documentService.updateDocument(document.id, { editorData: version4 });

    const retainedRows = await serverDB.query.documentHistories.findMany({
      orderBy: [asc(documentHistories.version)],
      where: eq(documentHistories.documentId, document.id),
    });

    expect(retainedRows.map((row) => row.version)).toEqual([1, 2, 3]);
    expect(retainedRows.map((row) => row.storageKind)).toEqual(['snapshot', 'patch', 'patch']);
    expect(retainedRows[1].baseVersion).toBe(1);
    expect(retainedRows[2].baseVersion).toBe(1);

    const resolvedVersion2 = await documentService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 2,
    });
    const resolvedVersion3 = await documentService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 3,
    });

    expect(resolvedVersion2.editorData).toEqual(version2);
    expect(resolvedVersion3.editorData).toEqual(version3);
  });

  it('should rebuild existing snapshot-only history rows using current diff rules', async () => {
    const documentService = new DocumentService(serverDB, userId);
    const historyService = new DocumentHistoryService(serverDB, userId);
    const initialNodes = [
      createLexicalParagraphNode('empty-1'),
      createLexicalParagraphNode('empty-2'),
      createLexicalParagraphNode('empty-3'),
      createLexicalParagraphNode('body-1', 'alpha'),
      createLexicalParagraphNode('body-2', 'beta'),
      createLexicalParagraphNode('body-3', 'gamma'),
      createLexicalParagraphNode('body-4', 'delta'),
    ];
    const version1 = createLexicalEditorData(initialNodes);
    const version2 = createLexicalEditorData(initialNodes.filter((node) => node.id !== 'empty-1'));
    const version3 = createLexicalEditorData(
      initialNodes.filter((node) => !['empty-1', 'empty-2'].includes(String(node.id))),
    );
    const version4 = createLexicalEditorData(
      initialNodes.filter((node) => !['empty-1', 'empty-2', 'empty-3'].includes(String(node.id))),
    );

    const document = await documentService.createDocument({
      content: 'History rewrite doc',
      editorData: version1,
      title: 'History rewrite doc',
    });

    await serverDB
      .update(documents)
      .set({ editorData: version4, version: 4 })
      .where(eq(documents.id, document.id));

    await serverDB.insert(documentHistories).values([
      {
        documentId: document.id,
        id: 'history-row-v1',
        payload: version1,
        saveSource: 'autosave',
        savedAt: new Date('2026-04-12T08:00:00.000Z'),
        storageKind: 'snapshot',
        userId,
        version: 1,
      },
      {
        documentId: document.id,
        id: 'history-row-v2',
        payload: version2,
        saveSource: 'autosave',
        savedAt: new Date('2026-04-12T08:01:00.000Z'),
        storageKind: 'snapshot',
        userId,
        version: 2,
      },
      {
        documentId: document.id,
        id: 'history-row-v3',
        payload: version3,
        saveSource: 'autosave',
        savedAt: new Date('2026-04-12T08:02:00.000Z'),
        storageKind: 'snapshot',
        userId,
        version: 3,
      },
    ]);

    const result = await historyService.rebuildHistory(document.id);

    expect(result.beforeSnapshotCount).toBe(3);
    expect(result.afterPatchCount).toBe(2);
    expect(result.afterSnapshotCount).toBe(1);
    expect(result.rewritten).toBe(true);

    const retainedRows = await serverDB.query.documentHistories.findMany({
      orderBy: [asc(documentHistories.version)],
      where: eq(documentHistories.documentId, document.id),
    });

    expect(retainedRows.map((row) => row.id)).toEqual([
      'history-row-v1',
      'history-row-v2',
      'history-row-v3',
    ]);
    expect(retainedRows.map((row) => row.storageKind)).toEqual(['snapshot', 'patch', 'patch']);
    expect(retainedRows[1].baseVersion).toBe(1);
    expect(retainedRows[2].baseVersion).toBe(1);

    const resolvedVersion2 = await historyService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 2,
    });
    const resolvedVersion3 = await historyService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 3,
    });

    expect(resolvedVersion2.editorData).toEqual(version2);
    expect(resolvedVersion3.editorData).toEqual(version3);
  });

  it('should keep rekeyed lexical versions as patches when content stays structurally aligned', async () => {
    const documentService = new DocumentService(serverDB, userId);
    const paragraphTexts = Array.from(
      { length: 18 },
      (_, index) =>
        `Paragraph ${index + 1}: ${'semantic content '.repeat(8).trim()} section ${index + 1}.`,
    );
    const version1 = createLexicalEditorDataFromTexts('base', paragraphTexts);
    const version2 = createLexicalEditorDataFromTexts(
      'rekeyed',
      paragraphTexts.map((text, index) =>
        index === 7 ? text.replace('section 8.', 'section 8 updated.') : text,
      ),
    );
    const version3 = createLexicalEditorDataFromTexts(
      'next',
      paragraphTexts.map((text, index) =>
        index === 7 ? text.replace('section 8.', 'section 8 updated twice.') : text,
      ),
    );

    const document = await documentService.createDocument({
      content: 'History rekey doc',
      editorData: version1,
      title: 'History rekey doc',
    });

    await documentService.updateDocument(document.id, { editorData: version2 });
    await documentService.updateDocument(document.id, { editorData: version3 });

    const retainedRows = await serverDB.query.documentHistories.findMany({
      orderBy: [asc(documentHistories.version)],
      where: eq(documentHistories.documentId, document.id),
    });

    expect(retainedRows.map((row) => row.version)).toEqual([1, 2]);
    expect(retainedRows.map((row) => row.storageKind)).toEqual(['snapshot', 'patch']);
    expect(retainedRows[1].baseVersion).toBe(1);

    const resolvedVersion2 = await documentService.getDocumentHistoryVersion({
      documentId: document.id,
      version: 2,
    });

    expect(resolvedVersion2.editorData).toEqual(version2);
  });
});
