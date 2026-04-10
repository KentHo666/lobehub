// @vitest-environment node
import { type LobeChatDatabase } from '@lobechat/database';
import { documentHistories, users } from '@lobechat/database/schemas';
import { getTestDB } from '@lobechat/database/test-utils';
import { asc, eq } from 'drizzle-orm';
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

  it('should keep retained versions recoverable after history compaction', async () => {
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
});
