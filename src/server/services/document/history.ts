import type { DocumentItem } from '@lobechat/database/schemas';
import { documentHistories, documents } from '@lobechat/database/schemas';
import { and, desc, eq, lt } from 'drizzle-orm';

import type { LobeChatDatabase, Transaction } from '@/database/type';

import { applyJsonPatch, createJsonPatch, isOversizedJsonPatch } from './diff/json';
import type {
  CompareDocumentHistoryVersionsParams,
  CompareDocumentHistoryVersionsResult,
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
  DocumentHistoryStorageKind,
  DocumentHistoryVersionResult,
  GetDocumentHistoryVersionParams,
  ListDocumentHistoryParams,
  ListDocumentHistoryResult,
} from './types';

const DOCUMENT_HISTORY_LIMIT = 100;
const DOCUMENT_HISTORY_LIST_LIMIT = 50;
const DOCUMENT_HISTORY_PATCH_THRESHOLD = 0.7;
const DOCUMENT_HISTORY_SNAPSHOT_INTERVAL = 5;

type DatabaseLike = LobeChatDatabase | Transaction;

type PersistedDocumentHistory = {
  baseVersion: number | null;
  documentId: string;
  payload: Record<string, any> | Array<Record<string, any>>;
  saveSource: DocumentHistorySaveSource;
  savedAt: Date;
  storageKind: Exclude<DocumentHistoryStorageKind, 'head'>;
  version: number;
};

const getDocumentVersion = (document: DocumentItem | undefined) => {
  if (!document) return 0;

  return (document as DocumentItem & { version?: number }).version ?? 1;
};

const getDocumentEditorData = (document: DocumentItem | undefined) => {
  return (document?.editorData ?? {}) as Record<string, any>;
};

export class DocumentHistoryService {
  private readonly db: DatabaseLike;
  private readonly userId: string;

  constructor(db: DatabaseLike, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  appendCurrentHead = async (params: {
    documentId: string;
    editorData: Record<string, any>;
    saveSource: DocumentHistorySaveSource;
    savedAt: Date;
    version: number;
  }) => {
    const snapshotEntry = await this.findLatestSnapshot(params.documentId);
    const shouldStoreSnapshot = this.shouldStoreSnapshot(
      params.version,
      params.editorData,
      snapshotEntry,
    );

    let nextEntry: PersistedDocumentHistory;
    if (shouldStoreSnapshot || !snapshotEntry) {
      nextEntry = {
        baseVersion: null,
        documentId: params.documentId,
        payload: structuredClone(params.editorData),
        saveSource: params.saveSource,
        savedAt: params.savedAt,
        storageKind: 'snapshot',
        version: params.version,
      };
    } else {
      const patch = createJsonPatch(
        snapshotEntry.payload as Record<string, any>,
        params.editorData,
      );

      nextEntry =
        patch.length === 0 ||
        isOversizedJsonPatch(patch, params.editorData, DOCUMENT_HISTORY_PATCH_THRESHOLD)
          ? {
              baseVersion: null,
              documentId: params.documentId,
              payload: structuredClone(params.editorData),
              saveSource: params.saveSource,
              savedAt: params.savedAt,
              storageKind: 'snapshot',
              version: params.version,
            }
          : {
              baseVersion: snapshotEntry.version,
              documentId: params.documentId,
              payload: patch,
              saveSource: params.saveSource,
              savedAt: params.savedAt,
              storageKind: 'patch',
              version: params.version,
            };
    }

    await this.db.insert(documentHistories).values({
      baseVersion: nextEntry.baseVersion ?? undefined,
      documentId: nextEntry.documentId,
      payload: nextEntry.payload,
      saveSource: nextEntry.saveSource,
      savedAt: nextEntry.savedAt,
      storageKind: nextEntry.storageKind,
      userId: this.userId,
      version: nextEntry.version,
    });
  };

  compareDocumentHistoryVersions = async (
    params: CompareDocumentHistoryVersionsParams,
  ): Promise<CompareDocumentHistoryVersionsResult> => {
    const [from, to] = await Promise.all([
      this.getDocumentHistoryVersion({
        documentId: params.documentId,
        version: params.fromVersion,
      }),
      this.getDocumentHistoryVersion({ documentId: params.documentId, version: params.toVersion }),
    ]);

    return { from, to };
  };

  compactHistory = async (documentId: string, limit = DOCUMENT_HISTORY_LIMIT) => {
    const allRows = await this.db.query.documentHistories.findMany({
      orderBy: [desc(documentHistories.version)],
      where: and(
        eq(documentHistories.documentId, documentId),
        eq(documentHistories.userId, this.userId),
      ),
    });

    if (allRows.length <= limit) return;

    const retainedRows = allRows
      .slice(0, limit)
      .sort((left, right) => left.version - right.version);
    const resolvedVersions = new Map<number, Record<string, any>>();

    for (const row of retainedRows) {
      const resolved = await this.resolveRow(row, allRows, resolvedVersions);
      resolvedVersions.set(row.version, resolved);
    }

    await this.db
      .delete(documentHistories)
      .where(
        and(
          eq(documentHistories.documentId, documentId),
          eq(documentHistories.userId, this.userId),
        ),
      );

    let currentSnapshotVersion: number | null = null;
    let currentSnapshotPayload: Record<string, any> | null = null;

    for (const [index, row] of retainedRows.entries()) {
      const editorData = resolvedVersions.get(row.version)!;
      const forceSnapshot =
        index === 0 || index % DOCUMENT_HISTORY_SNAPSHOT_INTERVAL === 0 || !currentSnapshotPayload;

      const patch =
        forceSnapshot || !currentSnapshotPayload
          ? []
          : createJsonPatch(currentSnapshotPayload, editorData);

      const shouldSnapshot =
        forceSnapshot ||
        patch.length === 0 ||
        isOversizedJsonPatch(patch, editorData, DOCUMENT_HISTORY_PATCH_THRESHOLD);

      const persistedRow: PersistedDocumentHistory = shouldSnapshot
        ? {
            baseVersion: null,
            documentId,
            payload: structuredClone(editorData),
            saveSource: row.saveSource as DocumentHistorySaveSource,
            savedAt: row.savedAt,
            storageKind: 'snapshot',
            version: row.version,
          }
        : {
            baseVersion: currentSnapshotVersion,
            documentId,
            payload: patch,
            saveSource: row.saveSource as DocumentHistorySaveSource,
            savedAt: row.savedAt,
            storageKind: 'patch',
            version: row.version,
          };

      await this.db.insert(documentHistories).values({
        baseVersion: persistedRow.baseVersion ?? undefined,
        documentId: persistedRow.documentId,
        payload: persistedRow.payload,
        saveSource: persistedRow.saveSource,
        savedAt: persistedRow.savedAt,
        storageKind: persistedRow.storageKind,
        userId: this.userId,
        version: persistedRow.version,
      });

      if (persistedRow.storageKind === 'snapshot') {
        currentSnapshotPayload = structuredClone(editorData);
        currentSnapshotVersion = row.version;
      }
    }
  };

  getDocumentHistoryVersion = async (
    params: GetDocumentHistoryVersionParams,
  ): Promise<DocumentHistoryVersionResult> => {
    const headDocument = await this.findHeadDocument(params.documentId);
    const headVersion = getDocumentVersion(headDocument);

    if (!headDocument || headVersion === 0) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    if (params.version === headVersion) {
      return {
        editorData: getDocumentEditorData(headDocument),
        isCurrent: true,
        saveSource: 'system',
        savedAt: headDocument.updatedAt,
        version: headVersion,
      };
    }

    const historyRow = await this.db.query.documentHistories.findFirst({
      where: and(
        eq(documentHistories.documentId, params.documentId),
        eq(documentHistories.userId, this.userId),
        eq(documentHistories.version, params.version),
      ),
    });

    if (!historyRow) {
      throw new Error(`Document history version not found: ${params.documentId}@${params.version}`);
    }

    return {
      editorData: await this.resolveRow(historyRow),
      isCurrent: false,
      saveSource: historyRow.saveSource as DocumentHistorySaveSource,
      savedAt: historyRow.savedAt,
      version: historyRow.version,
    };
  };

  listDocumentHistory = async (
    params: ListDocumentHistoryParams,
  ): Promise<ListDocumentHistoryResult> => {
    const limit = Math.min(params.limit ?? DOCUMENT_HISTORY_LIST_LIMIT, DOCUMENT_HISTORY_LIMIT);
    const headDocument = await this.findHeadDocument(params.documentId);
    const headVersion = getDocumentVersion(headDocument);

    if (!headDocument || headVersion === 0) {
      return { headVersion: 0, items: [] };
    }

    const includeCurrent = params.includeCurrent ?? true;
    const items: DocumentHistoryListItem[] = [];
    const shouldIncludeHead =
      includeCurrent && (params.beforeVersion === undefined || headVersion < params.beforeVersion);

    if (shouldIncludeHead && limit > 0) {
      items.push({
        isCurrent: true,
        saveSource: 'system',
        savedAt: headDocument.updatedAt,
        storageKind: 'head',
        version: headVersion,
      });
    }

    const historyLimit = Math.max(limit - items.length, 0);
    if (historyLimit === 0) {
      return { headVersion, items };
    }

    const historyRows = await this.db.query.documentHistories.findMany({
      limit: historyLimit,
      orderBy: [desc(documentHistories.version)],
      where: and(
        eq(documentHistories.documentId, params.documentId),
        eq(documentHistories.userId, this.userId),
        params.beforeVersion !== undefined
          ? lt(documentHistories.version, params.beforeVersion)
          : undefined,
      ),
    });

    items.push(
      ...historyRows.map((row) => ({
        isCurrent: false,
        saveSource: row.saveSource as DocumentHistorySaveSource,
        savedAt: row.savedAt,
        storageKind: row.storageKind as Exclude<DocumentHistoryStorageKind, 'head'>,
        version: row.version,
      })),
    );

    const nextBeforeVersion =
      historyRows.length === historyLimit && historyRows.length > 0
        ? historyRows.at(-1)!.version
        : undefined;

    return {
      headVersion,
      items,
      nextBeforeVersion,
    };
  };

  private findHeadDocument = async (documentId: string) => {
    return this.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.userId, this.userId)),
    });
  };

  private findLatestSnapshot = async (documentId: string) => {
    return this.db.query.documentHistories.findFirst({
      orderBy: [desc(documentHistories.version)],
      where: and(
        eq(documentHistories.documentId, documentId),
        eq(documentHistories.userId, this.userId),
        eq(documentHistories.storageKind, 'snapshot'),
      ),
    });
  };

  private resolveRow = async (
    row: {
      baseVersion: number | null;
      documentId: string;
      payload: unknown;
      storageKind: string;
      version: number;
    },
    allRows?: Array<{
      baseVersion: number | null;
      documentId: string;
      payload: unknown;
      storageKind: string;
      version: number;
    }>,
    cache: Map<number, Record<string, any>> = new Map(),
  ): Promise<Record<string, any>> => {
    const cached = cache.get(row.version);
    if (cached) return cached;

    if (row.storageKind === 'snapshot') {
      const snapshot = structuredClone(row.payload as Record<string, any>);
      cache.set(row.version, snapshot);
      return snapshot;
    }

    if (row.storageKind !== 'patch' || row.baseVersion === null) {
      const fallback = structuredClone((row.payload as Record<string, any>) ?? {});
      cache.set(row.version, fallback);
      return fallback;
    }

    const baseRow =
      allRows?.find(
        (item) => item.documentId === row.documentId && item.version === row.baseVersion,
      ) ??
      (await this.db.query.documentHistories.findFirst({
        where: and(
          eq(documentHistories.documentId, row.documentId),
          eq(documentHistories.userId, this.userId),
          eq(documentHistories.version, row.baseVersion),
        ),
      }));

    if (!baseRow) {
      throw new Error(`Base history version not found: ${row.baseVersion}`);
    }

    const resolvedBase = await this.resolveRow(baseRow, allRows, cache);
    const resolved = applyJsonPatch(
      resolvedBase,
      structuredClone(row.payload as Array<Record<string, any>>) as Parameters<
        typeof applyJsonPatch
      >[1],
    );

    cache.set(row.version, resolved);
    return resolved;
  };

  private shouldStoreSnapshot = (
    version: number,
    editorData: Record<string, any>,
    snapshotEntry:
      | {
          payload: unknown;
          version: number;
        }
      | undefined,
  ) => {
    if (!snapshotEntry) return true;
    if (version % DOCUMENT_HISTORY_SNAPSHOT_INTERVAL === 1) return true;

    const patch = createJsonPatch(snapshotEntry.payload as Record<string, any>, editorData);
    if (patch.length === 0) return true;

    return isOversizedJsonPatch(patch, editorData, DOCUMENT_HISTORY_PATCH_THRESHOLD);
  };
}
