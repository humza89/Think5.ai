/**
 * Soft-delete enforcement for Candidate, Interview and InterviewReport
 * (Phase 0 T6). These three models carry `deletedAt`; the preservation
 * manifest lists them as the soft-deletable set.
 *
 * The rules are pure functions (`softDeleteRewrite`) so they can be unit
 * tested without a database, and `withSoftDelete(client)` wires them into a
 * Prisma client extension:
 *
 * - reads (`findMany`, `findFirst`, `findFirstOrThrow`, `count`, `aggregate`,
 *   `groupBy`) add `deletedAt: null` to `where`;
 * - `findUnique` / `findUniqueOrThrow` become `findFirst` / `findFirstOrThrow`
 *   with the same filter (a unique `where` cannot carry an extra column);
 * - `delete` / `deleteMany` become `update` / `updateMany` that set `deletedAt`;
 * - passing `includeDeleted: true` in the args bypasses the read filter for
 *   that call (the flag is stripped before Prisma sees it).
 *
 * Nested relation reads (`include: { interviews: true }`) are not filtered by
 * query extensions; callers that render nested lists filter explicitly. Legal
 * hard deletes (retention purge, DSAR) use `prismaRaw` from `lib/prisma`.
 */

export const SOFT_DELETE_MODELS = ["Candidate", "Interview", "InterviewReport"] as const;
export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

const READ_OPERATIONS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const UNIQUE_READS: Record<string, string> = { findUnique: "findFirst", findUniqueOrThrow: "findFirstOrThrow" };
const DELETES: Record<string, string> = { delete: "update", deleteMany: "updateMany" };

export interface RewriteResult {
  operation: string;
  args: Record<string, unknown>;
}

export function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}

/**
 * Returns the operation and args Prisma should actually run. `now` is
 * injectable so tests are deterministic.
 */
export function softDeleteRewrite(
  model: string,
  operation: string,
  rawArgs: Record<string, unknown> | undefined,
  now: () => Date = () => new Date(),
): RewriteResult {
  const args: Record<string, unknown> = { ...(rawArgs ?? {}) };
  if (!isSoftDeleteModel(model)) return { operation, args };

  const includeDeleted = args.includeDeleted === true;
  delete args.includeDeleted;

  if (READ_OPERATIONS.has(operation) || operation in UNIQUE_READS) {
    const next = UNIQUE_READS[operation] ?? operation;
    if (!includeDeleted) {
      const where = (args.where as Record<string, unknown> | undefined) ?? {};
      args.where = "deletedAt" in where ? where : { ...where, deletedAt: null };
    }
    return { operation: next, args };
  }

  if (operation in DELETES) {
    const data = { deletedAt: now() };
    return { operation: DELETES[operation], args: { ...args, data } };
  }

  return { operation, args };
}

interface QueryContext {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Wires `softDeleteRewrite` into a Prisma client. Kept structurally typed so
 * the mock database used without DATABASE_URL (which has no `$extends`) can
 * simply be passed through.
 */
export function withSoftDelete<T extends { $extends?: (ext: unknown) => unknown }>(client: T, now?: () => Date): T {
  if (typeof client.$extends !== "function") return client;
  const extended = client.$extends({
    name: "soft-delete",
    query: {
      $allModels: {
        async $allOperations(ctx: QueryContext) {
          const model = ctx.model ?? "";
          const { operation, args } = softDeleteRewrite(model, ctx.operation, ctx.args, now);
          if (operation === ctx.operation) return ctx.query(args);
          // Operation changed (findUnique → findFirst, delete → update):
          // dispatch through the model delegate on the extended client.
          const delegate = (extended as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[
            model.charAt(0).toLowerCase() + model.slice(1)
          ];
          return delegate[operation](args);
        },
      },
    },
  }) as T;
  return extended;
}
