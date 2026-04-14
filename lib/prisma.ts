import { PrismaClient } from "@prisma/client";
import { mockPrisma, useMockDb } from "./mock-db";
import { encryptCandidatePII, decryptCandidatePII } from "./pii-encryption";
// Track 5 Task 22: transcript-at-rest encryption (flag-gated).
import { encryptTranscript, decryptInterviewRowOrList } from "./transcript-encryption";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Use mock database if PostgreSQL is not configured
let prismaInstance: any;

if (useMockDb) {
  console.log("📝 Using mock database (PostgreSQL not configured)");
  prismaInstance = mockPrisma;
} else {
  try {
    let dbUrl = process.env.DATABASE_URL;

    if (
      process.env.NODE_ENV === "production" &&
      dbUrl &&
      (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1"))
    ) {
      dbUrl =
        process.env.POSTGRES_PRISMA_URL ||
        process.env.POSTGRES_URL_NON_POOLING ||
        process.env.POSTGRES_URL ||
        dbUrl;
    }

    // Track 6 Task 23: PgBouncer-tuned connection pool.
    // Supabase provides PgBouncer (port 6543, transaction mode). Per-instance
    // pool should be SMALL (default 5) — PgBouncer aggregates across functions.
    // Previous default 10 × 50 concurrent functions = 500 connections, exceeding
    // Supabase's typical 60-connection direct limit. Also:
    //   statement_cache_size=0 → avoids PgBouncer prepared-statement conflicts
    //   pool_timeout=15 → fail fast under pool exhaustion, generous for cold starts
    const poolLimit = process.env.PRISMA_CONNECTION_LIMIT || "5";
    if (dbUrl && !dbUrl.includes("connection_limit")) {
      const sep = dbUrl.includes("?") ? "&" : "?";
      dbUrl += `${sep}connection_limit=${poolLimit}&pool_timeout=15&statement_cache_size=0`;
    }

    prismaInstance = globalForPrisma.prisma ?? new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });

    if (process.env.NODE_ENV !== "production")
      globalForPrisma.prisma = prismaInstance;
  } catch (error) {
    console.warn("⚠️  Failed to connect to database, using mock database");
    prismaInstance = mockPrisma;
  }
}

// ── Middleware: Soft deletes + PII encryption ────────────────────────
const SOFT_DELETE_MODELS = ["Candidate", "Interview", "InterviewReport"];

if (prismaInstance && prismaInstance.$use) {
  // Soft delete middleware: convert delete → update { deletedAt }, auto-filter reads
  prismaInstance.$use(async (params: { model?: string; action: string; args: Record<string, unknown> }, next: (params: unknown) => Promise<unknown>) => {
    const model = params.model;
    if (!model || !SOFT_DELETE_MODELS.includes(model)) return next(params);

    // Convert delete to soft delete
    if (params.action === "delete") {
      params.action = "update";
      params.args.data = { deletedAt: new Date() };
      return next(params);
    }
    if (params.action === "deleteMany") {
      params.action = "updateMany";
      if (!params.args.data) params.args.data = {};
      (params.args.data as Record<string, unknown>).deletedAt = new Date();
      return next(params);
    }

    // Auto-filter soft-deleted records on reads (unless explicitly including them)
    if (["findMany", "findFirst", "findUnique", "count", "aggregate"].includes(params.action)) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      const where = params.args.where as Record<string, unknown>;
      // Don't override if caller explicitly queries deletedAt
      if (where.deletedAt === undefined) {
        where.deletedAt = null;
      }
    }

    return next(params);
  });

  // PII encryption middleware for Candidate model
  prismaInstance.$use(async (params: { model?: string; action: string; args: Record<string, unknown> }, next: (params: unknown) => Promise<unknown>) => {
    if (params.model !== "Candidate") return next(params);

    // Encrypt on write
    if (["create", "update", "upsert"].includes(params.action)) {
      if (params.args.data) {
        params.args.data = encryptCandidatePII(params.args.data as Record<string, unknown>);
      }
      if (params.action === "upsert" && params.args.create) {
        params.args.create = encryptCandidatePII(params.args.create as Record<string, unknown>);
      }
    }

    const result = await next(params);

    // Decrypt on read
    if (result && typeof result === "object") {
      if (Array.isArray(result)) {
        return result.map((r) => (r && typeof r === "object" ? decryptCandidatePII(r as Record<string, unknown>) : r));
      }
      return decryptCandidatePII(result as Record<string, unknown>);
    }

    return result;
  });

  // Track 5 Task 22: Transcript-at-rest encryption middleware for
  // Interview model. Flag-gated via TRANSCRIPT_ENCRYPTION_ENABLED on
  // write; reads always attempt decryption (safe no-op on plaintext).
  prismaInstance.$use(async (params: { model?: string; action: string; args: Record<string, unknown> }, next: (params: unknown) => Promise<unknown>) => {
    if (params.model !== "Interview") return next(params);

    // Encrypt transcript on write paths that include it.
    if (["create", "update", "updateMany", "upsert"].includes(params.action)) {
      const data = params.args.data as Record<string, unknown> | undefined;
      if (data && "transcript" in data) {
        data.transcript = encryptTranscript(data.transcript);
      }
      if (params.action === "upsert") {
        const createData = params.args.create as Record<string, unknown> | undefined;
        if (createData && "transcript" in createData) {
          createData.transcript = encryptTranscript(createData.transcript);
        }
      }
    }

    const result = await next(params);

    // Decrypt transcript on every read path. decryptInterviewRowOrList
    // handles both single-row and array results, and is a no-op when
    // the transcript field is absent from the selected fields.
    return decryptInterviewRowOrList(result);
  });
}

export const prisma = prismaInstance;
