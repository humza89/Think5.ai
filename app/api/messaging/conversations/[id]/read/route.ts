import { NextRequest, NextResponse } from "next/server";
import { markConversationRead } from "@/lib/messaging/service";
import { messagingActor, messagingDeps } from "@/lib/messaging/server";
import { messagingErrorResponse } from "../../../_handlers";

/** POST: read receipt for every message addressed to the caller in the conversation. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await messagingActor();
    const result = await markConversationRead(actor, id, messagingDeps());
    return NextResponse.json(result);
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
