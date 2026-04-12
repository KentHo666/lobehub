import { join } from 'node:path';

import type { LobeChatDatabase } from '@lobechat/database';
import { documentHistories } from '@lobechat/database/schemas';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { eq } from 'drizzle-orm';

interface ScriptOptions {
  all: boolean;
  documentId?: string;
  dryRun: boolean;
  historyId?: string;
  limit: number;
}

interface RewriteTarget {
  documentId: string;
  userId: string;
}

interface RewriteSummary {
  afterPatchCount: number;
  afterSnapshotCount: number;
  beforePatchCount: number;
  beforeSnapshotCount: number;
  documentId: string;
  retainedRows: number;
  rewritten: boolean;
  trimmedRows: number;
  userId: string;
}

const loadEnv = () => {
  const env = process.env.NODE_ENV || 'development';

  dotenvExpand.expand(dotenv.config({ path: join(process.cwd(), '.env') }));
  dotenvExpand.expand(dotenv.config({ override: true, path: join(process.cwd(), `.env.${env}`) }));
  dotenvExpand.expand(
    dotenv.config({ override: true, path: join(process.cwd(), `.env.${env}.local`) }),
  );
};

const parseArgs = (): ScriptOptions | null => {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  bun run db:document-history:rewrite -- [options]

Options:
  --document-id <id>    Rewrite history for one document
  --history-id <id>     Rewrite history for the document owning one history row
  --all                 Rewrite history for all documents with document history
  --limit <number>      Retained history limit during rewrite (default: 100)
  --dry-run             Preview the rewrite summary without writing data
  --help, -h            Show this help message

Examples:
  bun run db:document-history:rewrite -- --document-id docs_xxx
  bun run db:document-history:rewrite -- --history-id 7Z3eOvAC3jAYKq70UD
  bun run db:document-history:rewrite -- --all --dry-run
`);
    return null;
  }

  const getArgValue = (flag: string): string | undefined => {
    const index = args.indexOf(flag);

    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
  };

  const all = args.includes('--all');
  const documentId = getArgValue('--document-id');
  const historyId = getArgValue('--history-id');
  const dryRun = args.includes('--dry-run');
  const rawLimit = getArgValue('--limit');
  const limit = rawLimit ? Number(rawLimit) : 100;

  const modeCount = [all, Boolean(documentId), Boolean(historyId)].filter(Boolean).length;
  if (modeCount !== 1) {
    console.error('Error: exactly one of --all, --document-id, or --history-id must be provided.');
    process.exit(1);
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    console.error('Error: --limit must be a positive integer.');
    process.exit(1);
  }

  return { all, documentId, dryRun, historyId, limit };
};

const resolveTargets = async (
  db: LobeChatDatabase,
  options: ScriptOptions,
): Promise<RewriteTarget[]> => {
  if (options.historyId) {
    const row = await db.query.documentHistories.findFirst({
      where: eq(documentHistories.id, options.historyId),
    });

    if (!row) {
      throw new Error(`History row not found: ${options.historyId}`);
    }

    return [{ documentId: row.documentId, userId: row.userId }];
  }

  if (options.documentId) {
    const row = await db.query.documentHistories.findFirst({
      where: eq(documentHistories.documentId, options.documentId),
    });

    if (!row) {
      throw new Error(`Document history not found: ${options.documentId}`);
    }

    return [{ documentId: row.documentId, userId: row.userId }];
  }

  return db
    .selectDistinct({
      documentId: documentHistories.documentId,
      userId: documentHistories.userId,
    })
    .from(documentHistories);
};

const printSummary = (summary: RewriteSummary) => {
  console.log(
    [
      `document=${summary.documentId}`,
      `user=${summary.userId}`,
      `retained=${summary.retainedRows}`,
      `trimmed=${summary.trimmedRows}`,
      `before=snapshot:${summary.beforeSnapshotCount},patch:${summary.beforePatchCount}`,
      `after=snapshot:${summary.afterSnapshotCount},patch:${summary.afterPatchCount}`,
      `rewritten=${summary.rewritten}`,
    ].join(' | '),
  );
};

const main = async () => {
  loadEnv();

  const options = parseArgs();
  if (!options) return;

  const [{ serverDB }, { DocumentHistoryService }] = await Promise.all([
    import('../packages/database/src/server'),
    import('../src/server/services/document/history'),
  ]);

  const targets = await resolveTargets(serverDB, options);

  if (targets.length === 0) {
    console.log('No document history rows found.');
    return;
  }

  console.log(
    `Starting document history rewrite for ${targets.length} document(s). dryRun=${options.dryRun} limit=${options.limit}`,
  );

  const summaries: RewriteSummary[] = [];

  for (const [index, target] of targets.entries()) {
    console.log(`[${index + 1}/${targets.length}] Processing ${target.documentId}`);

    const result = await serverDB.transaction(async (tx) => {
      const historyService = new DocumentHistoryService(
        tx as unknown as LobeChatDatabase,
        target.userId,
      );

      return historyService.rebuildHistory(target.documentId, options.limit, {
        dryRun: options.dryRun,
      });
    });

    const summary: RewriteSummary = { ...result, userId: target.userId };
    summaries.push(summary);
    printSummary(summary);
  }

  const aggregate = summaries.reduce(
    (result, summary) => {
      result.afterPatchCount += summary.afterPatchCount;
      result.afterSnapshotCount += summary.afterSnapshotCount;
      result.beforePatchCount += summary.beforePatchCount;
      result.beforeSnapshotCount += summary.beforeSnapshotCount;
      result.retainedRows += summary.retainedRows;
      result.rewrittenCount += summary.rewritten ? 1 : 0;
      result.trimmedRows += summary.trimmedRows;

      return result;
    },
    {
      afterPatchCount: 0,
      afterSnapshotCount: 0,
      beforePatchCount: 0,
      beforeSnapshotCount: 0,
      retainedRows: 0,
      rewrittenCount: 0,
      trimmedRows: 0,
    },
  );

  console.log('\nSummary');
  console.log(`documents=${summaries.length}`);
  console.log(`rewritten=${aggregate.rewrittenCount}`);
  console.log(`retainedRows=${aggregate.retainedRows}`);
  console.log(`trimmedRows=${aggregate.trimmedRows}`);
  console.log(
    `before=snapshot:${aggregate.beforeSnapshotCount},patch:${aggregate.beforePatchCount}`,
  );
  console.log(`after=snapshot:${aggregate.afterSnapshotCount},patch:${aggregate.afterPatchCount}`);
};

main().catch((error) => {
  console.error('Document history rewrite failed:', error);
  process.exit(1);
});
