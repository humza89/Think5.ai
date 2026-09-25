import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { messagingActor } from "@/lib/messaging/server";
import { checkNewNotifications } from "@/lib/notification-pubsub";
import { messagingErrorResponse } from "../_handlers";

export const dynamic = "force-dynamic";

const POLL_MS = 3000;
const MAX_STREAM_MS = 55_000; // stay under serverless limits; EventSource reconnects

/**
 * GET: Server-Sent Events for the caller's inbox (T8). Wakes on the Redis
 * pubsub marker published by sendMessage when Redis is configured and falls
 * back to a light database poll otherwise. Emits `message` events with the
 * ids the client should refetch, plus heartbeats.
 */
export async function GET(request: NextRequest) {
  let actorId: string;
  try {
    actorId = (await messagingActor()).id;
  } catch (error) {
    return messagingErrorResponse(error);
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let since = new Date(Number(request.nextUrl.searchParams.get("since")) || Date.now());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      controller.enqueue(encoder.encode("retry: 1500\n\n"));
      send("ready", { since: since.toISOString() });
      const timer = setInterval(async () => {
        try {
          if (Date.now() - startedAt > MAX_STREAM_MS || request.signal.aborted) {
            clearInterval(timer);
            controller.close();
            return;
          }
          const markers = await checkNewNotifications(actorId, since.getTime());
          const fromRedis = markers.filter((m) => m.startsWith("msg:")).map((m) => m.slice(4));
          const rows = await prisma.message.findMany({
            where: { recipientId: actorId, createdAt: { gt: since } },
            select: { id: true, conversationId: true, createdAt: true },
            orderBy: { createdAt: "asc" },
            take: 50,
          });
          if (rows.length > 0 || fromRedis.length > 0) {
            const ids = new Set<string>([...fromRedis, ...rows.map((r: { id: string }) => r.id)]);
            send("message", { messageIds: [...ids], conversationIds: [...new Set(rows.map((r: { conversationId: string }) => r.conversationId))] });
            if (rows.length > 0) since = new Date(rows[rows.length - 1].createdAt);
            else since = new Date();
          } else {
            send("heartbeat", { at: new Date().toISOString() });
          }
        } catch {
          // keep the stream alive; the next tick retries
        }
      }, POLL_MS);
      request.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
