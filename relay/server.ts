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

const PORT = parseInt(process.env.PORT || "8080", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RELAY_JWT_SECRET = process.env.RELAY_JWT_SECRET;
const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const MAX_GEMINI_RECONNECTS = 6;
const RECONNECT_BACKOFF = [1000, 2000, 4000, 8000, 12000, 16000]; // ms
const MESSAGE_BUFFER_LIMIT = 100;
const PING_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

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
}

const metrics: RelayMetrics = {
  activeConnections: 0,
  totalConnections: 0,
  totalMessages: 0,
  totalBytes: 0,
  geminiReconnects: 0,
  geminiReconnectFailures: 0,
  bufferOverflows: 0,
};

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
      res.end(
        JSON.stringify({
          status: "healthy",
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
  function connectToGemini(): WebSocket {
    const geminiUrl = `${GEMINI_WS_BASE}?key=${GEMINI_API_KEY}`;
    const ws = new WebSocket(geminiUrl);

    ws.on("open", () => {
      geminiAlive = true;
      console.log(`[Relay] Gemini connected for interview=${interviewId}`);

      // If reconnecting, resend the cached setup message first
      if (isReconnecting && setupMessage) {
        console.log(`[Relay] Resending setup message for interview=${interviewId}`);
        ws.send(setupMessage);
      }
      // Always drain buffered messages (handles initial connect race + reconnect)
      if (messageBuffer.length > 0) {
        console.log(`[Relay] Draining ${messageBuffer.length} buffered message(s) for interview=${interviewId}`);
        while (messageBuffer.length > 0) {
          const msg = messageBuffer.shift()!;
          ws.send(msg);
        }
      }
      isReconnecting = false;
    });

    ws.on("message", (data: Buffer | string) => {
      if (clientAlive) {
        metrics.totalMessages++;
        const size = typeof data === "string" ? data.length : data.byteLength;
        metrics.totalBytes += size;
        clientWs.send(data);
        resetIdle();
      }
    });

    ws.on("error", (err) => {
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
    const delay = RECONNECT_BACKOFF[reconnectAttempts] || 4000;
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
    } else {
      // Buffer during initial connect OR reconnect (cap at limit)
      if (messageBuffer.length < MESSAGE_BUFFER_LIMIT) {
        messageBuffer.push(data);
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
  const activeCount = wss.clients.size;
  console.log(
    `[Relay] SIGTERM received, draining ${activeCount} active session(s)...` +
    ` (drain window: ${GRACEFUL_DRAIN_MS}ms, kill_timeout: 15s)`
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
