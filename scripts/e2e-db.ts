/**
 * Builds the ephemeral E2E database in the same order production evolved:
 *
 *   1. `prisma db push` creates the Prisma-managed tables (the tracked Prisma
 *      migration history does not start at init, so `migrate deploy` cannot
 *      bootstrap an empty database).
 *   2. `supabase/migrations/*.sql` are applied in filename order. Migrations
 *      from 20240105 onwards ALTER Prisma tables, which is why they must run
 *      after step 1. Step 2 is skipped when `public.profiles` already exists,
 *      so re-running locally stays safe (run `npx supabase db reset` to rebuild).
 *
 * Refuses to run against a non-local database host unless
 * E2E_SEED_ALLOW_REMOTE=true is set explicitly.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to build the E2E database`);
  return value;
}

const databaseUrl = requireEnv("DATABASE_URL");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal"]);
const dbHost = new URL(databaseUrl).hostname;
if (!LOCAL_HOSTS.has(dbHost) && process.env.E2E_SEED_ALLOW_REMOTE !== "true") {
  throw new Error(
    `Refusing to build schema on non-local database host "${dbHost}". ` +
      "Set E2E_SEED_ALLOW_REMOTE=true only for a dedicated non-production database.",
  );
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function prisma(args: string[]): void {
  execFileSync(npx, ["prisma", ...args], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: process.env.DIRECT_URL ?? databaseUrl },
  });
}

/**
 * Prisma's `@updatedAt` columns are NOT NULL with no database default: the
 * client fills them. The SQL migrations were written when production tables
 * still carried the migration's own `DEFAULT CURRENT_TIMESTAMP`, and some of
 * them insert seed rows (for example the default RetentionPolicy) without an
 * `updatedAt` value. Restore that default here so those statements behave as
 * they did in production. The application never relies on it.
 */
async function restoreUpdatedAtDefaults(): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const columns = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'updatedAt'
        AND column_default IS NULL
        AND data_type LIKE 'timestamp%'
    `;
    for (const { table_name } of columns) {
      await client.$executeRawUnsafe(
        `ALTER TABLE "public"."${table_name.replace(/"/g, '""')}" ALTER COLUMN "updatedAt" SET DEFAULT now()`,
      );
    }
    console.log(`[e2e:db]   restored updatedAt defaults on ${columns.length} tables`);
  } finally {
    await client.$disconnect();
  }
}

async function profilesTableExists(): Promise<boolean> {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const rows = await client.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.profiles') IS NOT NULL AS "exists"
    `;
    return rows[0]?.exists === true;
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  console.log("[e2e:db] 1/2 prisma db push");
  prisma(["db", "push", "--skip-generate"]);
  await restoreUpdatedAtDefaults();

  if (await profilesTableExists()) {
    console.log("[e2e:db] 2/2 supabase migrations already applied (public.profiles exists); skipping");
    return;
  }

  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  console.log(`[e2e:db] 2/2 applying ${files.length} supabase migrations`);
  for (const name of files) {
    console.log(`[e2e:db]   ${name}`);
    prisma(["db", "execute", "--url", databaseUrl, "--file", path.join(dir, name)]);
  }
}

main().catch((error: unknown) => {
  console.error("[e2e:db] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
