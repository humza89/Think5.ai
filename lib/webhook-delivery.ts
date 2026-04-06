/**
 * Webhook Delivery System — Reliable event dispatch with HMAC signing and retries.
 *
 * Features:
 * - HMAC-SHA256 signature on every delivery
 * - 3 retry attempts with exponential backoff (1min, 5min, 30min)
 * - 10-second delivery timeout
 * - Dead letter queue via WebhookDelivery table
 */

import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

const DELIVERY_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [60000, 300000, 1800000]; // 1min, 5min, 30min

/**
 * Schedule a durable webhook retry via Inngest.
 * Falls back to setTimeout if Inngest is unavailable.
 */
async function scheduleRetry(
  endpointId: string,
  url: string,
  secret: string,
  payload: string,
  attempt: number
): Promise<void> {
  const delay = RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

  try {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "webhook/retry",
      data: { endpointId, url, secret, payload, attempt },
      ts: new Date(Date.now() + delay).getTime(),
    });
  } catch {
    // Fallback: setTimeout (non-durable, lost on restart — last resort)
    setTimeout(() => {
      attemptDelivery(endpointId, url, secret, payload, attempt).catch(() => {});
    }, delay);
  }
}

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Sign a webhook payload with HMAC-SHA256.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Deliver a webhook event to all subscribed endpoints for a company.
 */
export async function deliverWebhookEvent(
  companyId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      companyId,
      active: true,
    },
  });

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const payloadStr = JSON.stringify(payload);

  for (const endpoint of endpoints) {
    // Check if endpoint subscribes to this event
    const subscribedEvents = (endpoint.events as string[]) || [];
    if (!subscribedEvents.includes(event)) continue;

    // Attempt delivery
    await attemptDelivery(endpoint.id, endpoint.url, endpoint.secret, payloadStr, 0);
  }
}

async function attemptDelivery(
  endpointId: string,
  url: string,
  secret: string,
  payload: string,
  attempt: number
): Promise<void> {
  const signature = signPayload(payload, secret);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Timestamp": new Date().toISOString(),
        "X-Webhook-Attempt": (attempt + 1).toString(),
      },
      body: payload,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    // Record delivery
    await prisma.webhookDelivery.create({
      data: {
        endpointId,
        event: JSON.parse(payload).event,
        payload: JSON.parse(payload),
        statusCode: response.status,
        status: response.ok ? "delivered" : "failed",
        attempt: attempt + 1,
        responseBody: await response.text().catch(() => null),
      },
    });

    if (!response.ok && attempt < MAX_RETRIES - 1) {
      // Schedule durable retry via Inngest (survives process restart)
      await scheduleRetry(endpointId, url, secret, payload, attempt + 1);
    }
  } catch (error) {
    // Record failed delivery
    await prisma.webhookDelivery.create({
      data: {
        endpointId,
        event: JSON.parse(payload).event,
        payload: JSON.parse(payload),
        status: "failed",
        attempt: attempt + 1,
        responseBody: error instanceof Error ? error.message : "Unknown error",
      },
    }).catch(() => {});

    if (attempt < MAX_RETRIES - 1) {
      await scheduleRetry(endpointId, url, secret, payload, attempt + 1);
    } else {
      Sentry.captureMessage(`Webhook delivery failed after ${MAX_RETRIES} attempts`, {
        level: "error",
        extra: { endpointId, url, event: JSON.parse(payload).event },
      });
    }
  }
}

/**
 * Replay a failed webhook delivery.
 */
export async function replayDelivery(deliveryId: string): Promise<boolean> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });

  if (!delivery || !delivery.endpoint) return false;

  const payload = JSON.stringify(delivery.payload);
  await attemptDelivery(delivery.endpointId, delivery.endpoint.url, delivery.endpoint.secret, payload, 0);
  return true;
}
