import type { AvatarProvider } from "../avatar";
import { guard, type Violations } from "./shared";

/**
 * Verifies that an AvatarProvider never breaks the interview flow: sessions
 * are well-formed, degraded sessions say so, and audio/interrupt/end are
 * safe to call for unknown or ended sessions.
 */
export async function runAvatarProviderConformance(factory: () => AvatarProvider): Promise<Violations> {
  const violations: Violations = [];
  const provider = factory();

  await guard(async () => {
    if (!provider.name) violations.push("provider must have a name");
    const health = await provider.health();
    if (typeof health.healthy !== "boolean" || health.provider !== provider.name) {
      violations.push("health() must report a boolean and the provider name");
    }

    const session = await provider.createSession({
      interviewId: "i-1",
      likenessId: "aria-default",
      language: "en-US",
      audioSource: "relay",
    });
    if (!session.sessionId) violations.push("createSession must return a sessionId");
    if (session.transport !== "webrtc" && session.transport !== "none") violations.push("transport must be webrtc or none");
    if (session.transport === "none" && !session.degraded) violations.push("transport none must be reported as degraded");
    if (session.degraded && !session.degradedReason) violations.push("degraded sessions must carry a reason");

    await provider.feedAudio(session.sessionId, new Uint8Array([1, 2, 3]));
    await provider.interrupt(session.sessionId);
    await provider.end(session.sessionId);
    // After end, and for unknown ids, the provider must stay quiet.
    await provider.feedAudio(session.sessionId, new Uint8Array([4]));
    await provider.feedAudio("unknown-session", new Uint8Array([5]));
    await provider.interrupt("unknown-session");
    await provider.end("unknown-session");
  }, "session lifecycle", violations);

  return violations;
}
