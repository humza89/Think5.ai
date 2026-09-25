import { describe, expect, it } from "vitest";
import { InMemoryAvatarProvider, NoAvatar, type AvatarProvider, type AvatarSession, type AvatarSessionRequest } from "@/lib/contracts/avatar";
import { runAvatarProviderConformance } from "@/lib/contracts/conformance/avatar";

/** Broken on purpose: silent degradation and throws after end. */
class BrittleAvatar extends InMemoryAvatarProvider {
  async createSession(request: AvatarSessionRequest): Promise<AvatarSession> {
    const session = await super.createSession(request);
    return { ...session, transport: "none", degraded: false };
  }
  async feedAudio(sessionId: string, chunk: Uint8Array): Promise<void> {
    if (!this.sessions.get(sessionId) || this.sessions.get(sessionId)?.ended) throw new Error("unknown or ended session");
    return super.feedAudio(sessionId, chunk);
  }
}

describe("AvatarProvider conformance", () => {
  it("NoAvatar conforms and never breaks the flow", async () => {
    expect(await runAvatarProviderConformance(() => new NoAvatar())).toEqual([]);
    const session = await new NoAvatar().createSession({ interviewId: "i", likenessId: "aria", language: "en-US", audioSource: "relay" });
    expect(session).toMatchObject({ transport: "none", degraded: true });
  });

  it("InMemoryAvatarProvider conforms, and degrades explicitly when unhealthy", async () => {
    expect(await runAvatarProviderConformance(() => new InMemoryAvatarProvider())).toEqual([]);
    const provider: AvatarProvider & { healthy: boolean } = new InMemoryAvatarProvider();
    provider.healthy = false;
    expect(await provider.createSession({ interviewId: "i", likenessId: "aria", language: "en-US", audioSource: "relay" })).toMatchObject({
      transport: "none",
      degraded: true,
      degradedReason: "provider unhealthy",
    });
  });

  it("detects a provider that hides degradation or throws after end", async () => {
    const violations = await runAvatarProviderConformance(() => new BrittleAvatar());
    expect(violations).toContain("transport none must be reported as degraded");
    expect(violations.some((v) => v.startsWith("session lifecycle: threw"))).toBe(true);
  });
});
