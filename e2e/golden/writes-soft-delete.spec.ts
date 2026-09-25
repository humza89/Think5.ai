import fs from "node:fs";
import { test, expect, BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T6: soft delete is enforced by the application Prisma client.
 * A recruiter deletes a candidate through the real API; the row must stay in
 * Postgres with deletedAt set, vanish from application reads, and be restored
 * at the end so later captures are unaffected.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);
const candidateId = E2E_FIXTURES.ids.candidateC; // Samuel Okafor: no interviews, safe to delete

async function csrfHeader(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from storage state");
  return { "x-csrf-token": cookie.value };
}

test("deleting a candidate soft-deletes the row and hides it from reads", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  test.skip(!process.env.DATABASE_URL, "requires DATABASE_URL to inspect the row");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  const raw = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const before = await context.request.get(`/api/candidates/${candidateId}`);
    expect(before.status(), "candidate visible before delete").toBe(200);

    const del = await context.request.delete(`/api/candidates/${candidateId}`, { headers: await csrfHeader(context) });
    expect(del.status(), "DELETE /api/candidates/[id]").toBe(200);

    const row = await raw.candidate.findUnique({ where: { id: candidateId } });
    expect(row, "row still exists in Postgres").not.toBeNull();
    expect(row?.deletedAt, "deletedAt is set").not.toBeNull();

    const after = await context.request.get(`/api/candidates/${candidateId}`);
    expect(after.status(), "soft-deleted candidate is not readable").toBe(404);

    const list = await context.request.get(`/api/candidates`);
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { candidates?: Array<{ id: string }> } | Array<{ id: string }>;
    const ids = (Array.isArray(body) ? body : (body.candidates ?? [])).map((c) => c.id);
    expect(ids, "soft-deleted candidate is excluded from lists").not.toContain(candidateId);
  } finally {
    await raw.candidate.update({ where: { id: candidateId }, data: { deletedAt: null } });
    await raw.$disconnect();
    await context.close();
  }
});
