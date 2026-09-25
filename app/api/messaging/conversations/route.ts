import { NextRequest, NextResponse } from "next/server";
import { createConversationSchema } from "@/lib/messaging/contract";
import { getOrCreateConversation, listConversations } from "@/lib/messaging/service";
import { messagingActor, messagingDeps } from "@/lib/messaging/server";
import { messagingErrorResponse } from "../_handlers";

/** GET: conversations the caller participates in, newest activity first. */
export async function GET() {
  try {
    const actor = await messagingActor();
    const conversations = await listConversations(actor, messagingDeps());
    return NextResponse.json({ conversations, currentUserId: actor.id });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}

/** POST: create-or-get the conversation with a participant (by id or email). */
export async function POST(request: NextRequest) {
  try {
    const actor = await messagingActor();
    const parsed = createConversationSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
    const conversation = await getOrCreateConversation(actor, parsed.data, messagingDeps());
    return NextResponse.json({ conversation }, { status: 200 });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
