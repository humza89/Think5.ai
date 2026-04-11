/**
 * Track 2 Task 9 correctness tests for lib/finalization-idempotency.ts.
 *
 * The contract under test:
 *   1. Happy path runs the work and stores the result.
 *   2. Retry with the same key returns the cached result without
 *      re-running the work.
 *   3. A concurrent race where two workers try to insert the same key
 *      produces the LOSER reading back the winner's result (via the
 *      Prisma P2002 unique-violation branch).
 *   4. Header validation rejects malformed keys.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Prisma mock with P2002 race simulator ---------------------------

interface FakeAttempt {
  interviewId: string;
  idempotencyKey: string;
  responseBody: unknown;
  responseStatus: number;
}

const attempts: FakeAttempt[] = [];

class PrismaClientKnownRequestError extends Error {
  code: string;
  clientVersion: string;
  constructor(message: string, opts: { code: string; clientVersion: string }) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = opts.code;
    this.clientVersion = opts.clientVersion;
  }
}

vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError,
  },
}));

// Tests can toggle this to simulate a lost race (P2002 on insert).
let nextCreateShouldRace = false;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewFinalizationAttempt: {
      findUnique: async (args: {
        where: { interviewId_idempotencyKey: { interviewId: string; idempotencyKey: string } };
      }) => {
        const { interviewId, idempotencyKey } = args.where.interviewId_idempotencyKey;
        return (
          attempts.find(
            (a) => a.interviewId === interviewId && a.idempotencyKey === idempotencyKey,
          ) ?? null
        );
      },
      create: async (args: {
        data: {
          interviewId: string;
          idempotencyKey: string;
          responseBody: unknown;
          responseStatus: number;
        };
      }) => {
        // Race simulator: first call throws P2002 as if a concurrent
        // worker committed first, then we seed the canonical row.
        if (nextCreateShouldRace) {
          nextCreateShouldRace = false;
          attempts.push({
            interviewId: args.data.interviewId,
            idempotencyKey: args.data.idempotencyKey,
            responseBody: { canonical: true, winner: "concurrent-worker" },
            responseStatus: 200,
          });
          throw new PrismaClientKnownRequestError("unique violation", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const existing = attempts.find(
          (a) =>
            a.interviewId === args.data.interviewId &&
            a.idempotencyKey === args.data.idempotencyKey,
        );
        if (existing) {
          throw new PrismaClientKnownRequestError("unique violation", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        attempts.push(args.data);
        return args.data;
      },
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  attempts.length = 0;
  nextCreateShouldRace = false;
  vi.resetModules();
});

// --- Tests -----------------------------------------------------------

describe("withIdempotentFinalization — happy path", () => {
  it("runs fn and stores the result on the first call", async () => {
    const { withIdempotentFinalization } = await import("@/lib/finalization-idempotency");
    const fn = vi.fn(async () => ({
      body: { ok: true, ts: 1 },
      status: 200,
    }));
    const result = await withIdempotentFinalization("iv-1", "key-abcdef", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(result.body).toEqual({ ok: true, ts: 1 });
    expect(result.status).toBe(200);
    expect(attempts).toHaveLength(1);
  });
});

describe("withIdempotentFinalization — retry with same key", () => {
  it("returns the cached result without running fn again", async () => {
    const { withIdempotentFinalization } = await import("@/lib/finalization-idempotency");

    const firstFn = vi.fn(async () => ({
      body: { ok: true, version: "v1" },
      status: 200,
    }));
    await withIdempotentFinalization("iv-1", "key-abcdef", firstFn);

    const retryFn = vi.fn(async () => ({
      body: { ok: true, version: "v2" }, // would be different!
      status: 500, // would be different!
    }));
    const retry = await withIdempotentFinalization("iv-1", "key-abcdef", retryFn);

    expect(retryFn).not.toHaveBeenCalled();
    expect(retry.fromCache).toBe(true);
    expect(retry.body).toEqual({ ok: true, version: "v1" }); // first result wins
    expect(retry.status).toBe(200);
  });

  it("different keys produce independent cache entries", async () => {
    const { withIdempotentFinalization } = await import("@/lib/finalization-idempotency");

    await withIdempotentFinalization("iv-1", "key-aaaaaa1", async () => ({
      body: { which: "first" },
      status: 200,
    }));
    const second = await withIdempotentFinalization("iv-1", "key-bbbbbb2", async () => ({
      body: { which: "second" },
      status: 200,
    }));

    expect(second.fromCache).toBe(false);
    expect(second.body).toEqual({ which: "second" });
    expect(attempts).toHaveLength(2);
  });
});

describe("withIdempotentFinalization — concurrent race (P2002)", () => {
  it("loser reads back the canonical result when the create throws P2002", async () => {
    const { withIdempotentFinalization } = await import("@/lib/finalization-idempotency");
    nextCreateShouldRace = true;

    const fn = vi.fn(async () => ({
      body: { which: "loser" },
      status: 200,
    }));
    const result = await withIdempotentFinalization("iv-1", "key-concurrent", fn);

    expect(fn).toHaveBeenCalledTimes(1); // the loser still ran its work
    expect(result.fromCache).toBe(true); // but the response is the canonical one
    expect(result.body).toEqual({ canonical: true, winner: "concurrent-worker" });
  });
});

describe("extractIdempotencyKey — header validation", () => {
  it("returns null when header is absent", async () => {
    const { extractIdempotencyKey } = await import("@/lib/finalization-idempotency");
    const headers = new Headers();
    expect(extractIdempotencyKey(headers)).toBeNull();
  });

  it("accepts a well-formed UUID-like key", async () => {
    const { extractIdempotencyKey } = await import("@/lib/finalization-idempotency");
    const headers = new Headers({
      "idempotency-key": "abcd1234-efgh-5678-ijkl-mnopqrstuvwx",
    });
    expect(extractIdempotencyKey(headers)).toBe("abcd1234-efgh-5678-ijkl-mnopqrstuvwx");
  });

  it("accepts capital Idempotency-Key header", async () => {
    const { extractIdempotencyKey } = await import("@/lib/finalization-idempotency");
    const headers = new Headers({ "Idempotency-Key": "abcdef12" });
    expect(extractIdempotencyKey(headers)).toBe("abcdef12");
  });

  it("rejects keys shorter than 8 chars", async () => {
    const { extractIdempotencyKey, InvalidIdempotencyKeyError } = await import(
      "@/lib/finalization-idempotency"
    );
    const headers = new Headers({ "idempotency-key": "short" });
    expect(() => extractIdempotencyKey(headers)).toThrow(InvalidIdempotencyKeyError);
  });

  it("rejects keys containing invalid characters", async () => {
    const { extractIdempotencyKey } = await import("@/lib/finalization-idempotency");
    const headers = new Headers({ "idempotency-key": "has spaces!!" });
    expect(() => extractIdempotencyKey(headers)).toThrow();
  });

  it("rejects keys longer than 128 chars", async () => {
    const { extractIdempotencyKey } = await import("@/lib/finalization-idempotency");
    const headers = new Headers({ "idempotency-key": "a".repeat(129) });
    expect(() => extractIdempotencyKey(headers)).toThrow();
  });
});
