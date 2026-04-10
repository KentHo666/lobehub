// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { documentHistories, documents, files, users } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { DocumentModel } from '../document';
import { DocumentHistoryModel } from '../documentHistory';
import { FileModel } from '../file';

const serverDB: LobeChatDatabase = await getTestDB();

const userId = 'document-history-model-test-user-id';
const userId2 = 'document-history-model-test-user-id-2';

const documentModel = new DocumentModel(serverDB, userId);
const documentModel2 = new DocumentModel(serverDB, userId2);
const historyModel = new DocumentHistoryModel(serverDB, userId);
const historyModel2 = new DocumentHistoryModel(serverDB, userId2);
const fileModel = new FileModel(serverDB, userId);
const fileModel2 = new FileModel(serverDB, userId2);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: userId2 }]);
});

afterEach(async () => {
  await serverDB.delete(documentHistories);
  await serverDB.delete(documents);
  await serverDB.delete(files);
  await serverDB.delete(users);
});

const createTestDocument = async (model: DocumentModel, fModel: FileModel, content: string) => {
  const { id: fileId } = await fModel.create({
    fileType: 'text/plain',
    name: 'test.txt',
    size: 100,
    url: 'https://example.com/test.txt',
  });

  const file = await fModel.findById(fileId);
  if (!file) throw new Error('File not found after creation');

  const { id } = await model.create({
    content,
    fileId: file.id,
    fileType: 'text/plain',
    source: file.url,
    sourceType: 'file',
    totalCharCount: content.length,
    totalLineCount: content.split('\n').length,
  });

  return id;
};

describe('DocumentHistoryModel', () => {
  describe('create', () => {
    it('should create a new history row', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');

      const created = await historyModel.create({
        documentId,
        payload: { editorData: { blocks: [] } },
        saveSource: 'autosave',
        savedAt: new Date('2026-04-11T00:00:00.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });

      expect(created).toMatchObject({
        documentId,
        saveSource: 'autosave',
        storageKind: 'snapshot',
        userId,
        version: 1,
      });

      const stored = await historyModel.findById(created.id);
      expect(stored).toMatchObject({
        documentId,
        version: 1,
        payload: { editorData: { blocks: [] } },
      });
    });

    it('should enforce unique document version history rows', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');

      await historyModel.create({
        documentId,
        payload: { editorData: { blocks: [{ id: 'a' }] } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:00.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });

      await expect(
        historyModel.create({
          documentId,
          payload: { editorData: { blocks: [{ id: 'b' }] } },
          saveSource: 'manual',
          savedAt: new Date('2026-04-11T00:01:00.000Z'),
          storageKind: 'patch',
          version: 1,
        }),
      ).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('should return document history rows ordered by savedAt descending', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');

      await historyModel.create({
        documentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'autosave',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });
      await historyModel.create({
        documentId,
        payload: { editorData: { version: 2 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:02.000Z'),
        storageKind: 'patch',
        version: 2,
      });
      await historyModel.create({
        documentId,
        payload: { editorData: { version: 3 } },
        saveSource: 'restore',
        savedAt: new Date('2026-04-11T00:00:03.000Z'),
        storageKind: 'snapshot',
        version: 3,
      });

      const rows = await historyModel.list({ documentId });

      expect(rows.map((row) => row.version)).toEqual([3, 2, 1]);
      expect(rows[0]).toMatchObject({ saveSource: 'restore', storageKind: 'snapshot' });
    });

    it('should support pagination anchors and limits', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');

      await historyModel.create({
        documentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'autosave',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });
      await historyModel.create({
        documentId,
        payload: { editorData: { version: 2 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:02.000Z'),
        storageKind: 'patch',
        version: 2,
      });
      await historyModel.create({
        documentId,
        payload: { editorData: { version: 3 } },
        saveSource: 'restore',
        savedAt: new Date('2026-04-11T00:00:03.000Z'),
        storageKind: 'snapshot',
        version: 3,
      });

      const anchored = await historyModel.list({ beforeVersion: 3, documentId, limit: 1 });
      expect(anchored).toHaveLength(1);
      expect(anchored[0]?.version).toBe(2);
    });
  });

  describe('findByDocumentIdAndVersion', () => {
    it('should find a history row by document id and version', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');

      await historyModel.create({
        documentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });

      const row = await historyModel.findByDocumentIdAndVersion(documentId, 1);
      expect(row).toMatchObject({ documentId, version: 1, userId });
    });
  });

  describe('delete', () => {
    it('should delete a history row for the current user only', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');
      const otherDocumentId = await createTestDocument(documentModel2, fileModel2, 'Other content');

      const created = await historyModel.create({
        documentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });
      const otherCreated = await historyModel2.create({
        documentId: otherDocumentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });

      await historyModel.delete(created.id);

      const deleted = await historyModel.findById(created.id);
      const otherRow = await historyModel2.findById(otherCreated.id);

      expect(deleted).toBeUndefined();
      expect(otherRow).toBeDefined();
    });

    it('should delete all history rows for one document without affecting others', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');
      const otherDocumentId = await createTestDocument(documentModel2, fileModel2, 'Other content');

      await historyModel.create({
        documentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });
      await historyModel.create({
        documentId,
        payload: { editorData: { version: 2 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:02.000Z'),
        storageKind: 'patch',
        version: 2,
      });
      await historyModel2.create({
        documentId: otherDocumentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });

      await historyModel.deleteByDocumentId(documentId);

      const rows = await historyModel.list({ documentId });
      const otherRows = await historyModel2.list({ documentId: otherDocumentId });

      expect(rows).toHaveLength(0);
      expect(otherRows).toHaveLength(1);
    });
  });

  describe('schema assumptions', () => {
    it('should keep document version defaulted to 1 for new documents', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');

      const document = await serverDB.query.documents.findFirst({
        where: eq(documents.id, documentId),
      });

      expect(document?.version).toBe(1);
    });

    it('should keep user scoped history rows isolated', async () => {
      const documentId = await createTestDocument(documentModel, fileModel, 'Initial content');
      const otherDocumentId = await createTestDocument(documentModel2, fileModel2, 'Other content');

      const first = await historyModel.create({
        documentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });
      await historyModel2.create({
        documentId: otherDocumentId,
        payload: { editorData: { version: 1 } },
        saveSource: 'manual',
        savedAt: new Date('2026-04-11T00:00:01.000Z'),
        storageKind: 'snapshot',
        version: 1,
      });

      const rows = await historyModel.list({ documentId });
      const otherRows = await historyModel2.list({ documentId: otherDocumentId });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(first.id);
      expect(otherRows).toHaveLength(1);
    });
  });
});
