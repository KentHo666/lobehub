import { and, desc, eq, lt } from 'drizzle-orm';

import type { DocumentHistoryItem, NewDocumentHistory } from '../schemas';
import { documentHistories } from '../schemas';
import type { LobeChatDatabase } from '../type';

export interface QueryDocumentHistoryParams {
  beforeVersion?: number;
  documentId: string;
  limit?: number;
}

export class DocumentHistoryModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  create = async (params: Omit<NewDocumentHistory, 'userId'>): Promise<DocumentHistoryItem> => {
    const [result] = await this.db
      .insert(documentHistories)
      .values({ ...params, userId: this.userId })
      .returning();

    return result!;
  };

  delete = async (id: string) => {
    return this.db
      .delete(documentHistories)
      .where(and(eq(documentHistories.id, id), eq(documentHistories.userId, this.userId)));
  };

  deleteByDocumentId = async (documentId: string) => {
    return this.db
      .delete(documentHistories)
      .where(
        and(
          eq(documentHistories.documentId, documentId),
          eq(documentHistories.userId, this.userId),
        ),
      );
  };

  deleteAll = async () => {
    return this.db.delete(documentHistories).where(eq(documentHistories.userId, this.userId));
  };

  findById = async (id: string): Promise<DocumentHistoryItem | undefined> => {
    const [result] = await this.db
      .select()
      .from(documentHistories)
      .where(and(eq(documentHistories.id, id), eq(documentHistories.userId, this.userId)))
      .limit(1);

    return result;
  };

  findByDocumentIdAndVersion = async (
    documentId: string,
    version: number,
  ): Promise<DocumentHistoryItem | undefined> => {
    const [result] = await this.db
      .select()
      .from(documentHistories)
      .where(
        and(
          eq(documentHistories.documentId, documentId),
          eq(documentHistories.version, version),
          eq(documentHistories.userId, this.userId),
        ),
      )
      .limit(1);

    return result;
  };

  findLatestByDocumentId = async (documentId: string): Promise<DocumentHistoryItem | undefined> => {
    const [result] = await this.db
      .select()
      .from(documentHistories)
      .where(
        and(
          eq(documentHistories.documentId, documentId),
          eq(documentHistories.userId, this.userId),
        ),
      )
      .orderBy(desc(documentHistories.version))
      .limit(1);

    return result;
  };

  list = async ({
    beforeVersion,
    documentId,
    limit = 50,
  }: QueryDocumentHistoryParams): Promise<DocumentHistoryItem[]> => {
    const conditions = [
      eq(documentHistories.documentId, documentId),
      eq(documentHistories.userId, this.userId),
    ];

    if (beforeVersion !== undefined) {
      conditions.push(lt(documentHistories.version, beforeVersion));
    }

    return this.db
      .select()
      .from(documentHistories)
      .where(and(...conditions))
      .orderBy(
        desc(documentHistories.savedAt),
        desc(documentHistories.version),
        desc(documentHistories.id),
      )
      .limit(limit);
  };

  query = async (params: QueryDocumentHistoryParams): Promise<DocumentHistoryItem[]> => {
    return this.list(params);
  };

  listByDocumentId = async (documentId: string, limit = 50): Promise<DocumentHistoryItem[]> => {
    return this.list({ documentId, limit });
  };
}
