/**
 * Webhook Dispatch System
 *
 * Dispatches events to registered webhook endpoints with HMAC-SHA256
 * signature verification and retry logic.
 */

import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { logger } from "@/lib/logger";

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch webhooks for a given event to all active endpoints for a company.
 * Fire-and-forget — does not throw on failure.
 */
export async function dispatchWebhooks(
  event: string,
  companyId: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        companyId,
        isActive: true,
      },
    });

    const matching = endpoints.filter((ep: any) => {
      const events = ep.events as string[];
      return Array.isArray(events) && events.includes(event);
    });

    if (matching.length === 0) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    await Promise.allSettled(
      matching.map((endpoint: any) => deliverWebhook(endpoint, payload))
    );
  } catch (err) {
    logger.error("[Webhook] Failed to dispatch webhooks", { error: err });
  }
}

async function deliverWebhook(
  endpoint: { id: string; url: string; secret: string },
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", endpoint.secret)
    .update(body)
    .digest("hex");

  const maxAttempts = 3;
  const backoffMs = [1000, 2000, 4000];
  let lastError: string | null = null;
  let statusCode: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Event": payload.event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      statusCode = res.status;

      if (res.ok) {
        await prisma.webhookDelivery.create({
          data: {
            endpointId: endpoint.id,
            event: payload.event,
            payload: payload as any,
            statusCode,
            attempts: attempt + 1,
          },
        });
        return;
      }

      lastError = `HTTP ${res.status}: ${await res.text().catch(() => "Unknown error")}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
    }
  }

  // Log failed delivery
  await prisma.webhookDelivery
    .create({
      data: {
        endpointId: endpoint.id,
        event: payload.event,
        payload: payload as any,
        statusCode,
        attempts: maxAttempts,
        lastError,
      },
    })
    .catch(() => {});
}
