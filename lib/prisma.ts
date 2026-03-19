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
