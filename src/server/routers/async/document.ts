import { z } from 'zod';

import { asyncAuthedProcedure, asyncRouter as router } from '@/libs/trpc/async';
import { DocumentService } from '@/server/services/document';

const documentProcedure = asyncAuthedProcedure.use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      documentService: new DocumentService(ctx.serverDB, ctx.userId),
    },
  });
});

export const documentRouter = router({
  compactHistory: documentProcedure
    .input(
      z.object({
        documentId: z.string(),
        limit: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.documentService.compactDocumentHistory(input.documentId, input.limit);

      return { success: true };
    }),
});
