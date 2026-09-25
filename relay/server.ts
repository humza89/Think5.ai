/**
 * Think5 Voice Relay Server
 *
 * WebSocket relay that sits between the browser and Gemini Live API.
 * The browser connects here with a signed JWT session token.
 * This server connects to Gemini with the real API key.
 * All messages are proxied bidirectionally.
 *
 * This eliminates client-side API key exposure — the GEMINI_API_KEY
 * never leaves the server.
 *
 * Enterprise reliability features:
 * - Automatic Gemini reconnect on upstream failure (6 attempts, exponential backoff)
 * - Bidirectional ping/pong heartbeat (detects zombie connections in 30-60s)
 * - Message buffering during reconnect (up to 100 messages)
 * - Expanded health metrics for monitoring
 *
 * Deployment: Fly.io (or any long-lived Node.js host)
 * Protocol: WebSocket (wss://)
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { URL } from "url";
import * as Sentry from "@sentry/node";

// ── Task 32: Sentry initialization ───────────────────────────────────
//
// The relay was completely dark to production error tracking — every
// Gemini failure, reconnect exhaustion, buffer overflow, and deploy
// drain was only visible in local console.log on the Fly machine.
// This init gives ops a single Sentry project to answer "why did this
// interview's voice drop?" without SSH-ing into a Fly instance.
//
// Env vars:
//   SENTRY_DSN — required in production, optional in dev. If unset,
//                Sentry is a no-op (init still runs, just doesn't send).
//   SENTRY_ENVIRONMENT — defaults to NODE_ENV.
//   SENTRY_TRACES_SAMPLE_RATE — defaults to 0 (no perf tracing yet;
//                               Task 31 will enable it with OTel).

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
  release: process.env.SENTRY_RELEASE || "relay@unknown",
  // No perf tracing until Task 31 (OTel). Keep this at 0 so we only
  // send error events, not transaction spans — the relay is a
  // long-lived process, not a request-response server, so default
  // tracing produces unbounded transactions.
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
  // Scrub Gemini API key from breadcrumbs and events. The key appears
  // in the Gemini WS URL; Sentry's default PII scrubbing won't catch
  // it because it's embedded in a URL, not a named field.
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/key=[^&]+/, "key=[REDACTED]");
    }
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data?.url && typeof breadcrumb.data.url === "string") {
      breadcrumb.data.url = breadcrumb.data.url.replace(/key=[^&]+/, "key=[REDACTED]");
    }
    return breadcrumb;
  },
});

// ── Configuration ─────────────────────────────────────────────────────

/** True when a client→Gemini frame is a Live API setup message. */
function isSetupFrame(data: Buffer | string): boolean {
  try {
    const text = typeof data === "string" ? data : data.toString("utf8", 0, Math.min(data.byteLength, 64));
    return text.includes('"setup"');
  } catch {
    return false;
  }
}

const PORT = parseInt(process.env.PORT || "8080", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RELAY_JWT_SECRET = process.env.RELAY_JWT_SECRET;
const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

// Phase 1.2: aligned with client MAX_RECOVERY_ATTEMPTS. Previously relay=6 and client=3
// (or 10 via env) would disagree on how long to keep trying — producing permanent failures
// on the client while the relay was still reconnecting, or vice versa. Both now target 10.
const MAX_GEMINI_RECONNECTS = 10;
// Base backoff in ms. Actual delay is base * (0.5 + Math.random() * 0.5) for full jitter,
// so N clients reconnecting simultaneously don't stampede Gemini at the same moment.
const RECONNECT_BACKOFF = [500, 1000, 2000, 4000, 8000, 12000, 16000, 20000, 25000, 30000];
const MESSAGE_BUFFER_LIMIT = 100;
// T11 (Step 5): explicit provider timeouts. A Gemini socket that has not
// opened within GEMINI_CONNECT_TIMEOUT_MS, or that has not answered the
// setup message with setupComplete within GEMINI_SETUP_TIMEOUT_MS, is
// terminated so the normal reconnect/backoff path runs instead of the
// session hanging until the 20-minute idle timer.
const GEMINI_CONNECT_TIMEOUT_MS = parseInt(process.env.GEMINI_CONNECT_TIMEOUT_MS || "10000", 10);
const GEMINI_SETUP_TIMEOUT_MS = parseInt(process.env.GEMINI_SETUP_TIMEOUT_MS || "15000", 10);
// Health: consecutive Gemini connect failures before /health reports degraded.
const GEMINI_UNREACHABLE_THRESHOLD = 3;
const PING_INTERVAL_MS = 30_000;
// Phase 1.1: raised from 5min → 20min. The previous 5min hard-kill was dropping sessions
// whenever a candidate went quiet (thinking, reading a problem statement) or whenever the
// audio processor stalled briefly. resetIdle() is already called on every client→relay
// AND Gemini→client frame, so the timer only fires on true connection death.
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

if (!GEMINI_API_KEY) {
  const err = new Error("FATAL: GEMINI_API_KEY is required");
  Sentry.captureException(err, { tags: { component: "relay_startup" } });
  console.error(err.message);
  // Flush Sentry before exit so the startup failure is actually sent
  Sentry.flush(2000).finally(() => process.exit(1));
}
if (!RELAY_JWT_SECRET) {
  const err = new Error("FATAL: RELAY_JWT_SECRET is required");
  Sentry.captureException(err, { tags: { component: "relay_startup" } });
  console.error(err.message);
  Sentry.flush(2000).finally(() => process.exit(1));
}

// ── Types ─────────────────────────────────────────────────────────────

interface SessionPayload {
  interviewId: string;
  sub: string; // candidate ID
  iat: number;
  exp: number;
}

interface RelayMetrics {
  activeConnections: number;
  totalConnections: number;
  totalMessages: number;
  totalBytes: number;
  geminiReconnects: number;
  geminiReconnectFailures: number;
  bufferOverflows: number;
  // T11 health signals
  bufferedMessages: number;
  geminiConnectTimeouts: number;
  geminiSetupTimeouts: number;
  geminiConsecutiveConnectFailures: number;
  geminiLastConnectedAt: number | null;
  draining: boolean;
}

const metrics: RelayMetrics = {
  activeConnections: 0,
  totalConnections: 0,
  totalMessages: 0,
  totalBytes: 0,
  geminiReconnects: 0,
  geminiReconnectFailures: 0,
  bufferOverflows: 0,
  bufferedMessages: 0,
  geminiConnectTimeouts: 0,
  geminiSetupTimeouts: 0,
  geminiConsecutiveConnectFailures: 0,
  geminiLastConnectedAt: null,
  draining: false,
};

/**
 * T11: health verdict. "degraded" when Gemini looks unreachable (consecutive
 * connect failures at/over the threshold), when buffers are under pressure
 * (more than half of the aggregate buffer capacity in use), or while draining.
 * Fly keeps routing to a "degraded" machine (HTTP 200); the web tier surfaces
 * it as voice: degraded so the room can prefer text mode over a hard error.
 */
function relayHealth(): { status: "healthy" | "degraded"; reasons: string[]; bufferPressure: number; geminiReachable: boolean } {
  const reasons: string[] = [];
  const capacity = Math.max(1, metrics.activeConnections) * MESSAGE_BUFFER_LIMIT;
  const bufferPressure = Math.min(1, metrics.bufferedMessages / capacity);
  const geminiReachable = metrics.geminiConsecutiveConnectFailures < GEMINI_UNREACHABLE_THRESHOLD;
  if (!geminiReachable) reasons.push(`gemini_unreachable(${metrics.geminiConsecutiveConnectFailures} consecutive connect failures)`);
  if (bufferPressure > 0.5) reasons.push(`buffer_pressure(${Math.round(bufferPressure * 100)}%)`);
  if (metrics.draining) reasons.push("draining");
  return { status: reasons.length ? "degraded" : "healthy", reasons, bufferPressure, geminiReachable };
}

// ── HTTP Server (health check) ────────────────────────────────────────

// Track 6 Task 26: expose the Fly region so operators and the client
// can see which region a session landed in. Fly sets FLY_REGION at
// runtime on every machine; we surface it on /health and log it at
// startup.
const FLY_REGION = process.env.FLY_REGION || "local";

const httpServer = createServer(
  (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/health") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        // Track 6 Task 26: region header for curl diagnostics.
        "fly-region": FLY_REGION,
      });
      const health = relayHealth();
      res.end(
        JSON.stringify({
          status: health.status,
          reasons: health.reasons,
          gemini: {
            reachable: health.geminiReachable,
            consecutiveConnectFailures: metrics.geminiConsecutiveConnectFailures,
            lastConnectedAt: metrics.geminiLastConnectedAt ? new Date(metrics.geminiLastConnectedAt).toISOString() : null,
            connectTimeouts: metrics.geminiConnectTimeouts,
            setupTimeouts: metrics.geminiSetupTimeouts,
          },
          bufferPressure: health.bufferPressure,
          bufferedMessages: metrics.bufferedMessages,
          draining: metrics.draining,
          region: FLY_REGION,
          timestamp: new Date().toISOString(),
          activeConnections: metrics.activeConnections,
          totalConnections: metrics.totalConnections,
          totalMessages: metrics.totalMessages,
          totalBytes: metrics.totalBytes,
          geminiReconnects: metrics.geminiReconnects,
          geminiReconnectFailures: metrics.geminiReconnectFailures,
          bufferOverflows: metrics.bufferOverflows,
          uptimeSeconds: Math.round(process.uptime()),
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        })
      );
      return;
    }
    res.writeHead(404);
    res.end("Not Found");
  }
);

// ── WebSocket Server ──────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (clientWs: WebSocket, req: IncomingMessage) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  const sessionToken = requestUrl.searchParams.get("session");

  // 1. Verify JWT session token
  if (!sessionToken) {
    clientWs.close(4001, "Missing session token");
    return;
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(sessionToken, RELAY_JWT_SECRET!) as SessionPayload;
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? "Session expired"
        : "Invalid session token";
    clientWs.close(4001, message);
    return;
  }

  const { interviewId } = payload;
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "unknown";

  console.log(
    `[Relay] Client connected: interview=${interviewId} ip=${clientIp}`
  );

  metrics.activeConnections++;
  metrics.totalConnections++;

  // ── Session state ──
  let clientAlive = true;
  let geminiAlive = false;
  let geminiWs: WebSocket;
  let setupMessage: Buffer | string | null = null; // Cached first message for reconnect
  let isFirstMessage = true;
  let isReconnecting = false;
  const messageBuffer: Array<Buffer | string> = [];
  let cleanedUp = false;

  // ── Idle timeout ──
  let idleTimer = setTimeout(() => cleanup("idle_timeout"), IDLE_TIMEOUT_MS);

  const resetIdle = () => {
    clearTimeout(idleTimer);
    if (!cleanedUp) {
      idleTimer = setTimeout(() => cleanup("idle_timeout"), IDLE_TIMEOUT_MS);
    }
  };

  // ── Bidirectional heartbeat (ping/pong) ──
  const pingInterval = setInterval(() => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.ping();
    }
  }, PING_INTERVAL_MS);

  clientWs.on("pong", () => resetIdle());

  // ── Connect to Gemini ──
  // T11: setup-response watchdog (armed when a setup message goes upstream).
  let setupTimer: ReturnType<typeof setTimeout> | null = null;
  function armSetupWatchdog(ws: WebSocket) {
    if (setupTimer) clearTimeout(setupTimer);
    setupTimer = setTimeout(() => {
      setupTimer = null;
      if (cleanedUp || ws.readyState !== WebSocket.OPEN) return;
      metrics.geminiSetupTimeouts++;
      console.warn(`[Relay] Gemini setup timeout (${GEMINI_SETUP_TIMEOUT_MS}ms) for interview=${interviewId} — terminating upstream to trigger reconnect`);
      Sentry.captureMessage("Gemini setup timeout", { level: "warning", tags: { component: "gemini_setup", interviewId }, extra: { timeoutMs: GEMINI_SETUP_TIMEOUT_MS } });
      try { ws.terminate(); } catch { /* already gone */ }
    }, GEMINI_SETUP_TIMEOUT_MS);
  }
  function disarmSetupWatchdog() {
    if (setupTimer) { clearTimeout(setupTimer); setupTimer = null; }
  }

  function connectToGemini(): WebSocket {
    const geminiUrl = `${GEMINI_WS_BASE}?key=${GEMINI_API_KEY}`;
    const ws = new WebSocket(geminiUrl);

    // T11: connect timeout — terminate a socket that never opens so the
    // reconnect path (with backoff) runs instead of waiting on the idle timer.
    const connectTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        metrics.geminiConnectTimeouts++;
        metrics.geminiConsecutiveConnectFailures++;
        console.warn(`[Relay] Gemini connect timeout (${GEMINI_CONNECT_TIMEOUT_MS}ms) for interview=${interviewId}`);
        try { ws.terminate(); } catch { /* ignore */ }
      }
    }, GEMINI_CONNECT_TIMEOUT_MS);

    ws.on("open", () => {
      clearTimeout(connectTimer);
      metrics.geminiConsecutiveConnectFailures = 0;
      metrics.geminiLastConnectedAt = Date.now();
      geminiAlive = true;
      console.log(`[Relay] Gemini connected for interview=${interviewId}`);

      // If reconnecting, resend the cached setup message first
      if (isReconnecting && setupMessage) {
        console.log(`[Relay] Resending setup message for interview=${interviewId}`);
        ws.send(setupMessage);
        armSetupWatchdog(ws);
      }
      // Always drain buffered messages (handles initial connect race + reconnect)
      if (messageBuffer.length > 0) {
        console.log(`[Relay] Draining ${messageBuffer.length} buffered message(s) for interview=${interviewId}`);
        while (messageBuffer.length > 0) {
          const msg = messageBuffer.shift()!;
          metrics.bufferedMessages = Math.max(0, metrics.bufferedMessages - 1);
          ws.send(msg);
        }
      }
      isReconnecting = false;
    });

    ws.on("message", (data: Buffer | string) => {
      // T11: the first upstream frame after a setup message is setupComplete.
      if (setupTimer) {
        try {
          const text = typeof data === "string" ? data : data.toString("utf8");
          if (text.includes("setupComplete")) disarmSetupWatchdog();
        } catch { /* binary frame */ }
      }
      if (clientAlive) {
        metrics.totalMessages++;
        const size = typeof data === "string" ? data.length : data.byteLength;
        metrics.totalBytes += size;
        clientWs.send(data);
        resetIdle();
      }
    });

    ws.on("error", (err) => {
      clearTimeout(connectTimer);
      if (!geminiAlive) metrics.geminiConsecutiveConnectFailures++;
      console.error(
        `[Relay] Gemini WS error for interview=${interviewId}:`,
        err.message
      );
      Sentry.captureException(err, {
        tags: { component: "gemini_ws", interviewId },
        extra: { reconnectAttempts, geminiAlive, clientAlive },
      });
      geminiAlive = false;
    });

    ws.on("close", (code) => {
      clearTimeout(connectTimer);
      disarmSetupWatchdog();
      geminiAlive = false;

      // Don't reconnect if cleanup was intentional or client already disconnected
      if (cleanedUp || !clientAlive) return;

      // Intentional close from our side (during cleanup/reconnect)
      if (code === 1000 || code === 1001) return;

      console.log(`[Relay] Gemini closed unexpectedly (code=${code}) for interview=${interviewId}, attempting reconnect...`);
      Sentry.addBreadcrumb({
        category: "gemini",
        message: `Gemini closed unexpectedly (code=${code})`,
        level: "warning",
        data: { interviewId, code, reconnectAttempts },
      });
      attemptGeminiReconnect();
    });

    return ws;
  }

  // ── Gemini reconnect with exponential backoff ──
  let reconnectAttempts = 0;

  function attemptGeminiReconnect() {
    if (reconnectAttempts >= MAX_GEMINI_RECONNECTS) {
      console.error(`[Relay] Gemini reconnect exhausted (${MAX_GEMINI_RECONNECTS} attempts) for interview=${interviewId}`);
      metrics.geminiReconnectFailures++;
      metrics.bufferedMessages = Math.max(0, metrics.bufferedMessages - messageBuffer.length);
      messageBuffer.length = 0;
      // Task 32: this is the terminal provider failure — the interview
      // will fall back to text mode or end. Capture as a Sentry error
      // (not just a breadcrumb) so it shows up as its own issue with
      // interview correlation for root-cause investigation.
      Sentry.captureMessage(
        `Gemini reconnect exhausted after ${MAX_GEMINI_RECONNECTS} attempts`,
        {
          level: "error",
          tags: { component: "gemini_reconnect", interviewId },
          extra: {
            maxAttempts: MAX_GEMINI_RECONNECTS,
            bufferedMessages: messageBuffer.length,
            clientIp: clientIp,
          },
        },
      );
      if (clientAlive) {
        clientWs.close(4502, "Upstream connection error — reconnect exhausted");
      }
      return;
    }

    isReconnecting = true;
    const baseDelay = RECONNECT_BACKOFF[reconnectAttempts] ?? 30000;
    // Full jitter: delay randomized in [0.5*base, 1.0*base] to prevent thundering herd
    // when many clients reconnect at the same moment after a Gemini blip.
    const delay = Math.round(baseDelay * (0.5 + Math.random() * 0.5));
    reconnectAttempts++;
    metrics.geminiReconnects++;

    console.log(`[Relay] Reconnecting to Gemini in ${delay}ms (attempt ${reconnectAttempts}/${MAX_GEMINI_RECONNECTS}) for interview=${interviewId}`);

    setTimeout(() => {
      if (!clientAlive || cleanedUp) return;
      geminiWs = connectToGemini();
    }, delay);
  }

  // ── Initial Gemini connection ──
  geminiWs = connectToGemini();

  // ── Proxy: Client → Gemini ──
  clientWs.on("message", (data: Buffer | string) => {
    // Cache setup messages for relay→Gemini reconnect.
    // Always update cache if message contains "setup" (client may send reconnect-aware prompt).
    if (isFirstMessage) {
      setupMessage = data;
      isFirstMessage = false;
    } else {
      // Detect setup messages by content — update cache if client sends a new setup
      try {
        const text = typeof data === "string" ? data : data.toString("utf8");
        if (text.includes('"setup"')) {
          setupMessage = data;
          console.log(`[Relay] Updated cached setup message for interview=${interviewId}`);
        }
      } catch { /* ignore parse errors for binary audio frames */ }
    }

    metrics.totalMessages++;
    const size = typeof data === "string" ? data.length : data.byteLength;
    metrics.totalBytes += size;
    resetIdle();

    if (geminiAlive && !isReconnecting) {
      geminiWs.send(data);
      if (isSetupFrame(data)) armSetupWatchdog(geminiWs);
    } else {
      // Buffer during initial connect OR reconnect (cap at limit)
      if (messageBuffer.length < MESSAGE_BUFFER_LIMIT) {
        messageBuffer.push(data);
        metrics.bufferedMessages++;
      } else {
        console.warn(`[Relay] Buffer overflow (${MESSAGE_BUFFER_LIMIT} msgs) for interview=${interviewId}, dropping message`);
        metrics.bufferOverflows++;
        // Task 32: buffer overflows mean audio is being lost. Capture
        // as a warning (not error) since it's a degradation, not a
        // crash — but include the interview ID so ops can correlate
        // with candidate complaints about missing audio.
        Sentry.addBreadcrumb({
          category: "relay_buffer",
          message: `Buffer overflow — message dropped (limit=${MESSAGE_BUFFER_LIMIT})`,
          level: "warning",
          data: { interviewId, bufferOverflows: metrics.bufferOverflows },
        });
      }
    }
  });

  clientWs.on("error", (err) => {
    console.error(
      `[Relay] Client WS error for interview=${interviewId}:`,
      err.message
    );
    Sentry.captureException(err, {
      tags: { component: "client_ws", interviewId },
      extra: { clientIp, source: "client_error" },
    });
    cleanup("client_error");
  });

  // ── Cleanup on disconnect ──
  function cleanup(source: string) {
    if (cleanedUp) return;
    cleanedUp = true;

    console.log(
      `[Relay] Disconnected (${source}): interview=${interviewId}`
    );
    metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);

    clearTimeout(idleTimer);
    clearInterval(pingInterval);
    disarmSetupWatchdog();
    metrics.bufferedMessages = Math.max(0, metrics.bufferedMessages - messageBuffer.length);
    messageBuffer.length = 0;

    if (clientAlive) {
      clientAlive = false;
      try { clientWs.close(); } catch { /* already closed */ }
    }
    if (geminiAlive) {
      geminiAlive = false;
      try { geminiWs.close(); } catch { /* already closed */ }
    }
  }

  clientWs.on("close", () => cleanup("client"));
});

// ── Start ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[Relay] Voice relay server listening on port ${PORT}`);
  console.log(`[Relay] Region: ${FLY_REGION}`);
  console.log(`[Relay] Health check: http://localhost:${PORT}/health`);
  console.log(`[Relay] WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// Graceful shutdown — drain active sessions before exit
const GRACEFUL_DRAIN_MS = 10_000; // 10s max wait for sessions to checkpoint

process.on("SIGTERM", () => {
  metrics.draining = true; // T11: /health reports degraded while draining
  const activeCount = wss.clients.size;
  console.log(
    `[Relay] SIGTERM received, draining ${activeCount} active session(s)...` +
    ` (drain window: ${GRACEFUL_DRAIN_MS}ms, kill_timeout: 25s)`
  );

  // Stop accepting new connections
  httpServer.close(() => {
    console.log("[Relay] HTTP server closed, no new connections accepted");
  });

  // Track 6 Task 25: send a `relay.draining` control frame BEFORE the
  // close frame. The client hook (useVoiceInterview.ts) can use this to
  // distinguish a deploy restart (reconnect immediately) from a session
  // kill (fall back to text or show an error). Without this signal, the
  // client sees close code 1001 and may treat it as a terminal close —
  // meaning the candidate sees a permanent disconnect during a deploy.
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: "relay.draining",
          reason: "deploy_restart",
          drainMs: GRACEFUL_DRAIN_MS,
          timestamp: Date.now(),
        }));
      } catch {
        /* client may have already disconnected */
      }
    }
  });

  // Give clients a moment to process the draining frame before closing.
  // 500ms is enough for one WS round-trip so the client can acknowledge
  // and start its reconnect flow before the close frame arrives.
  setTimeout(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, "Server shutting down");
      }
    });
  }, 500);

  // Force exit after drain timeout
  const drainTimeout = setTimeout(() => {
    const remaining = wss.clients.size;
    if (remaining > 0) {
      console.warn(`[Relay] Drain timeout — ${remaining} session(s) forcefully terminated`);
      Sentry.captureMessage(`Drain timeout — ${remaining} session(s) forcefully terminated`, {
        level: "warning",
        tags: { component: "relay_drain" },
        extra: { remaining, drainMs: GRACEFUL_DRAIN_MS },
      });
    }
    console.log("[Relay] Shutdown complete");
    // Task 32: flush Sentry events before exit so drain/startup
    // errors are actually delivered to the dashboard.
    Sentry.flush(2000).finally(() => process.exit(0));
  }, GRACEFUL_DRAIN_MS);

  // If all clients disconnect early, exit immediately
  const checkDrained = setInterval(() => {
    if (wss.clients.size === 0) {
      clearInterval(checkDrained);
      clearTimeout(drainTimeout);
      console.log("[Relay] All sessions drained, shutdown complete");
      Sentry.flush(2000).finally(() => process.exit(0));
    }
  }, 500);
});
