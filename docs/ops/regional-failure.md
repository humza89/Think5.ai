# Regional failure: what happens today, and the runbook (Phase 0 · T11)

Status of this document: **the Phase 0 exit position for the PRD §3.1
"multi-region" row is *documented and safe-to-fail*, not *multi-region*.**
Active multi-region routing, session affinity and evacuation are Phase 4
(see `docs/ops/multi-region-relay.md` for that target). Nothing below claims
multi-region support.

## Topology today

| Tier | Where | Regions | State held |
| --- | --- | --- | --- |
| Web (Next.js) | Vercel | global edge, serverless functions | none between requests |
| Postgres (Supabase) | single region | 1 | **authoritative**: interviews, ledger (`ConversationTurn`), `InterviewerStateSnapshot`, reports, `InterviewLease` |
| Redis (Upstash) | REST, single primary | 1 | **accelerator**: rate-limit counters, concurrency set, voice session hot state, locks, SLO counters, metrics mirror |
| Voice relay | Fly.io `think5-voice-relay` | `iad` only (`min_machines_running = 2`) | transient: open sockets, per-session message buffer (≤100 frames), cached setup message |
| Gemini Live | Google | global | none |
| Inngest | Inngest Cloud | managed | queued events, retries |

## What is lost when each piece fails (as of T11)

### Fly `iad` (relay) is lost
- **Voice is unavailable** until a machine is back. Text mode keeps working
  end to end (`/api/interviews/[id]/voice` and `turn-commit` are Vercel routes
  that do not touch the relay).
- **No interview state is lost.** The relay never holds authoritative state:
  every committed turn is in the ledger and every checkpoint in
  `InterviewerStateSnapshot` before the browser is told the turn is committed.
- **What the candidate sees:** the socket closes (1006 or 1001). The hook runs
  its recovery state machine: up to `MAX_RECOVERY_ATTEMPTS` reconnects with
  backoff, `voice/recover` rebuilds context from the ledger, and if voice does
  not come back it switches to text mode automatically with the blue
  "Voice unavailable … continue via text" banner. If `voice-init` itself fails
  with a 5xx, the hook asks `/api/health`; when it answers `voice: "down"` the
  room offers text mode instead of an error card.
- **Planned restarts** (deploy, `fly machine stop`) are different: the relay
  sends `relay.draining` before closing, the browser reconnects within
  ~0.25–0.75 s to the surviving machine, and that cycle is not counted toward
  the rapid-reconnect limit. Fly's `kill_timeout` (25 s) exceeds the relay's
  10 s drain window, so a slow drain is never cut by SIGKILL.

### Upstash Redis is lost (or was never configured)
- **A durability downgrade, not an outage.** With `FF_P0_REDIS_SAFE_TO_FAIL`
  (default on):
  - `voice-init` proceeds and reports `durability: "postgres"`; the room shows
    the amber "Reduced resilience" banner (non-blocking).
  - Session hot state is kept in the function instance's memory; on a cold
    instance, `voice/recover` reconstructs it from the ledger and the latest
    Postgres snapshot (`reconstructSessionFromLedger`), which is the same path
    used for any Redis miss.
  - Rate limiting and the concurrency limiter fall back to their in-memory
    implementations (per instance). Limits are weaker during the outage; they
    are not off.
  - The session lock falls back to a per-instance lock. Cross-instance
    duplicate-tab detection is lost during the outage (documented limitation;
    the `InterviewSessionStore` lease in `InterviewLease` is Postgres-backed
    and stays correct, and is what new code should use).
  - The continuity SLO gate treats "monitor unavailable" as *unknown*, not as a
    breach, and lets voice start.
  - Every fallback increments `redis_degraded_total{component}` and logs once
    per minute per component; `/api/health` reports `durability: "postgres"`
    and `redisDegradedAt`.
- With the flag **off**, the legacy behaviour is kept: `voice-init` fails
  closed, limiters deny, session saves throw.

### Supabase Postgres is lost
- Everything that writes fails; this is the one true single point of failure
  in Phase 0 and is out of scope for T11 (Supabase HA / read replicas are a
  Phase 4 decision). `/api/health` returns 503 with `database: "unhealthy"`.

### Gemini Live is unreachable
- The relay's connect (10 s) and setup (15 s) timeouts terminate the upstream
  socket and run the reconnect/backoff path (10 attempts). After exhaustion the
  client socket closes with 4502 and the browser falls back to text mode.
- `/health` on the relay reports `status: "degraded"` with
  `gemini.reachable: false` after 3 consecutive connect failures; the web
  `/api/health` folds that into `voice: "degraded"`.

## Runbook: relay region loss (manual, today)

1. Confirm: `curl -s https://<relay>/health` fails or Fly status shows `iad`
   down. `GET /api/health` shows `relay: "unhealthy"`, `voice: "down"`.
2. Candidates already in interviews are in text mode or reconnect loops; no
   action needed for data. Communicate "voice temporarily unavailable" if
   volume warrants.
3. Bring capacity back:
   - if the machines are stopped: `fly machine start <id> -a think5-voice-relay`
   - if the region is down: `fly scale count 2 --region lhr -a think5-voice-relay`
     (secondary regions are **not** pre-provisioned; the image, secrets
     `GEMINI_API_KEY`, `RELAY_JWT_SECRET`, `SENTRY_DSN` and `VOICE_RELAY_URL`
     are region-agnostic, so this is a capacity change, not a config change).
   - The web tier reaches the relay through `VOICE_RELAY_URL`, a single Fly
     app hostname; Fly routes to whichever region has healthy machines.
4. Verify `/health` on the relay is `healthy` and `GET /api/health` returns
   `voice: "ok"`; a candidate's "Retry Voice" resumes voice.
5. Post-incident: check `relay_gemini_reconnect_failures`, Sentry
   `relay_drain` and `gemini_reconnect` issues, and `redis_degraded_total`.

## Runbook: Redis loss

1. Confirm: `GET /api/health` → `redis: "unhealthy"` or `"not_configured"`,
   `durability: "postgres"`, and `redis_degraded_total` climbing on
   `/api/metrics`.
2. No candidate action is required. Expect: reduced-resilience banner, weaker
   rate limits, possible duplicate-tab sessions on different instances.
3. Restore Upstash (or set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
   in Vercel production **and** preview; the boot log line
   `[redis] UPSTASH_REDIS_REST_URL/TOKEN missing in production` tells you when
   they are absent).
4. Nothing needs to be replayed: Redis holds no authoritative state.

## Verification available in the repo

- `__tests__/chaos/redis-loss.test.ts`: every Redis call rejects → interview
  starts and checkpoints with `durability: "postgres"`; flag off → legacy
  fail-closed.
- `__tests__/chaos/relay-drain.test.ts`: drain frame → immediate, rate-limit
  exempt reconnect; unplanned close → backoff; `kill_timeout` > drain window.
- `__tests__/lib/interview-session-store-adapter.test.ts`: contract conformance
  of the Postgres+Redis store including accelerator loss and lease fencing.
- Manual (staging, before T14 sign-off): `fly machine stop` during a mocked
  interview → client reconnects to the surviving machine → transcript intact.

## Phase 4 target (not Phase 0)

Multi-region relay with region-aware `voice-init` (nearest healthy region),
lease-based affinity so a reconnect lands where the session's provider
connection lives or is rebuilt deterministically, and evacuation of a region
by draining leases. Tracked in `docs/ops/multi-region-relay.md`.
