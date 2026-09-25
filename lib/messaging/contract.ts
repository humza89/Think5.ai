/**
 * Canonical messaging contract (Phase 0 T8).
 *
 * One conversation per participant pair; messages carry a delivery state
 * (`sent` → `delivered` when the recipient's client fetched it → `read`
 * when the recipient opened the conversation). The legacy `/api/messages`
 * route is an adapter over this contract.
 */
import { z } from "zod";

export const PARTICIPANT_ROLES = ["RECRUITER", "CANDIDATE"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type MessageState = "sent" | "delivered" | "read";

export const createConversationSchema = z
  .object({
    participantId: z.string().min(1).optional(),
    participantEmail: z.string().email().optional(),
  })
  .refine((v) => Boolean(v.participantId || v.participantEmail), { message: "participantId or participantEmail is required" });
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "content is required").max(4000),
  /** Optional idempotency key chosen by the client (retries never duplicate). */
  clientMessageId: z.string().min(1).max(64).optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = z.object({
  /** ISO timestamp; returns messages created before it (older page). */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export interface ConversationParticipant {
  id: string;
  role: ParticipantRole;
  name: string;
  email: string | null;
}

export interface ConversationSummary {
  id: string;
  participant: ConversationParticipant;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  tenantId: string | null;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  content: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  state: MessageState;
  isOwn: boolean;
}

export interface MessagesPage {
  messages: MessageDTO[];
  nextCursor: string | null;
}

/** Legacy key: sorted participant ids joined by "-". Conversation.id uses it. */
export function conversationKey(a: string, b: string): string {
  return [a, b].sort().join("-");
}

export function messageState(m: { read: boolean; deliveredAt: Date | string | null }): MessageState {
  if (m.read) return "read";
  if (m.deliveredAt) return "delivered";
  return "sent";
}

export function roleForProfile(role: string | null | undefined): ParticipantRole {
  return role === "candidate" ? "CANDIDATE" : "RECRUITER";
}
