/**
 * AvatarProvider contract (T0.5; a vendor is chosen in Phase 2).
 *
 * The interview room is coded against this interface now. `NoAvatar` is the
 * Phase 0 implementation: it never fails, reports `transport: "none"` and
 * `degraded: true`, and the room continues as an audio-only interview.
 */

export type AvatarTransport = "webrtc" | "none";

export interface AvatarSessionRequest {
  interviewId: string;
  /** Which face/voice likeness to render (e.g. "aria-default"). */
  likenessId: string;
  /** BCP-47 language tag. */
  language: string;
  /** Where the interviewer audio originates. */
  audioSource: "relay" | "browser";
}

export interface AvatarSession {
  sessionId: string;
  transport: AvatarTransport;
  /** True when the room must fall back to non-avatar rendering. */
  degraded: boolean;
  degradedReason?: string;
  /** Connection details for the transport, when any. */
  connection?: { sdpOffer?: string; iceServers?: string[] };
}

export interface AvatarHealth {
  healthy: boolean;
  provider: string;
  latencyMs?: number;
  detail?: string;
}

export interface AvatarProvider {
  readonly name: string;
  createSession(request: AvatarSessionRequest): Promise<AvatarSession>;
  /** PCM/Opus frames from the interviewer voice; must not throw for unknown sessions. */
  feedAudio(sessionId: string, chunk: Uint8Array): Promise<void>;
  /** Barge-in: stop the current utterance immediately. */
  interrupt(sessionId: string): Promise<void>;
  end(sessionId: string): Promise<void>;
  health(): Promise<AvatarHealth>;
}

/** Phase 0 default: no avatar, no failures, explicit degraded mode. */
export class NoAvatar implements AvatarProvider {
  readonly name = "none";
  private seq = 0;

  async createSession(request: AvatarSessionRequest): Promise<AvatarSession> {
    if (!request.interviewId) throw new Error("createSession requires interviewId");
    return {
      sessionId: `no-avatar-${request.interviewId}-${++this.seq}`,
      transport: "none",
      degraded: true,
      degradedReason: "no avatar provider configured",
    };
  }

  async feedAudio(): Promise<void> {}

  async interrupt(): Promise<void> {}

  async end(): Promise<void> {}

  async health(): Promise<AvatarHealth> {
    return { healthy: true, provider: this.name, detail: "avatar rendering disabled" };
  }
}

/**
 * Reference provider that behaves like a real WebRTC vendor for tests:
 * tracks sessions, audio bytes and interrupts, and can be flipped unhealthy.
 */
export class InMemoryAvatarProvider implements AvatarProvider {
  readonly name = "in-memory";
  healthy = true;
  readonly sessions = new Map<string, { request: AvatarSessionRequest; bytes: number; interrupts: number; ended: boolean }>();
  private seq = 0;

  async createSession(request: AvatarSessionRequest): Promise<AvatarSession> {
    if (!request.interviewId) throw new Error("createSession requires interviewId");
    if (!this.healthy) {
      return { sessionId: `degraded-${++this.seq}`, transport: "none", degraded: true, degradedReason: "provider unhealthy" };
    }
    const sessionId = `avatar-${++this.seq}`;
    this.sessions.set(sessionId, { request, bytes: 0, interrupts: 0, ended: false });
    return { sessionId, transport: "webrtc", degraded: false, connection: { sdpOffer: "v=0", iceServers: [] } };
  }

  async feedAudio(sessionId: string, chunk: Uint8Array): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && !session.ended) session.bytes += chunk.byteLength;
  }

  async interrupt(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && !session.ended) session.interrupts += 1;
  }

  async end(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.ended = true;
  }

  async health(): Promise<AvatarHealth> {
    return { healthy: this.healthy, provider: this.name, latencyMs: 1 };
  }
}
