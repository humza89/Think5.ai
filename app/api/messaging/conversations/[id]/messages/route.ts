import { NextRequest, NextResponse } from "next/server";
import { listMessagesQuerySchema, sendMessageSchema } from "@/lib/messaging/contract";
import { listMessages, sendMessage } from "@/lib/messaging/service";
import { messagingActor, messagingDeps } from "@/lib/messaging/server";
import { messagingErrorResponse } from "../../../_handlers";

/** GET: paginated messages (?cursor=<ISO>&limit=50), oldest→newest within the page. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await messagingActor();
    const parsed = listMessagesQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
    const page = await listMessages(actor, id, parsed.data, messagingDeps());
    return NextResponse.json({ ...page, currentUserId: actor.id });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}

/** POST: send a message in the conversation. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await messagingActor();
    const parsed = sendMessageSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
    const message = await sendMessage(actor, id, parsed.data, messagingDeps());
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
