import type { LobeChatDatabase, Transaction } from '@/database/type';

import type { JsonPatchDelta } from './diff/json';

export type DocumentHistorySaveSource = 'autosave' | 'manual' | 'restore' | 'system';

export type DocumentHistoryStorageKind = 'head' | 'patch' | 'snapshot';

export interface CompareDocumentHistoryVersionsParams {
  documentId: string;
  fromVersion: number;
  toVersion: number;
}

export interface CompareDocumentHistoryVersionsResult {
  from: DocumentHistoryVersionResult;
  to: DocumentHistoryVersionResult;
}

export interface DocumentHistoryAccessOptions {
  historySince?: Date;
}

export interface DocumentHistoryListItem {
  isCurrent: boolean;
  savedAt: Date;
  saveSource: DocumentHistorySaveSource;
  storageKind: DocumentHistoryStorageKind;
  version: number;
}

export interface DocumentHistoryVersionResult {
  editorData: Record<string, any>;
  isCurrent: boolean;
  savedAt: Date;
  saveSource: DocumentHistorySaveSource;
  version: number;
}

export interface GetDocumentHistoryVersionParams {
  documentId: string;
  version: number;
}

export interface ListDocumentHistoryParams {
  beforeVersion?: number;
  documentId: string;
  includeCurrent?: boolean;
  limit?: number;
}

export interface ListDocumentHistoryResult {
  headVersion: number;
  items: DocumentHistoryListItem[];
  nextBeforeVersion?: number;
}

export type DatabaseLike = LobeChatDatabase | Transaction;

export interface HistoryRowReference {
  baseVersion: number | null;
  documentId: string;
  payload: unknown;
  storageKind: string;
  version: number;
}

export interface PersistedDocumentHistory {
  baseVersion: number | null;
  documentId: string;
  id?: string;
  payload: JsonPatchDelta | Record<string, any>;
  savedAt: Date;
  saveSource: DocumentHistorySaveSource;
  storageKind: Exclude<DocumentHistoryStorageKind, 'head'>;
  version: number;
}

export interface ResolvedHistoryVersion {
  editorData: Record<string, any>;
  version: number;
}

export interface RewriteDocumentHistoryOptions {
  dryRun?: boolean;
  forceRewrite?: boolean;
  limit?: number;
}

export interface RewriteDocumentHistoryResult {
  afterPatchCount: number;
  afterSnapshotCount: number;
  beforePatchCount: number;
  beforeSnapshotCount: number;
  documentId: string;
  retainedRows: number;
  rewritten: boolean;
  trimmedRows: number;
}

export interface VersionedUpdateDocumentParams {
  content?: string;
  editorData?: Record<string, any>;
  fileType?: string;
  metadata?: Record<string, any>;
  parentId?: string | null;
  restoreFromVersion?: number;
  saveSource?: DocumentHistorySaveSource;
  title?: string;
}

export interface VersionedUpdateDocumentResult {
  historyAppended: boolean;
  id: string;
  version: number;
}
