import { PrismaClient } from "@prisma/client";
import { mockPrisma, useMockDb } from "./mock-db";

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

export const prisma = prismaInstance;
