import type { DocumentItem } from '@lobechat/database/schemas';
import { documentHistories, documents } from '@lobechat/database/schemas';
import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';

import {
  DOCUMENT_HISTORY_LIST_LIMIT,
  DOCUMENT_HISTORY_PATCH_THRESHOLD,
  DOCUMENT_HISTORY_RETENTION_LIMIT,
  DOCUMENT_HISTORY_SNAPSHOT_INTERVAL,
} from '@/const/documentHistory';

import type { JsonPatchDelta } from './diff/json';
import { applyJsonPatch, createJsonPatch, isOversizedJsonPatch } from './diff/json';
import type {
  CompareDocumentHistoryVersionsParams,
  CompareDocumentHistoryVersionsResult,
  DatabaseLike,
  DocumentHistoryAccessOptions,
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
  DocumentHistoryStorageKind,
  DocumentHistoryVersionResult,
  GetDocumentHistoryVersionParams,
  HistoryRowReference,
  ListDocumentHistoryParams,
  ListDocumentHistoryResult,
  PersistedDocumentHistory,
  ResolvedHistoryVersion,
  RewriteDocumentHistoryOptions,
  RewriteDocumentHistoryResult,
} from './types';

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
    const latestEntry = await this.findLatestEntry(params.documentId);

    if (!latestEntry) {
      await this.insertHistoryRow({
        baseVersion: null,
        documentId: params.documentId,
        payload: structuredClone(params.editorData),
        saveSource: params.saveSource,
        savedAt: params.savedAt,
        storageKind: 'snapshot',
        version: params.version,
      });

      return;
    }

    const latestSnapshot = await this.findLatestSnapshot(params.documentId);
    const previousVersion = await this.resolveVersion(latestEntry);
    const patch = createJsonPatch(previousVersion.editorData, params.editorData);
    const shouldStoreSnapshot =
      !latestSnapshot ||
      params.version - latestSnapshot.version >= DOCUMENT_HISTORY_SNAPSHOT_INTERVAL ||
      !patch ||
      isOversizedJsonPatch(patch, params.editorData, DOCUMENT_HISTORY_PATCH_THRESHOLD);

    await this.insertHistoryRow(
      shouldStoreSnapshot
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
            baseVersion: latestEntry.version,
            documentId: params.documentId,
            payload: patch,
            saveSource: params.saveSource,
            savedAt: params.savedAt,
            storageKind: 'patch',
            version: params.version,
          },
    );
  };

  compareDocumentHistoryVersions = async (
    params: CompareDocumentHistoryVersionsParams,
    options?: DocumentHistoryAccessOptions,
  ): Promise<CompareDocumentHistoryVersionsResult> => {
    const [from, to] = await Promise.all([
      this.getDocumentHistoryVersion(
        {
          documentId: params.documentId,
          version: params.fromVersion,
        },
        options,
      ),
      this.getDocumentHistoryVersion(
        { documentId: params.documentId, version: params.toVersion },
        options,
      ),
    ]);

    return { from, to };
  };

  compactHistory = async (documentId: string, limit = DOCUMENT_HISTORY_RETENTION_LIMIT) => {
    await this.rewriteHistory(documentId, { limit });
  };

  rebuildHistory = async (
    documentId: string,
    limit = DOCUMENT_HISTORY_RETENTION_LIMIT,
    options?: Pick<RewriteDocumentHistoryOptions, 'dryRun'>,
  ): Promise<RewriteDocumentHistoryResult> => {
    return this.rewriteHistory(documentId, { dryRun: options?.dryRun, forceRewrite: true, limit });
  };

  getDocumentHistoryVersion = async (
    params: GetDocumentHistoryVersionParams,
    options?: DocumentHistoryAccessOptions,
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
        options?.historySince ? gte(documentHistories.savedAt, options.historySince) : undefined,
      ),
    });

    if (!historyRow) {
      throw new Error(`Document history version not found: ${params.documentId}@${params.version}`);
    }

    return {
      editorData: (await this.resolveVersion(historyRow)).editorData,
      isCurrent: false,
      saveSource: historyRow.saveSource as DocumentHistorySaveSource,
      savedAt: historyRow.savedAt,
      version: historyRow.version,
    };
  };

  listDocumentHistory = async (
    params: ListDocumentHistoryParams,
    options?: DocumentHistoryAccessOptions,
  ): Promise<ListDocumentHistoryResult> => {
    const limit = Math.min(
      params.limit ?? DOCUMENT_HISTORY_LIST_LIMIT,
      DOCUMENT_HISTORY_RETENTION_LIMIT,
    );
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
        options?.historySince ? gte(documentHistories.savedAt, options.historySince) : undefined,
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

  private buildPersistedRows = (
    documentId: string,
    retainedRows: Array<{
      id: string;
      saveSource: string;
      savedAt: Date;
      version: number;
    }>,
    resolvedVersions: Map<number, Record<string, any>>,
  ) => {
    const persistedRows: PersistedDocumentHistory[] = [];
    let latestSnapshotVersion: number | null = null;
    let previousVersion: ResolvedHistoryVersion | null = null;

    for (const row of retainedRows) {
      const editorData = resolvedVersions.get(row.version)!;
      const patch = previousVersion
        ? createJsonPatch(previousVersion.editorData, editorData)
        : undefined;
      const shouldStoreSnapshot =
        !previousVersion ||
        latestSnapshotVersion === null ||
        row.version - latestSnapshotVersion >= DOCUMENT_HISTORY_SNAPSHOT_INTERVAL ||
        !patch ||
        isOversizedJsonPatch(patch, editorData, DOCUMENT_HISTORY_PATCH_THRESHOLD);

      const persistedRow: PersistedDocumentHistory = shouldStoreSnapshot
        ? {
            baseVersion: null,
            documentId,
            id: row.id,
            payload: structuredClone(editorData),
            saveSource: row.saveSource as DocumentHistorySaveSource,
            savedAt: row.savedAt,
            storageKind: 'snapshot',
            version: row.version,
          }
        : {
            baseVersion: previousVersion!.version,
            documentId,
            id: row.id,
            payload: patch as JsonPatchDelta,
            saveSource: row.saveSource as DocumentHistorySaveSource,
            savedAt: row.savedAt,
            storageKind: 'patch',
            version: row.version,
          };

      if (persistedRow.storageKind === 'snapshot') {
        latestSnapshotVersion = row.version;
      }

      previousVersion = {
        editorData: structuredClone(editorData),
        version: row.version,
      };
      persistedRows.push(persistedRow);
    }

    return persistedRows;
  };

  private findAllRows = async (documentId: string) => {
    return this.db.query.documentHistories.findMany({
      orderBy: [desc(documentHistories.version)],
      where: and(
        eq(documentHistories.documentId, documentId),
        eq(documentHistories.userId, this.userId),
      ),
    });
  };

  private findHeadDocument = async (documentId: string) => {
    return this.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.userId, this.userId)),
    });
  };

  private findLatestEntry = async (documentId: string) => {
    return this.db.query.documentHistories.findFirst({
      orderBy: [desc(documentHistories.version)],
      where: and(
        eq(documentHistories.documentId, documentId),
        eq(documentHistories.userId, this.userId),
      ),
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

  private getStorageKindCounts = (
    rows: Array<{
      storageKind: string;
    }>,
  ) => {
    return rows.reduce(
      (result, row) => {
        if (row.storageKind === 'patch') result.patchCount += 1;
        if (row.storageKind === 'snapshot') result.snapshotCount += 1;

        return result;
      },
      { patchCount: 0, snapshotCount: 0 },
    );
  };

  private insertHistoryRow = async (row: PersistedDocumentHistory) => {
    await this.db.insert(documentHistories).values({
      baseVersion: row.baseVersion ?? undefined,
      documentId: row.documentId,
      id: row.id,
      payload: row.payload,
      saveSource: row.saveSource,
      savedAt: row.savedAt,
      storageKind: row.storageKind,
      userId: this.userId,
      version: row.version,
    });
  };

  private upsertHistoryRow = async (row: PersistedDocumentHistory) => {
    if (!row.id) {
      await this.insertHistoryRow(row);

      return;
    }

    await this.db
      .insert(documentHistories)
      .values({
        baseVersion: row.baseVersion ?? undefined,
        documentId: row.documentId,
        id: row.id,
        payload: row.payload,
        saveSource: row.saveSource,
        savedAt: row.savedAt,
        storageKind: row.storageKind,
        userId: this.userId,
        version: row.version,
      })
      .onConflictDoUpdate({
        set: {
          baseVersion: row.baseVersion ?? null,
          id: row.id,
          payload: row.payload,
          saveSource: row.saveSource,
          savedAt: row.savedAt,
          storageKind: row.storageKind,
        },
        target: [documentHistories.documentId, documentHistories.version],
      });
  };

  private resolveVersion = async (
    row: HistoryRowReference,
    allRows?: HistoryRowReference[],
    cache: Map<number, Record<string, any>> = new Map(),
  ): Promise<ResolvedHistoryVersion> => {
    const cached = cache.get(row.version);
    if (cached) return { editorData: cached, version: row.version };

    if (row.storageKind === 'snapshot') {
      const snapshot = structuredClone(row.payload as Record<string, any>);
      cache.set(row.version, snapshot);

      return { editorData: snapshot, version: row.version };
    }

    if (row.storageKind !== 'patch' || row.baseVersion === null) {
      const fallback = structuredClone((row.payload as Record<string, any>) ?? {});
      cache.set(row.version, fallback);

      return { editorData: fallback, version: row.version };
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

    const resolvedBase = await this.resolveVersion(baseRow, allRows, cache);
    const resolved = applyJsonPatch(
      resolvedBase.editorData,
      structuredClone(row.payload as JsonPatchDelta),
    );

    cache.set(row.version, resolved);

    return { editorData: resolved, version: row.version };
  };

  private rewriteHistory = async (
    documentId: string,
    options: RewriteDocumentHistoryOptions = {},
  ): Promise<RewriteDocumentHistoryResult> => {
    const allRows = await this.findAllRows(documentId);
    const limit = options.limit ?? DOCUMENT_HISTORY_RETENTION_LIMIT;
    const latestCapturedVersion = allRows[0]?.version ?? 0;

    if (allRows.length === 0) {
      return {
        afterPatchCount: 0,
        afterSnapshotCount: 0,
        beforePatchCount: 0,
        beforeSnapshotCount: 0,
        documentId,
        retainedRows: 0,
        rewritten: false,
        trimmedRows: 0,
      };
    }

    const retainedRows = allRows
      .slice(0, limit)
      .sort((left, right) => left.version - right.version);
    const firstRetainedVersion = retainedRows.at(0)?.version;
    const trimmedRows = Math.max(allRows.length - retainedRows.length, 0);

    if (!options.forceRewrite && trimmedRows === 0) {
      const currentCounts = this.getStorageKindCounts(retainedRows);

      return {
        afterPatchCount: currentCounts.patchCount,
        afterSnapshotCount: currentCounts.snapshotCount,
        beforePatchCount: currentCounts.patchCount,
        beforeSnapshotCount: currentCounts.snapshotCount,
        documentId,
        retainedRows: retainedRows.length,
        rewritten: false,
        trimmedRows,
      };
    }

    const resolvedVersions = new Map<number, Record<string, any>>();

    for (const row of retainedRows) {
      const resolved = await this.resolveVersion(row, allRows, resolvedVersions);
      resolvedVersions.set(row.version, resolved.editorData);
    }

    const persistedRows = this.buildPersistedRows(documentId, retainedRows, resolvedVersions);
    const beforeCounts = this.getStorageKindCounts(retainedRows);
    const afterCounts = this.getStorageKindCounts(persistedRows);

    if (options.dryRun) {
      return {
        afterPatchCount: afterCounts.patchCount,
        afterSnapshotCount: afterCounts.snapshotCount,
        beforePatchCount: beforeCounts.patchCount,
        beforeSnapshotCount: beforeCounts.snapshotCount,
        documentId,
        retainedRows: retainedRows.length,
        rewritten: true,
        trimmedRows,
      };
    }

    await this.db
      .delete(documentHistories)
      .where(
        and(
          eq(documentHistories.documentId, documentId),
          eq(documentHistories.userId, this.userId),
          firstRetainedVersion === undefined
            ? lte(documentHistories.version, latestCapturedVersion)
            : lt(documentHistories.version, firstRetainedVersion),
        ),
      );

    for (const row of persistedRows) {
      await this.upsertHistoryRow(row);
    }

    return {
      afterPatchCount: afterCounts.patchCount,
      afterSnapshotCount: afterCounts.snapshotCount,
      beforePatchCount: beforeCounts.patchCount,
      beforeSnapshotCount: beforeCounts.snapshotCount,
      documentId,
      retainedRows: retainedRows.length,
      rewritten: true,
      trimmedRows,
    };
  };
}
