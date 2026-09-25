import fs from "node:fs";
import { test, expect, BrowserContext } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T8: recruiter starts a conversation with the seeded candidate by email,
 * sends a message; the candidate sees it (delivered), replies; the
 * recruiter marks it read; both pages render the thread. Cleaned up at the
 * end so later captures are unaffected.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const recruiterStorage = process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);
const candidateStorage = process.env.E2E_CANDIDATE_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.candidate) ? STORAGE_STATE_PATHS.candidate : undefined);

async function csrf(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from storage state");
  return { "x-csrf-token": cookie.value, "Content-Type": "application/json" };
}

test("recruiter and candidate exchange messages through the canonical contract", async ({ browser }) => {
  test.skip(!fixturesRequired && !(recruiterStorage && candidateStorage), "requires both storage states");
  test.setTimeout(120_000);
  const recruiter = await browser.newContext({ storageState: recruiterStorage! });
  const candidate = await browser.newContext({ storageState: candidateStorage! });
  let conversationId: string | null = null;
  try {
    const rh = await csrf(recruiter);
    const created = await recruiter.request.post("/api/messaging/conversations", { headers: rh, data: { participantEmail: E2E_FIXTURES.candidate.email } });
    expect(created.status(), "create-or-get by email").toBe(200);
    const { conversation } = (await created.json()) as { conversation: { id: string; participant: { name: string } } };
    conversationId = conversation.id;
    expect(conversation.participant.name).toBe(E2E_FIXTURES.candidate.fullName);

    const sent = await recruiter.request.post(`/api/messaging/conversations/${conversationId}/messages`, { headers: rh, data: { content: "Hi Jordan, are you free Thursday?", clientMessageId: "e2e-1" } });
    expect(sent.status(), "send").toBe(201);
    const retry = await recruiter.request.post(`/api/messaging/conversations/${conversationId}/messages`, { headers: rh, data: { content: "duplicate", clientMessageId: "e2e-1" } });
    expect(((await retry.json()) as { message: { id: string } }).message.id).toBe(((await sent.json()) as { message: { id: string } }).message.id);

    const inbox = await candidate.request.get("/api/messaging/conversations");
    expect(inbox.status()).toBe(200);
    const list = (await inbox.json()) as { conversations: Array<{ id: string; unreadCount: number; participant: { name: string } }> };
    const mine = list.conversations.find((c) => c.id === conversationId);
    expect(mine, "candidate sees the conversation").toBeTruthy();
    expect(mine!.unreadCount).toBe(1);
    expect(mine!.participant.name).toBe(E2E_FIXTURES.recruiter.name);

    const thread = await candidate.request.get(`/api/messaging/conversations/${conversationId}/messages`);
    const page = (await thread.json()) as { messages: Array<{ content: string; state: string; isOwn: boolean }> };
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]).toMatchObject({ content: "Hi Jordan, are you free Thursday?", state: "delivered", isOwn: false });

    const ch = await csrf(candidate);
    const reply = await candidate.request.post(`/api/messaging/conversations/${conversationId}/messages`, { headers: ch, data: { content: "Thursday works." } });
    expect(reply.status()).toBe(201);
    const read = await candidate.request.post(`/api/messaging/conversations/${conversationId}/read`, { headers: ch, data: {} });
    expect(((await read.json()) as { marked: number }).marked).toBe(1);

    const recruiterThread = await recruiter.request.get(`/api/messaging/conversations/${conversationId}/messages`);
    const rt = (await recruiterThread.json()) as { messages: Array<{ content: string; state: string; isOwn: boolean }> };
    expect(rt.messages.map((m) => [m.content, m.state, m.isOwn])).toEqual([
      ["Hi Jordan, are you free Thursday?", "read", true],
      ["Thursday works.", "delivered", false],
    ]);

    // Legacy adapter still answers, with deprecation headers.
    const legacy = await recruiter.request.get("/api/messages");
    expect(legacy.status()).toBe(200);
    expect(legacy.headers()["deprecation"]).toBe("true");
    expect(((await legacy.json()) as { conversations: Array<{ conversationId: string; participantName: string }> }).conversations.some((c) => c.conversationId === conversationId)).toBe(true);

    // Pages render the thread.
    const rp = await recruiter.newPage();
    await rp.goto("/messaging", { waitUntil: "domcontentloaded" });
    await expect(rp.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await rp.getByText(E2E_FIXTURES.candidate.fullName).first().click();
    await expect(rp.getByText("Thursday works.")).toBeVisible({ timeout: 30_000 });
    const cp = await candidate.newPage();
    await cp.goto("/candidate/messaging", { waitUntil: "domcontentloaded" });
    await expect(cp.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await cp.getByText(E2E_FIXTURES.recruiter.name).first().click();
    await expect(cp.getByText("Hi Jordan, are you free Thursday?")).toBeVisible({ timeout: 30_000 });
  } finally {
    if (conversationId && process.env.DATABASE_URL) {
      const { PrismaClient } = await import("@prisma/client");
      const raw = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      try {
        await raw.message.deleteMany({ where: { conversationId } });
        await raw.conversation.deleteMany({ where: { id: conversationId } });
      } finally {
        await raw.$disconnect();
      }
    }
    await recruiter.close();
    await candidate.close();
  }
});
