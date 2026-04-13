# Multi-Region Voice Relay — Operational Runbook

## Context

The voice relay (`think5-voice-relay`) runs on Fly.io as a WebSocket proxy between the browser and Gemini Live API. Today it's deployed in a single region (`iad`, US East Virginia). All global voice interviews route through `iad`:

- A Fly `iad` outage = **100% voice interview outage**
- EU/Asia candidates pay **150–300ms additional latency** on every audio frame
- No geographic failover — if the `iad` machine dies, no automatic recovery

This runbook covers adding secondary regions for redundancy and latency reduction.

## Architecture

```
Candidate (EU)  ──WSS──> Fly Anycast ──> lhr relay ──WSS──> Gemini (global)
Candidate (US)  ──WSS──> Fly Anycast ──> iad relay ──WSS──> Gemini (global)
Candidate (Asia)──WSS──> Fly Anycast ──> nrt relay ──WSS──> Gemini (global)
```

Fly's Anycast DNS automatically routes each candidate to the nearest region. No application-level routing is needed — the single `wss://think5-voice-relay.fly.dev` URL works for all regions.

## Target Regions

| Region | Code | Latency from region | Purpose |
|---|---|---|---|
| US East (Virginia) | `iad` | <50ms | Primary — current setup |
| EU West (London) | `lhr` | <50ms from EU | Secondary — EU candidates |
| Asia Pacific (Tokyo) | `nrt` | <50ms from Asia | Tertiary — Asia candidates |

## Prerequisites

Before adding a region:

- [ ] Track 6 Task 25 is deployed (rolling deploy + health checks + kill_signal)
- [ ] `min_machines_running = 2` in `fly.toml` (so the primary region has redundancy)
- [ ] `/health` endpoint returns `{ region: "..." }` (verifiable via curl)
- [ ] Relay startup log includes `FLY_REGION` (so you can confirm which region the machine is in)

## Step-by-step: Add a Region

### 1. Add the region

```bash
fly regions add lhr --app think5-voice-relay
```

### 2. Scale a machine into the region

```bash
fly scale count 1 --region lhr --app think5-voice-relay
```

This provisions a single machine in `lhr`. It will auto-start when a WebSocket connection arrives from that region.

### 3. Verify health

```bash
# From an EU machine or via a proxy
curl -s https://think5-voice-relay.fly.dev/health | jq .region
# Expected: "lhr"
```

If the curl resolves to `iad` instead, Fly Anycast may be routing based on the curl source's geography. Use:

```bash
# Force routing to a specific region for diagnostics
fly ssh console -C 'curl -s http://localhost:8080/health' --region lhr --app think5-voice-relay
```

### 4. Run a smoke test

Run a staging interview from an EU endpoint (VPN or a cloud VM in `eu-west-1`). Verify:

- [ ] Interview starts successfully (WebSocket connects)
- [ ] First AI audio plays within 3 seconds
- [ ] The relay log shows `FLY_REGION=lhr`
- [ ] No elevated reconnect rate during the interview

### 5. Measure latency improvement

```bash
# Before (iad only, from EU):
fly ssh console -C 'curl -w "\ntime_total: %{time_total}s\n" -s -o /dev/null http://localhost:8080/health' --region iad --app think5-voice-relay

# After (lhr):
fly ssh console -C 'curl -w "\ntime_total: %{time_total}s\n" -s -o /dev/null http://localhost:8080/health' --region lhr --app think5-voice-relay
```

Expected improvement: ~100ms round-trip reduction for EU candidates.

## Step-by-step: Remove a Region

If a secondary region causes problems:

```bash
# Remove all machines in the region
fly scale count 0 --region lhr --app think5-voice-relay

# Remove the region from the allowed list
fly regions remove lhr --app think5-voice-relay
```

Active sessions in the removed region will drop. Candidates' clients will reconnect via Fly Anycast and land on the next-nearest region.

## Failover Behavior

- **Machine crash in secondary**: Fly Anycast routes new connections to the next-nearest region. Active sessions on the crashed machine drop; the client reconnects automatically (Phase 1 reconnect logic).
- **Machine crash in primary**: Same behavior — Anycast routes to the next-nearest alive region. If `min_machines_running = 2` in `iad`, one crash leaves one machine alive.
- **Full region outage**: All machines in that region die. Fly routes to the next region with a healthy machine. Latency increases for candidates in that geography but interviews continue.

## Sticky Reconnect (not yet implemented)

Today, a client reconnecting after a WS drop lands on whichever machine Fly routes to — which may be a different machine than the original session. The Gemini connection is per-machine, so a different machine means a fresh Gemini session (context is restored via Redis checkpoint, not via the same WS).

For true sticky reconnect:
1. The relay would need to read the `fly-replay` header and redirect the client to the original machine.
2. This requires tracking which machine ID holds each interview's Gemini session.
3. Planned as a follow-up once multi-region traffic patterns are measured.

## Monitoring

After adding a region, watch these signals:

| Signal | Where to check | Alert threshold |
|---|---|---|
| Active connections per region | `/health` on each machine | 0 connections for >10min in a region that should have traffic |
| Gemini reconnect rate by region | Relay logs: `[Relay] Reconnecting to Gemini` | >5/min sustained = Gemini latency issue from that region |
| First-audio latency by region | SLO dashboard (Phase 2.5) | p95 > 3s in any region |
| Memory per machine | `/health` → `memoryMB` | >400MB on a 512MB machine = approaching OOM |

## Cost Estimate

| Configuration | Monthly estimate |
|---|---|
| 1 region, 2 machines (current) | ~$10 |
| 2 regions, 3 machines (iad×2, lhr×1) | ~$15 |
| 3 regions, 4 machines (iad×2, lhr×1, nrt×1) | ~$20 |

Fly's per-machine cost is ~$5/month for a shared-1x 512MB VM. Auto-stop keeps idle machines from accumulating runtime charges.
