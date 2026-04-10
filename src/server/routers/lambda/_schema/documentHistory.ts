import { z } from 'zod';

export const documentHistorySaveSourceSchema = z.enum(['autosave', 'manual', 'restore', 'system']);
export const documentHistoryStorageKindSchema = z.enum(['snapshot', 'patch', 'head']);

export const listDocumentHistoryInputSchema = z.object({
  beforeVersion: z.number().optional(),
  documentId: z.string(),
  includeCurrent: z.boolean().optional(),
  limit: z.number().optional(),
});

export const getDocumentHistoryVersionInputSchema = z.object({
  documentId: z.string(),
  version: z.number(),
});

export const compareDocumentHistoryVersionsInputSchema = z.object({
  documentId: z.string(),
  fromVersion: z.number(),
  toVersion: z.number(),
});

export const updateDocumentInputSchema = z.object({
  content: z.string().optional(),
  editorData: z.string().optional(),
  fileType: z.string().optional(),
  id: z.string(),
  metadata: z.record(z.any()).optional(),
  parentId: z.string().nullable().optional(),
  restoreFromVersion: z.number().optional(),
  saveSource: documentHistorySaveSourceSchema.optional(),
  title: z.string().optional(),
});

export interface DocumentHistoryListItem {
  isCurrent: boolean;
  savedAt: string;
  saveSource: DocumentHistorySaveSource;
  storageKind: DocumentHistoryStorageKind;
  version: number;
}

export interface ListHistoryOutput {
  headVersion: number;
  items: DocumentHistoryListItem[];
  nextBeforeVersion?: number;
}

export interface GetHistoryVersionOutput {
  editorData: Record<string, any>;
  isCurrent: boolean;
  savedAt: string;
  saveSource: DocumentHistorySaveSource;
  version: number;
}

export interface CompareHistoryVersionState {
  editorData: Record<string, any>;
  isCurrent: boolean;
  savedAt: string;
  version: number;
}

export interface CompareHistoryVersionsOutput {
  from: CompareHistoryVersionState;
  to: CompareHistoryVersionState;
}

export interface UpdateDocumentOutput {
  historyAppended: boolean;
  id: string;
  version: number;
}

export interface ListHistoryInput {
  beforeVersion?: number;
  documentId: string;
  includeCurrent?: boolean;
  limit?: number;
}

export interface GetHistoryVersionInput {
  documentId: string;
  version: number;
}

export interface CompareHistoryVersionsInput {
  documentId: string;
  fromVersion: number;
  toVersion: number;
}

export interface UpdateDocumentInput {
  content?: string;
  editorData?: string;
  fileType?: string;
  id: string;
  metadata?: Record<string, any>;
  parentId?: string | null;
  restoreFromVersion?: number;
  saveSource?: DocumentHistorySaveSource;
  title?: string;
}

export interface DocumentHistoryRouterService {
  compareDocumentHistoryVersions: (
    params: CompareHistoryVersionsInput,
  ) => Promise<CompareHistoryVersionsOutput>;
  getDocumentHistoryVersion: (params: GetHistoryVersionInput) => Promise<GetHistoryVersionOutput>;
  listDocumentHistory: (params: ListHistoryInput) => Promise<ListHistoryOutput>;
  updateDocument: (
    id: string,
    params: Omit<UpdateDocumentInput, 'id'>,
  ) => Promise<UpdateDocumentOutput>;
}

export type DocumentHistorySaveSource = z.infer<typeof documentHistorySaveSourceSchema>;
export type DocumentHistoryStorageKind = z.infer<typeof documentHistoryStorageKindSchema>;
