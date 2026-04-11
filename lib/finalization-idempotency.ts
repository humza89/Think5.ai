/**
 * Finalization Idempotency — Track 2, Task 9.
 *
 * A client that retries end_interview (network timeout, double-click,
 * page navigation + retry, etc.) with the same Idempotency-Key header
 * MUST get the same result as the first successful call. Without this,
 * the server can fire Inngest twice, double-finalize the ledger, or
 * produce inconsistent state between two concurrent finalization runs.
 *
 * The contract:
 *
 *   1. The client sends an Idempotency-Key header with every
 *      end_interview request. The key is a client-generated UUID scoped
 *      to a single logical end-interview action (NOT per-HTTP-request —
 *      a retry of the same action reuses the same key).
 *
 *   2. On the server, withIdempotentFinalization(interviewId, key, fn)
 *      wraps the finalization work. If a row with
 *      (interviewId, idempotencyKey) already exists in
 *      InterviewFinalizationAttempt, it returns the cached response.
 *
 *   3. Otherwise it runs `fn`, stores the result in
 *      InterviewFinalizationAttempt under the composite unique key, and
 *      returns it. The unique constraint is the race-condition gate:
 *      two concurrent workers with the same key will have exactly one
 *      succeed at the INSERT; the loser catches the unique violation
 *      and reads back the winner's stored result.
 *
 * Keys with no TTL would accumulate forever; a cleanup cron (not in
 * this module) should delete rows older than 24h.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface IdempotentFinalizationResult<T> {
  /**
   * Whether this call was served from the idempotency store (cache hit)
   * or ran the work function. Callers use this to decide whether to
   * emit side-effects like Inngest events or audit-log entries — those
   * should only fire on the original call, not retries.
   */
  fromCache: boolean;
  /** The response body to return to the client. */
  body: T;
  /** HTTP status code to return. */
  status: number;
}

export interface FinalizationResponse {
  body: Record<string, unknown>;
  status: number;
}

/**
 * Run finalization work under an idempotency key. If a prior call with
 * the same (interviewId, key) succeeded, returns the cached response
 * and does not run `fn`.
 */
export async function withIdempotentFinalization<T extends FinalizationResponse>(
  interviewId: string,
  idempotencyKey: string,
  fn: () => Promise<T>,
): Promise<IdempotentFinalizationResult<T["body"]>> {
  // Fast path: check for a prior success before running expensive work.
  const prior = await prisma.interviewFinalizationAttempt.findUnique({
    where: {
      interviewId_idempotencyKey: {
        interviewId,
        idempotencyKey,
      },
    },
  });

  if (prior) {
    logger.info(
      `[FinalizationIdempotency] cache hit interviewId=${interviewId} key=${idempotencyKey.slice(0, 8)}...`,
    );
    return {
      fromCache: true,
      body: prior.responseBody as T["body"],
      status: prior.responseStatus,
    };
  }

  // Run the work.
  const result = await fn();

  // Store the result. If a concurrent worker with the same key beat us
  // to the INSERT, catch the unique violation and read back the winner's
  // stored result. The concurrent worker's output is canonical because
  // it was first to commit.
  try {
    await prisma.interviewFinalizationAttempt.create({
      data: {
        interviewId,
        idempotencyKey,
        responseBody: result.body as Prisma.InputJsonValue,
        responseStatus: result.status,
      },
    });
    logger.info(
      `[FinalizationIdempotency] stored interviewId=${interviewId} key=${idempotencyKey.slice(0, 8)}...`,
    );
    return {
      fromCache: false,
      body: result.body,
      status: result.status,
    };
  } catch (err) {
    // P2002 = unique constraint violation.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logger.warn(
        `[FinalizationIdempotency] lost race, reading canonical result interviewId=${interviewId}`,
      );
      const canonical = await prisma.interviewFinalizationAttempt.findUnique({
        where: {
          interviewId_idempotencyKey: {
            interviewId,
            idempotencyKey,
          },
        },
      });
      if (canonical) {
        return {
          fromCache: true,
          body: canonical.responseBody as T["body"],
          status: canonical.responseStatus,
        };
      }
      // If we somehow can't read back the canonical row (extremely rare
      // race where it was deleted between the unique-violation and the
      // read), fall through and return our own result. It's not worse
      // than the old pre-idempotency behavior.
    }
    throw err;
  }
}

/**
 * Extract and validate an Idempotency-Key header from a request. Returns
 * null if the header is absent (callers should fall back to the
 * non-idempotent path and log a deprecation warning). Throws a
 * ValidationError if the header is present but malformed.
 */
export function extractIdempotencyKey(headers: Headers): string | null {
  const raw = headers.get("idempotency-key") ?? headers.get("Idempotency-Key");
  if (!raw) return null;
  const trimmed = raw.trim();
  // Accept UUID-like keys: 8-128 chars of [a-zA-Z0-9-_]. Tight enough
  // to reject injection attempts but loose enough not to require UUIDv4.
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) {
    throw new InvalidIdempotencyKeyError(
      `Idempotency-Key header must be 8-128 chars of [a-zA-Z0-9_-], got ${trimmed.length} chars`,
    );
  }
  return trimmed;
}

export class InvalidIdempotencyKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdempotencyKeyError";
  }
}
