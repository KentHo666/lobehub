import { type DocumentItem } from '@lobechat/database/schemas';

import { lambdaClient } from '@/libs/trpc/client';
import type {
  CompareHistoryVersionsInput,
  CompareHistoryVersionsOutput,
  GetHistoryVersionInput,
  GetHistoryVersionOutput,
  ListHistoryInput,
  ListHistoryOutput,
  UpdateDocumentInput,
  UpdateDocumentOutput,
} from '@/server/routers/lambda/_schema/documentHistory';

import { abortableRequest } from '../utils/abortableRequest';

const serializeSavedAt = (savedAt: Date | string) =>
  savedAt instanceof Date ? savedAt.toISOString() : savedAt;

type SerializedSavedAt<T extends { savedAt: Date | string }> = Omit<T, 'savedAt'> & {
  savedAt: string;
};

const serializeHistoryTimestamp = <T extends { savedAt: Date | string }>(
  result: T,
): SerializedSavedAt<T> => ({
  ...result,
  savedAt: serializeSavedAt(result.savedAt),
});

const serializeHistoryList = <
  T extends {
    headVersion: number;
    items: Array<{
      isCurrent: boolean;
      saveSource: ListHistoryOutput['items'][number]['saveSource'];
      savedAt: Date | string;
      storageKind: ListHistoryOutput['items'][number]['storageKind'];
      version: number;
    }>;
    nextBeforeVersion?: number;
  },
>(
  result: T,
): ListHistoryOutput => ({
  ...result,
  items: result.items.map((item) => ({
    ...item,
    savedAt: serializeSavedAt(item.savedAt),
  })),
});

const serializeHistoryVersion = <
  T extends {
    editorData: GetHistoryVersionOutput['editorData'];
    isCurrent: boolean;
    saveSource: GetHistoryVersionOutput['saveSource'];
    savedAt: Date | string;
    version: number;
  },
>(
  result: T,
): GetHistoryVersionOutput => serializeHistoryTimestamp(result);

const serializeHistoryComparison = <
  T extends {
    from: {
      editorData: CompareHistoryVersionsOutput['from']['editorData'];
      isCurrent: boolean;
      savedAt: Date | string;
      version: number;
    };
    to: {
      editorData: CompareHistoryVersionsOutput['to']['editorData'];
      isCurrent: boolean;
      savedAt: Date | string;
      version: number;
    };
  },
>(
  result: T,
): CompareHistoryVersionsOutput => ({
  from: serializeHistoryTimestamp(result.from),
  to: serializeHistoryTimestamp(result.to),
});

export interface CreateDocumentParams {
  content?: string;
  editorData: string;
  fileType?: string;
  knowledgeBaseId?: string;
  metadata?: Record<string, any>;
  parentId?: string;
  slug?: string;
  title: string;
}

export interface ListDocumentHistoryParams extends ListHistoryInput {}

export interface GetDocumentHistoryVersionParams extends GetHistoryVersionInput {}

export interface CompareDocumentHistoryVersionsParams extends CompareHistoryVersionsInput {}

export interface UpdateDocumentParams extends UpdateDocumentInput {}

export interface DocumentHistoryClientSurface {
  compareDocumentHistoryVersions: (
    params: CompareDocumentHistoryVersionsParams,
  ) => Promise<CompareHistoryVersionsOutput>;
  getDocumentHistoryVersion: (
    params: GetDocumentHistoryVersionParams,
    uniqueKey?: string,
  ) => Promise<GetHistoryVersionOutput>;
  listDocumentHistory: (params: ListDocumentHistoryParams) => Promise<ListHistoryOutput>;
  updateDocument: (params: UpdateDocumentParams) => Promise<UpdateDocumentOutput>;
}

export class DocumentService {
  async createDocument(params: CreateDocumentParams): Promise<DocumentItem> {
    return lambdaClient.document.createDocument.mutate(params);
  }

  async createDocuments(documents: CreateDocumentParams[]): Promise<DocumentItem[]> {
    return lambdaClient.document.createDocuments.mutate({ documents });
  }

  async queryDocuments(params?: {
    current?: number;
    fileTypes?: string[];
    pageSize?: number;
    sourceTypes?: string[];
  }): Promise<{ items: DocumentItem[]; total: number }> {
    return lambdaClient.document.queryDocuments.query(params);
  }

  async listDocumentHistory(params: ListDocumentHistoryParams): Promise<ListHistoryOutput> {
    const result = await lambdaClient.document.listDocumentHistory.query(params);

    return serializeHistoryList(result);
  }

  async getDocumentHistoryVersion(
    params: GetDocumentHistoryVersionParams,
    uniqueKey?: string,
  ): Promise<GetHistoryVersionOutput> {
    if (uniqueKey) {
      return abortableRequest.execute(uniqueKey, async (signal) => {
        const result = await lambdaClient.document.getDocumentHistoryVersion.query(params, {
          signal,
        });

        return serializeHistoryVersion(result);
      });
    }

    const result = await lambdaClient.document.getDocumentHistoryVersion.query(params);

    return serializeHistoryVersion(result);
  }

  async compareDocumentHistoryVersions(
    params: CompareDocumentHistoryVersionsParams,
  ): Promise<CompareHistoryVersionsOutput> {
    const result = await lambdaClient.document.compareDocumentHistoryVersions.query(params);

    return serializeHistoryComparison(result);
  }

  async getDocumentById(id: string, uniqueKey?: string): Promise<DocumentItem | undefined> {
    if (uniqueKey) {
      // Use fixed key so switching documents cancels the previous request
      // This prevents race conditions where old document's data overwrites new document's editor
      return abortableRequest.execute(uniqueKey, async (signal) =>
        lambdaClient.document.getDocumentById.query({ id }, { signal }),
      );
    }

    return lambdaClient.document.getDocumentById.query({ id });
  }

  async deleteDocument(id: string): Promise<void> {
    await lambdaClient.document.deleteDocument.mutate({ id });
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    await lambdaClient.document.deleteDocuments.mutate({ ids });
  }

  async updateDocument(params: UpdateDocumentParams): Promise<UpdateDocumentOutput> {
    return lambdaClient.document.updateDocument.mutate(params);
  }
}

export const documentService = new DocumentService() as DocumentService &
  DocumentHistoryClientSurface;
