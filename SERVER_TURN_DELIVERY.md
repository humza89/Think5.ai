# Server-Authoritative Turn Delivery

## Architecture Constraint

The voice relay server is an external service at `VOICE_RELAY_URL` — we do not control its code in this repository. The architecture is:

```
Browser → External Relay Server (JWT-authenticated) → Gemini Live API
```

The Next.js application handles REST endpoints only (voice-init, turn-commit, checkpoint). We cannot modify the relay to intercept or proxy the Gemini model stream server-side.

## Chosen Approach: Client-Side Hold-and-Validate

Because the relay is external, we implement **client-side hold-and-validate** rather than server-side stream proxying.

### Flow

1. Client receives model output from the relay via WebSocket (`serverContent.turnComplete`)
2. Client buffers the completed turn text in `currentTurnTextRef` — does NOT render to UI
3. Client POSTs the turn to `POST /api/interviews/{id}/voice/turn-commit` for server validation
4. Server runs all gates (output gate, grounding gate, contradiction detector, memory confidence, intro guard, sequence numbers)
5. If `committed: true` — client renders the turn to the visible transcript
6. If `committed: false` — client suppresses rendering and logs the block reason
7. For contradiction blocks, the server returns a `regenerationPrompt` for the model to retry

### Feature Flag

Controlled by `SERVER_AUTHORITATIVE_TURNS` (`FF_SERVER_AUTHORITATIVE_TURNS`, default: `true`).

When enabled, the client hook (`useVoiceInterview.ts`) gates all real-time transcription rendering behind server validation. When disabled, turns render immediately (legacy behavior).

### Zero Unvalidated Renders

With `SERVER_AUTHORITATIVE_TURNS` enabled:
- `outputTranscription` events are suppressed from the visible transcript
- Only turns that pass `turn-commit` validation appear in the UI
- Rejected turns are logged with their block reason but never shown to the candidate

### Rejection Handling

| Block Reason | Client Action |
|---|---|
| `GROUNDING_GATE_BLOCKED` | Suppress turn, use regenerationPrompt |
| `SEMANTIC_CONTRADICTION_DETECTED` | Suppress turn, use regenerationPrompt |
| `MEMORY_CONFIDENCE_LOW` | Suppress turn, hold for recovery |
| `MEMORY_CONFIDENCE_DEGRADED` | Hold and retry after `holdSignal.retryAfterMs` |
| `OUTPUT_GATE_BLOCKED` | Suppress turn |
| `INTRO_BLOCKED_UNCONDITIONAL` | Suppress turn |
| `DUPLICATE_SEQUENCE` | Suppress (already committed) |
| `OUT_OF_ORDER_SEQUENCE` | Resync sequence number from server |
