/**
 * Durable Job: Webhook Retry (Phase 0 T7)
 *
 * Consumes "webhook/retry" events scheduled by lib/webhook-delivery.ts with
 * a 1 / 5 / 30 minute backoff (the event's `ts` is the delivery time). The
 * attempt re-signs the payload and, on failure, schedules the next attempt
 * itself, so a retry chain survives process restarts and deploys.
 */

import { inngest } from "../client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const webhookRetry = inngest.createFunction(
  {
    id: "webhook/retry",
    retries: 2,
    triggers: [{ event: "webhook/retry" }],
  },
  async ({ event, step }: any) => {
    const { endpointId, url, secret, payload, attempt } = event.data as {
      endpointId: string;
      url: string;
      secret: string;
      payload: string;
      attempt: number;
    };

    await step.run(`deliver-attempt-${attempt}`, async () => {
      const { attemptDelivery } = await import("@/lib/webhook-delivery");
      await attemptDelivery(endpointId, url, secret, payload, attempt);
    });

    return { endpointId, attempt, status: "attempted" };
  }
);
