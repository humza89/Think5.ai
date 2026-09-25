/**
 * Messaging service (Phase 0 T8): the only place that knows how
 * conversations and messages are stored. Routes, the legacy adapter and the
 * SSE stream call this. Dependencies are injected so unit tests run against
 * an in-memory db and a fake profile lookup.
 */
import type { MessageProvider } from "@/lib/contracts/messaging";
import {
  conversationKey,
  messageState,
  roleForProfile,
  type ConversationSummary,
  type CreateConversationInput,
  type ListMessagesQuery,
  type MessageDTO,
  type MessagesPage,
  type ParticipantRole,
  type SendMessageInput,
} from "./contract";
import { InAppMessageProvider, type MessageTable, type StoredMessage } from "./in-app-provider";

export interface Actor {
  id: string;
  email: string;
  role: string;
  tenantId?: string | null;
}

export interface ProfileRecord {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
}

export type ProfileLookup = (query: { ids?: string[]; emails?: string[] }) => Promise<ProfileRecord[]>;

export interface ConversationRow {
  id: string;
  participantAId: string;
  participantARole: string;
  participantBId: string;
  participantBRole: string;
  tenantId: string | null;
  lastMessageAt: Date | null;
  lastMessage: string | null;
}

export interface MessagingDb {
  conversation: {
    findUnique(args: { where: { id: string } }): Promise<ConversationRow | null>;
    findMany(args: { where: { OR: Array<{ participantAId: string } | { participantBId: string }> }; orderBy: unknown }): Promise<ConversationRow[]>;
    upsert(args: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<ConversationRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<ConversationRow>;
  };
  message: MessageTable & {
    findMany(args: { where: Record<string, unknown>; orderBy: unknown; take: number }): Promise<StoredMessage[]>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
}

export interface MessagingDeps {
  db: MessagingDb;
  profiles: ProfileLookup;
  provider?: MessageProvider;
  /** Called after a send so live listeners (SSE) can wake up. */
  publish?: (recipientId: string, messageId: string) => Promise<void>;
  /** T16: usage ledger emit for `message.sent` (idempotent on the message id; never throws). */
  recordUsage?: (input: MessageUsageInput) => Promise<unknown>;
  now?: () => Date;
  newId?: () => string;
}

export interface MessageUsageInput {
  id: string;
  tenantId: string | null | undefined;
  kind: "message.sent";
  quantity: number;
  subjectId: string;
  source: string;
  occurredAt: Date;
  metadata: Record<string, string>;
}

export class MessagingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MessagingError";
  }
}

function participantOf(conv: ConversationRow, actorId: string): { id: string; role: ParticipantRole } {
  if (conv.participantAId === actorId) return { id: conv.participantBId, role: conv.participantBRole as ParticipantRole };
  return { id: conv.participantAId, role: conv.participantARole as ParticipantRole };
}

function isParticipant(conv: ConversationRow, actorId: string): boolean {
  return conv.participantAId === actorId || conv.participantBId === actorId;
}

function displayName(profile: ProfileRecord | undefined, role: ParticipantRole): string {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (profile?.email) return profile.email;
  return role === "CANDIDATE" ? "Candidate" : "Recruiter";
}

async function requireConversation(deps: MessagingDeps, actor: Actor, conversationId: string): Promise<ConversationRow> {
  const conv = await deps.db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new MessagingError("Conversation not found", 404);
  if (!isParticipant(conv, actor.id)) throw new MessagingError("Forbidden: not a participant", 403);
  return conv;
}

export async function listConversations(actor: Actor, deps: MessagingDeps): Promise<ConversationSummary[]> {
  const rows = await deps.db.conversation.findMany({
    where: { OR: [{ participantAId: actor.id }, { participantBId: actor.id }] },
    orderBy: { lastMessageAt: "desc" },
  });
  if (rows.length === 0) return [];
  const otherIds = rows.map((c) => participantOf(c, actor.id).id);
  const profiles = await deps.profiles({ ids: otherIds });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const summaries: ConversationSummary[] = [];
  for (const conv of rows) {
    const other = participantOf(conv, actor.id);
    const profile = byId.get(other.id);
    const unreadCount = await deps.db.message.count({ where: { conversationId: conv.id, recipientId: actor.id, read: false } });
    summaries.push({
      id: conv.id,
      participant: { id: other.id, role: other.role, name: displayName(profile, other.role), email: profile?.email ?? null },
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
      unreadCount,
      tenantId: conv.tenantId,
    });
  }
  return summaries;
}

export async function getOrCreateConversation(actor: Actor, input: CreateConversationInput, deps: MessagingDeps): Promise<ConversationSummary> {
  let other: ProfileRecord | undefined;
  if (input.participantId) {
    other = (await deps.profiles({ ids: [input.participantId] }))[0];
  } else if (input.participantEmail) {
    other = (await deps.profiles({ emails: [input.participantEmail.toLowerCase()] }))[0];
  }
  if (!other) throw new MessagingError("Participant not found", 404);
  if (other.id === actor.id) throw new MessagingError("Cannot start a conversation with yourself", 400);

  const id = conversationKey(actor.id, other.id);
  const [aId, bId] = [actor.id, other.id].sort();
  const roleOf = (userId: string) => (userId === actor.id ? roleForProfile(actor.role) : roleForProfile(other!.role));
  const conv = await deps.db.conversation.upsert({
    where: { id },
    create: {
      id,
      participantAId: aId,
      participantARole: roleOf(aId),
      participantBId: bId,
      participantBRole: roleOf(bId),
      tenantId: actor.tenantId ?? null,
    },
    update: {},
  });
  const otherRole = participantOf(conv, actor.id).role;
  const unreadCount = await deps.db.message.count({ where: { conversationId: conv.id, recipientId: actor.id, read: false } });
  return {
    id: conv.id,
    participant: { id: other.id, role: otherRole, name: displayName(other, otherRole), email: other.email ?? null },
    lastMessage: conv.lastMessage,
    lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
    unreadCount,
    tenantId: conv.tenantId,
  };
}

function toDTO(m: StoredMessage, actorId: string): MessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderRole: m.senderRole,
    content: m.content,
    createdAt: new Date(m.createdAt).toISOString(),
    deliveredAt: m.deliveredAt ? new Date(m.deliveredAt).toISOString() : null,
    readAt: m.readAt ? new Date(m.readAt).toISOString() : null,
    state: messageState(m),
    isOwn: m.senderId === actorId,
  };
}

/** Newest page first (`take` newest before `cursor`), returned oldest→newest for rendering. */
export async function listMessages(actor: Actor, conversationId: string, query: ListMessagesQuery, deps: MessagingDeps): Promise<MessagesPage> {
  await requireConversation(deps, actor, conversationId);
  const where: Record<string, unknown> = { conversationId };
  if (query.cursor) where.createdAt = { lt: new Date(query.cursor) };
  const rows = await deps.db.message.findMany({ where, orderBy: { createdAt: "desc" }, take: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const nextCursor = rows.length > query.limit && page.length > 0 ? new Date(page[page.length - 1].createdAt).toISOString() : null;

  // Delivery receipt: the recipient's client has now fetched these.
  const now = (deps.now ?? (() => new Date()))();
  const undelivered = page.filter((m) => m.recipientId === actor.id && !m.deliveredAt);
  if (undelivered.length > 0) {
    await deps.db.message.updateMany({ where: { id: { in: undelivered.map((m) => m.id) }, deliveredAt: null }, data: { deliveredAt: now } });
    for (const m of undelivered) m.deliveredAt = now;
  }
  return { messages: page.reverse().map((m) => toDTO(m, actor.id)), nextCursor };
}

export async function sendMessage(actor: Actor, conversationId: string, input: SendMessageInput, deps: MessagingDeps): Promise<MessageDTO> {
  const conv = await requireConversation(deps, actor, conversationId);
  const other = participantOf(conv, actor.id);
  const provider = deps.provider ?? new InAppMessageProvider(deps.db.message);
  const id = input.clientMessageId ? `${conversationId}:${input.clientMessageId}` : (deps.newId ?? (() => crypto.randomUUID()))();
  const result = await provider.send({
    id,
    tenantId: conv.tenantId ?? actor.tenantId ?? "unscoped",
    channel: "in_app",
    to: { userId: other.id },
    body: input.content,
    metadata: {
      conversationId,
      senderId: actor.id,
      senderRole: roleForProfile(actor.role),
      recipientRole: other.role,
    },
  });
  const stored = await deps.db.message.findUnique({ where: { id: result.providerId } });
  if (!stored) throw new MessagingError("Message was not stored", 500);
  if (!result.deduplicated) {
    await deps.db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: stored.createdAt, lastMessage: stored.content } });
    if (deps.publish) await deps.publish(other.id, stored.id).catch(() => {});
    if (deps.recordUsage) {
      await deps
        .recordUsage({
          id: `message:${stored.id}:sent`,
          tenantId: conv.tenantId ?? actor.tenantId,
          kind: "message.sent",
          quantity: 1,
          subjectId: stored.id,
          source: "messaging.send",
          occurredAt: stored.createdAt,
          metadata: { conversationId, senderRole: roleForProfile(actor.role) },
        })
        .catch(() => {});
    }
  }
  return toDTO(stored, actor.id);
}

export async function markConversationRead(actor: Actor, conversationId: string, deps: MessagingDeps): Promise<{ marked: number }> {
  await requireConversation(deps, actor, conversationId);
  const now = (deps.now ?? (() => new Date()))();
  const result = await deps.db.message.updateMany({
    where: { conversationId, recipientId: actor.id, read: false },
    data: { read: true, readAt: now, deliveredAt: now },
  });
  return { marked: result.count };
}
