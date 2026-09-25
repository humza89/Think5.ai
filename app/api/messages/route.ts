import { NextRequest, NextResponse } from "next/server";
import { createConversationSchema, listMessagesQuerySchema, sendMessageSchema } from "@/lib/messaging/contract";
import { getOrCreateConversation, listConversations, listMessages, sendMessage } from "@/lib/messaging/service";
import { messagingActor, messagingDeps } from "@/lib/messaging/server";
import { messagingErrorResponse } from "../messaging/_handlers";

/**
 * @deprecated Legacy messaging route (Phase 0 T8). Adapter over the canonical
 * contract in lib/messaging; use /api/messaging/conversations instead.
 * Keeps the pre-T8 response shapes for existing callers and adds the new
 * fields alongside them.
 */
const SUNSET = "Sat, 31 Oct 2026 00:00:00 GMT";

function deprecated(response: NextResponse): NextResponse {
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", SUNSET);
  response.headers.set("Link", '</api/messaging/conversations>; rel="successor-version"');
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await messagingActor();
    const deps = messagingDeps();
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    if (conversationId) {
      const query = listMessagesQuerySchema.parse({ limit: 100 });
      const page = await listMessages(actor, conversationId, query, deps);
      return deprecated(NextResponse.json({ messages: page.messages, nextCursor: page.nextCursor, currentUserId: actor.id }));
    }
    const conversations = await listConversations(actor, deps);
    return deprecated(
      NextResponse.json({
        currentUserId: actor.id,
        conversations: conversations.map((c) => ({
          // legacy fields
          conversationId: c.id,
          lastMessage: c.lastMessage,
          lastMessageAt: c.lastMessageAt,
          isRead: c.unreadCount === 0,
          participantId: c.participant.id,
          participantRole: c.participant.role,
          // canonical fields
          id: c.id,
          participantName: c.participant.name,
          unreadCount: c.unreadCount,
          participant: c.participant,
        })),
      }),
    );
  } catch (error) {
    return deprecated(messagingErrorResponse(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await messagingActor();
    const deps = messagingDeps();
    const body = (await request.json().catch(() => ({}))) as { recipientId?: string; content?: string; conversationId?: string };
    let conversationId = body.conversationId;
    if (!conversationId) {
      const parsed = createConversationSchema.safeParse({ participantId: body.recipientId });
      if (!parsed.success) return deprecated(NextResponse.json({ error: "Recipient and content are required" }, { status: 400 }));
      conversationId = (await getOrCreateConversation(actor, parsed.data, deps)).id;
    }
    const parsedMessage = sendMessageSchema.safeParse({ content: body.content });
    if (!parsedMessage.success) return deprecated(NextResponse.json({ error: "Recipient and content are required" }, { status: 400 }));
    const message = await sendMessage(actor, conversationId, parsedMessage.data, deps);
    return deprecated(NextResponse.json({ message }, { status: 201 }));
  } catch (error) {
    return deprecated(messagingErrorResponse(error));
  }
}
