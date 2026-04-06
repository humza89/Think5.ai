import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time in-app notifications.
 * Polls the database for new unread notifications and pushes them to the client.
 * Replaces webhook-only notification (recruiters get instant updates).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (!user || !profile) {
      return new Response("Unauthorized", { status: 401 });
    }

    const userId = profile.id;
    const encoder = new TextEncoder();
    let lastCheck = new Date();

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial heartbeat
        controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));

        const interval = setInterval(async () => {
          try {
            // Fetch new notifications since last check
            const notifications = await prisma.notification.findMany({
              where: {
                userId,
                createdAt: { gt: lastCheck },
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            });

            if (notifications.length > 0) {
              lastCheck = new Date();
              for (const notif of notifications) {
                const data = JSON.stringify({
                  id: notif.id,
                  type: notif.type,
                  title: notif.title,
                  message: notif.message,
                  link: notif.link,
                  createdAt: notif.createdAt,
                });
                controller.enqueue(encoder.encode(`event: notification\ndata: ${data}\n\n`));
              }
            }

            // Heartbeat every 30s to keep connection alive
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            // On error, close stream gracefully
            clearInterval(interval);
            controller.close();
          }
        }, 5000); // Check every 5 seconds

        // Clean up on client disconnect
        request.signal.addEventListener("abort", () => {
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("Internal server error", { status: 500 });
  }
}
