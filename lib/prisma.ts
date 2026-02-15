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
    prismaInstance = globalForPrisma.prisma ?? new PrismaClient();
    if (process.env.NODE_ENV !== "production")
      globalForPrisma.prisma = prismaInstance;
  } catch (error) {
    console.warn("⚠️  Failed to connect to database, using mock database");
    prismaInstance = mockPrisma;
  }
}

export const prisma = prismaInstance;
