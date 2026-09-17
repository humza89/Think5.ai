import { describe, expect, it } from "vitest";
import { InMemoryMessageProvider, NotImplementedChannelError, type MessageProvider, type OutboundMessage, type SendResult } from "@/lib/contracts/messaging";
import { runMessageProviderConformance } from "@/lib/contracts/conformance/messaging";

/** Broken on purpose: silently accepts SMS and re-sends duplicates. */
class LooseMessageProvider extends InMemoryMessageProvider {
  private looseSeq = 100;
  async send(message: OutboundMessage): Promise<SendResult> {
    void message;
    return { providerId: `loose-${++this.looseSeq}`, state: "sent", deduplicated: false };
  }
}

describe("MessageProvider conformance", () => {
  it("InMemoryMessageProvider conforms", async () => {
    expect(await runMessageProviderConformance(() => new InMemoryMessageProvider())).toEqual([]);
  });

  it("SMS raises the typed NotImplemented error", async () => {
    const provider: MessageProvider = new InMemoryMessageProvider();
    await expect(provider.send({ id: "m", tenantId: "t", channel: "sms", to: { phone: "+15550100" }, body: "hi" })).rejects.toBeInstanceOf(
      NotImplementedChannelError,
    );
    await expect(provider.send({ id: "m", tenantId: "t", channel: "sms", to: { phone: "+15550100" }, body: "hi" })).rejects.toMatchObject({
      code: "CHANNEL_NOT_IMPLEMENTED",
      channel: "sms",
    });
  });

  it("detects a provider that ignores idempotency and unsupported channels", async () => {
    const violations = await runMessageProviderConformance(() => new LooseMessageProvider());
    expect(violations).toContain("resending the same id must be deduplicated and return the original providerId");
    expect(violations).toContain("send on unsupported channel sms must throw");
  });
});
