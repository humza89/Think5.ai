import { beforeEach, describe, expect, it, vi } from "vitest";

const attemptDelivery = vi.fn();
const send = vi.fn();
const create = vi.fn();
vi.mock("@/lib/webhook-delivery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/webhook-delivery")>("@/lib/webhook-delivery");
  return { ...actual, attemptDelivery: (...a: unknown[]) => attemptDelivery(...a) };
});
vi.mock("@/inngest/client", () => ({ inngest: { send: (...a: unknown[]) => send(...a), createFunction: (cfg: unknown, fn: unknown) => ({ cfg, fn }) } }));
vi.mock("@/lib/prisma", () => ({ prisma: { webhookDelivery: { create: (...a: unknown[]) => create(...a) } } }));

import { webhookRetry } from "@/inngest/functions/webhook-retry";
import { scheduleRetry } from "@/lib/webhook-delivery";

describe("webhookRetry Inngest function (T7)", () => {
  beforeEach(() => {
    attemptDelivery.mockReset();
    send.mockReset();
    create.mockReset();
  });

  it("is registered on the webhook/retry event and re-attempts delivery through a step", async () => {
    const { cfg, fn } = webhookRetry as unknown as { cfg: { id: string; triggers: Array<{ event: string }> }; fn: (ctx: unknown) => Promise<unknown> };
    expect(cfg.id).toBe("webhook/retry");
    expect(cfg.triggers).toEqual([{ event: "webhook/retry" }]);
    const step = { run: vi.fn(async (_name: string, cb: () => Promise<unknown>) => cb()) };
    const result = await fn({ event: { data: { endpointId: "ep-1", url: "https://hook.test", secret: "s", payload: "{}", attempt: 2 } }, step });
    expect(step.run).toHaveBeenCalledWith("deliver-attempt-2", expect.any(Function));
    expect(attemptDelivery).toHaveBeenCalledWith("ep-1", "https://hook.test", "s", "{}", 2);
    expect(result).toEqual({ endpointId: "ep-1", attempt: 2, status: "attempted" });
  });

  it("scheduleRetry enqueues a delayed webhook/retry event with the 1/5/30 minute ladder", async () => {
    const now = Date.now();
    send.mockResolvedValue({});
    await scheduleRetry("ep-1", "https://hook.test", "s", "{}", 1);
    await scheduleRetry("ep-1", "https://hook.test", "s", "{}", 3);
    const first = send.mock.calls[0][0];
    const third = send.mock.calls[1][0];
    expect(first.name).toBe("webhook/retry");
    expect(first.ts - now).toBeGreaterThanOrEqual(60_000 - 50);
    expect(third.ts - now).toBeGreaterThanOrEqual(1_800_000 - 50);
  });

  it("records the failure durably instead of falling back to setTimeout when the event cannot be enqueued", async () => {
    send.mockRejectedValue(new Error("inngest down"));
    create.mockResolvedValue({});
    vi.useFakeTimers();
    await scheduleRetry("ep-1", "https://hook.test", "s", "{}", 1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ endpointId: "ep-1", event: "webhook.retry_enqueue_failed", attempts: 1, lastError: "durable retry could not be enqueued" }),
    });
    vi.runAllTimers();
    expect(attemptDelivery).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
