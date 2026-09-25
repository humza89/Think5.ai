import type { MessageProvider, OutboundMessage } from "../messaging";
import { MESSAGE_CHANNELS, NotImplementedChannelError } from "../messaging";
import { expectRejects, guard, type Violations } from "./shared";

function message(overrides: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    id: "m-1",
    tenantId: "tenant-1",
    channel: "in_app",
    to: { userId: "u-1", email: "u1@example.test", phone: "+15550100" },
    body: "hello",
    ...overrides,
  };
}

/** Verifies idempotent sends, status lookup and typed NotImplemented for unsupported channels. */
export async function runMessageProviderConformance(factory: () => MessageProvider): Promise<Violations> {
  const violations: Violations = [];
  const provider = factory();

  await guard(async () => {
    if (!provider.name) violations.push("provider must have a name");
    if (provider.channels.length === 0) violations.push("provider must declare at least one channel");
    const supported = provider.channels[0];
    const first = await provider.send(message({ channel: supported }));
    if (!first.providerId || first.deduplicated) violations.push("first send must return a providerId and not be deduplicated");
    const replay = await provider.send(message({ channel: supported, body: "changed" }));
    if (!replay.deduplicated || replay.providerId !== first.providerId) {
      violations.push("resending the same id must be deduplicated and return the original providerId");
    }
    const status = await provider.status(first.providerId);
    if (!status || status.providerId !== first.providerId) violations.push("status must resolve a providerId returned by send");
    if ((await provider.status("unknown")) !== null) violations.push("status must return null for unknown providerIds");
  }, "send/status", violations);

  for (const channel of MESSAGE_CHANNELS) {
    if (provider.channels.includes(channel)) continue;
    try {
      await provider.send(message({ id: `m-${channel}`, channel }));
      violations.push(`send on unsupported channel ${channel} must throw`);
    } catch (error) {
      if (!(error instanceof NotImplementedChannelError) || error.code !== "CHANNEL_NOT_IMPLEMENTED" || error.channel !== channel) {
        violations.push(`send on unsupported channel ${channel} must throw NotImplementedChannelError for that channel`);
      }
    }
  }

  await expectRejects(() => provider.send(message({ id: "" })), "send without id", violations);
  await expectRejects(() => provider.send(message({ id: "m-nobody", body: "" })), "send with empty body", violations);

  return violations;
}
