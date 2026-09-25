import { beforeEach, describe, expect, it } from "vitest";
import {
  getOrCreateConversation,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  MessagingError,
  type Actor,
  type ConversationRow,
  type MessagingDb,
  type ProfileRecord,
} from "@/lib/messaging/service";
import { InAppMessageProvider, type StoredMessage } from "@/lib/messaging/in-app-provider";
import { conversationKey } from "@/lib/messaging/contract";
import { runMessageProviderConformance } from "@/lib/contracts/conformance/messaging";

/** In-memory db implementing exactly the query shapes the service uses. */
function fakeDb() {
  const conversations = new Map<string, ConversationRow>();
  const messages = new Map<string, StoredMessage>();
  let clock = Date.parse("2026-09-25T10:00:00.000Z");
  const tick = () => new Date((clock += 1000));
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Record<string, unknown>[]).some((w) => matches(row, w));
      if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(row[k]);
      if (v && typeof v === "object" && "lt" in (v as object)) return (row[k] as Date) < (v as { lt: Date }).lt;
      if (v && typeof v === "object" && "gt" in (v as object)) return (row[k] as Date) > (v as { gt: Date }).gt;
      return row[k] === v;
    });
  const db: MessagingDb = {
    conversation: {
      async findUnique({ where }) { return conversations.get(where.id) ?? null; },
      async findMany({ where }) { return [...conversations.values()].filter((c) => matches(c as never, where as never)).sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0)); },
      async upsert({ where, create }) { const existing = conversations.get(where.id); if (existing) return existing; const row = { tenantId: null, lastMessageAt: null, lastMessage: null, ...(create as object) } as ConversationRow; conversations.set(where.id, row); return row; },
      async update({ where, data }) { const row = { ...conversations.get(where.id)!, ...(data as object) } as ConversationRow; conversations.set(where.id, row); return row; },
    },
    message: {
      async findUnique({ where }) { return messages.get(where.id) ?? null; },
      async create({ data }) { const row = { read: false, readAt: null, deliveredAt: null, createdAt: tick(), ...(data as object) } as StoredMessage; messages.set(row.id, row); return row; },
      async findMany({ where, take }) { return [...messages.values()].filter((m) => matches(m as never, where as never)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take); },
      async updateMany({ where, data }) { let count = 0; for (const m of messages.values()) if (matches(m as never, where as never)) { Object.assign(m, data); count++; } return { count }; },
      async count({ where }) { return [...messages.values()].filter((m) => matches(m as never, where as never)).length; },
    },
  };
  return { db, conversations, messages };
}

const profiles: ProfileRecord[] = [
  { id: "rec-1", email: "riley@think5.test", first_name: "Riley", last_name: "Chen", role: "recruiter" },
  { id: "cand-1", email: "jordan@think5.test", first_name: "Jordan", last_name: "Alvarez", role: "candidate" },
  { id: "cand-2", email: "priya@think5.test", first_name: "Priya", last_name: "N", role: "candidate" },
];
const lookup = async ({ ids, emails }: { ids?: string[]; emails?: string[] }) =>
  profiles.filter((p) => (ids ? ids.includes(p.id) : emails ? emails.includes(p.email!) : false));

const recruiter: Actor = { id: "rec-1", email: "riley@think5.test", role: "recruiter", tenantId: "tenant-1" };
const candidate: Actor = { id: "cand-1", email: "jordan@think5.test", role: "candidate" };
const stranger: Actor = { id: "cand-2", email: "priya@think5.test", role: "candidate" };

describe("messaging service (T8)", () => {
  let store: ReturnType<typeof fakeDb>;
  let deps: { db: MessagingDb; profiles: typeof lookup; published: string[]; publish: (r: string, m: string) => Promise<void> };
  beforeEach(() => {
    store = fakeDb();
    const published: string[] = [];
    deps = { db: store.db, profiles: lookup, published, publish: async (r, m) => { published.push(`${r}:${m}`); } };
  });

  it("create-or-get is idempotent, keyed by the legacy sorted-id convention, and resolves by email", async () => {
    const a = await getOrCreateConversation(recruiter, { participantEmail: "jordan@think5.test" }, deps);
    const b = await getOrCreateConversation(candidate, { participantId: "rec-1" }, deps);
    expect(a.id).toBe(conversationKey("rec-1", "cand-1"));
    expect(b.id).toBe(a.id);
    expect(a.participant).toMatchObject({ id: "cand-1", role: "CANDIDATE", name: "Jordan Alvarez" });
    expect(b.participant).toMatchObject({ id: "rec-1", role: "RECRUITER", name: "Riley Chen" });
    expect(store.conversations.size).toBe(1);
    expect(store.conversations.get(a.id)?.tenantId).toBe("tenant-1");
    await expect(getOrCreateConversation(recruiter, { participantId: "rec-1" }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(getOrCreateConversation(recruiter, { participantId: "nobody" }, deps)).rejects.toMatchObject({ status: 404 });
  });

  it("send stores through the in-app provider, updates the conversation, wakes the recipient and dedupes client ids", async () => {
    const conv = await getOrCreateConversation(recruiter, { participantId: "cand-1" }, deps);
    const m1 = await sendMessage(recruiter, conv.id, { content: "Hello Jordan", clientMessageId: "c1" }, deps);
    const again = await sendMessage(recruiter, conv.id, { content: "Hello Jordan (retry)", clientMessageId: "c1" }, deps);
    expect(m1).toMatchObject({ state: "sent", isOwn: true, senderRole: "RECRUITER" });
    expect(again.id).toBe(m1.id);
    expect(store.messages.size).toBe(1);
    expect(store.conversations.get(conv.id)).toMatchObject({ lastMessage: "Hello Jordan" });
    expect(deps.published).toEqual([`cand-1:${m1.id}`]);
  });

  it("emits one message.sent usage event per stored message and none for a deduplicated retry (T16)", async () => {
    const recorded: Array<{ id: string; kind: string; tenantId: string | null | undefined; subjectId: string }> = [];
    const metered = { ...deps, recordUsage: async (input: { id: string; kind: string; tenantId: string | null | undefined; subjectId: string }) => { recorded.push(input); } };
    const conv = await getOrCreateConversation(recruiter, { participantId: "cand-1" }, metered);
    const m1 = await sendMessage(recruiter, conv.id, { content: "Hello", clientMessageId: "c1" }, metered);
    await sendMessage(recruiter, conv.id, { content: "Hello (retry)", clientMessageId: "c1" }, metered);
    expect(recorded).toEqual([expect.objectContaining({ id: `message:${m1.id}:sent`, kind: "message.sent", tenantId: "tenant-1", subjectId: m1.id })]);
    // A failing ledger write never breaks the send.
    const failing = { ...deps, recordUsage: async () => { throw new Error("ledger down"); } };
    await expect(sendMessage(recruiter, conv.id, { content: "still delivered" }, failing)).resolves.toMatchObject({ state: "sent" });
  });

  it("lists conversations with unread counts, pages messages, and records delivery and read receipts", async () => {
    const conv = await getOrCreateConversation(recruiter, { participantId: "cand-1" }, deps);
    for (let i = 1; i <= 3; i++) await sendMessage(recruiter, conv.id, { content: `m${i}` }, deps);
    const inbox = await listConversations(candidate, deps);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ id: conv.id, unreadCount: 3, lastMessage: "m3", participant: { name: "Riley Chen" } });

    const page1 = await listMessages(candidate, conv.id, { limit: 2 }, deps);
    expect(page1.messages.map((m) => m.content)).toEqual(["m2", "m3"]);
    expect(page1.messages.every((m) => m.state === "delivered" && !m.isOwn)).toBe(true);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listMessages(candidate, conv.id, { cursor: page1.nextCursor!, limit: 2 }, deps);
    expect(page2.messages.map((m) => m.content)).toEqual(["m1"]);
    expect(page2.nextCursor).toBeNull();

    expect(await markConversationRead(candidate, conv.id, deps)).toEqual({ marked: 3 });
    const senderView = await listMessages(recruiter, conv.id, { limit: 10 }, deps);
    expect(senderView.messages.every((m) => m.state === "read" && m.isOwn)).toBe(true);
    expect((await listConversations(candidate, deps))[0].unreadCount).toBe(0);
  });

  it("refuses non-participants and unknown conversations", async () => {
    const conv = await getOrCreateConversation(recruiter, { participantId: "cand-1" }, deps);
    await expect(listMessages(stranger, conv.id, { limit: 10 }, deps)).rejects.toBeInstanceOf(MessagingError);
    await expect(listMessages(stranger, conv.id, { limit: 10 }, deps)).rejects.toMatchObject({ status: 403 });
    await expect(sendMessage(stranger, conv.id, { content: "hi" }, deps)).rejects.toMatchObject({ status: 403 });
    await expect(markConversationRead(stranger, conv.id, deps)).rejects.toMatchObject({ status: 403 });
    await expect(listMessages(recruiter, "missing", { limit: 10 }, deps)).rejects.toMatchObject({ status: 404 });
    expect(await listConversations(stranger, deps)).toEqual([]);
  });
});

describe("InAppMessageProvider conforms to the T0.5 MessageProvider contract", () => {
  it("passes the conformance runner", async () => {
    const violations = await runMessageProviderConformance(() => new InAppMessageProvider(fakeDb().db.message));
    expect(violations).toEqual([]);
  });
});
