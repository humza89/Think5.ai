# Spike: LiveKit WebRTC Transport for Voice Interviews

**Status:** Open — evaluation in progress
**Owner:** Voice reliability workstream
**Timebox:** 5 days (parallel to Phase 1 + Phase 2.1 execution)
**Target go/no-go decision:** end of Week 1 of the voice-reliability hardening plan
**Related plan:** `plans/fuzzy-conjuring-canyon.md` — Phase 3

## Why we're running this spike

Phase 1 and Phase 2.1 of the hardening plan are surgical — they cut drop rate and add a lifecycle state machine, but they don't change the fundamental transport: raw WebSocket from the browser all the way to Gemini via a Fly.io relay. **That transport cannot survive mobile network switches, corporate proxies, or aggressive NATs**, which is exactly where the "drops and closes automatically" reports come from in production.

Every enterprise-grade AI voice platform we benchmarked (Mercor, Micro1, Vapi, Retell) puts a WebRTC SFU between the browser and the model. LiveKit Cloud is the most direct fit for our use case because:

- Its `@livekit/agents` SDK has first-class support for bridging a room to OpenAI Realtime / Gemini Live.
- It handles ICE restart, TURN over TLS:443, multi-region relays, and sticky reconnect routing automatically.
- LiveKit Cloud publishes a 99.99% SLA.
- The client-side migration is a drop-in — `livekit-client` exposes a familiar room/participant model that maps well onto our existing "one candidate, one interviewer" topology.

But migrating from WebSocket → WebRTC is a 2–3 week effort and touches a lot of code. This spike exists so we don't commit to that effort without validating the core assumptions first.

## Go/no-go criteria

Phase 3 is a **GO** if, at the end of this spike, we can demonstrate all five of:

1. **First-audio latency p95 ≤ 3.0s** — measured from `room.connect()` to the first audio frame played by the candidate. Our current WebSocket path sits around 2.5–3.5s, so anything worse than 3.0s is a regression.
2. **ICE restart success under packet loss** — simulate 30% packet loss for 10s mid-interview, verify the session survives without audio drop >2s.
3. **Network switch survival** — on a real mobile device, switch from wifi to cellular mid-interview, verify audio gap <2s and session remains "active" in SessionService.
4. **Cost feasibility** — at our current + projected concurrent-session load, LiveKit Cloud billing must be <3× what we currently pay Fly for the WebSocket relay. If it's higher, we revisit with self-hosted LiveKit.
5. **Gemini Live bridge works** — a `@livekit/agents` worker can subscribe to the candidate's audio track, forward PCM to Gemini Live, and publish Gemini's responses back to the room as a virtual participant. No audio artifacts, no sync drift.

Phase 3 is a **NO-GO** (or deferred) if any of the above fails. NO-GO doesn't mean the problem is unsolved — it means we stay on the hardened WebSocket path through Phase 2 and re-evaluate in Q3.

## What this spike produces

1. **This doc** — evaluation criteria and status.
2. **`app/api/interviews/[id]/livekit-token/route.ts`** — minimum-viable token issuance stub (feature-flagged, not wired into the UI).
3. **`scripts/livekit-spike-agent.ts`** *(not included yet)* — a throwaway Node.js script that joins a test room with `@livekit/agents`, subscribes to an audio track, and writes PCM to stdout. Run locally to validate the bridge works before we commit to a full `relay/agent-worker.ts`.
4. **`docs/spikes/livekit-webrtc-transport-results.md`** *(created at end of spike)* — measurements, go/no-go decision, next-step plan.

## What this spike does NOT produce

- No changes to `hooks/useVoiceInterview.ts`. The client still uses WebSocket.
- No changes to `relay/server.ts`. Phase 3 migration will add a new `relay/agent-worker.ts` alongside it; the existing WebSocket relay stays until cutover.
- No LiveKit Cloud provisioning yet — this spike runs against a free-tier dev project, pinned to `iad` only, and uses throwaway credentials.

## Architecture sketch (target state)

```
                                                      ┌─────────────────┐
                                                      │ Gemini Live API │
                                                      │ (WebSocket)     │
                                                      └────────┬────────┘
                                                               │
                                                               ▼
  ┌─────────────┐  WebRTC   ┌──────────────┐  WebSocket  ┌──────────────┐
  │   Browser   │◄─────────►│  LiveKit SFU │◄───────────►│ Agent Worker │
  │ livekit-    │  (DTLS    │ (managed,    │             │ (Node.js,    │
  │ client      │   SRTP)   │  TURN/443)   │             │  @livekit/   │
  └─────────────┘           └──────────────┘             │  agents SDK) │
                                                         └──────────────┘
                                                              │
                                                              ▼ HTTP
                                                      ┌───────────────┐
                                                      │  SessionService│
                                                      │  (Phase 2.1)  │
                                                      └───────────────┘
```

The agent worker is stateless per-session — it owns the Gemini WebSocket and translates bidirectionally between LiveKit audio tracks and Gemini audio frames. If a candidate's WebRTC connection drops, LiveKit handles the reconnect at the SFU level and the agent worker never notices. If the Gemini WebSocket drops, the agent worker reconnects using the same reconnect budget + jitter logic as Phase 1.

## Day-by-day plan

| Day | Activity | Exit artifact |
|---|---|---|
| 1 | Create LiveKit Cloud dev project, install `@livekit/agents` + `livekit-server-sdk` locally, get a token-issuance stub working | This PR — token endpoint stub compiles and issues valid JWT |
| 2 | Write throwaway `scripts/livekit-spike-agent.ts` that joins a room and echoes back candidate audio | Local manual test: candidate hears their own voice via WebRTC round-trip |
| 3 | Wire the agent to Gemini Live — candidate speaks, Gemini responds, audio plays in the browser | First-audio latency measured, recorded in results doc |
| 4 | Chaos tests: 30% packet loss, wifi→cellular switch, ICE restart forced | Numbers recorded |
| 5 | Cost model against projected load; write up results doc; go/no-go call | `docs/spikes/livekit-webrtc-transport-results.md` |

## Open questions to answer during the spike

1. **Does Gemini Live's audio format match LiveKit's default Opus encoding?** Gemini expects PCM16 24kHz; LiveKit default is Opus. We'll either need to transcode in the agent worker or configure the LiveKit room to use raw PCM tracks.
2. **Does LiveKit's `previous_response_id`-style resumption work for Gemini Live?** OpenAI Realtime has native session resumption; Gemini Live does not. If the agent worker crashes mid-session, can we replay the transcript from SessionService?
3. **How does LiveKit's billing scale with our audio-only workload?** Most SFU billing assumes video; audio-only should be cheaper but needs explicit confirmation.
4. **What's the client-side bundle size hit?** `livekit-client` is ~200KB minified. Acceptable for a desktop interview app but needs a measurement.
5. **Does LiveKit Cloud route reconnects back to the same media node (sticky reconnect)?** Critical for session continuity — if a candidate's reconnect lands on a different SFU node, the agent worker connection is orphaned.

## Dependencies required for the spike

These are NOT installed in this PR — they'll go in a follow-up branch during the spike work. Listed here so you can review them upfront:

```json
{
  "livekit-server-sdk": "^2.x",  // issues access tokens, used by /api/interviews/[id]/livekit-token
  "@livekit/agents": "^0.x",      // agent-worker SDK (spike script only, not in production yet)
  "livekit-client": "^2.x"         // browser side (not wired into hook yet)
}
```

## Cost-baseline table (to fill in during spike)

| Metric | Current (WebSocket + Fly) | LiveKit Cloud projection |
|---|---|---|
| Monthly base cost (3 relay instances, 512MB, iad) | ~$25 | TBD |
| Per-minute audio cost | $0 (flat Fly pricing) | TBD (LiveKit bills per-minute × participant) |
| At 1,000 interview-minutes/month | ~$25 | TBD |
| At 10,000 interview-minutes/month | ~$25 | TBD |
| At 100,000 interview-minutes/month | ~$50 (scale Fly up) | TBD |

Multi-region TURN, ICE restart, and sticky reconnect routing are included in LiveKit Cloud; self-building them on Fly is effectively impossible.

## Decision log

*(populated during the spike)*
