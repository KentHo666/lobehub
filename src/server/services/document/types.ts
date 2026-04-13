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
