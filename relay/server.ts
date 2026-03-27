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
 * Deployment: Fly.io (or any long-lived Node.js host)
 * Protocol: WebSocket (wss://)
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { URL } from "url";

// ── Configuration ─────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "8080", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RELAY_JWT_SECRET = process.env.RELAY_JWT_SECRET;
const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

if (!GEMINI_API_KEY) {
  console.error("FATAL: GEMINI_API_KEY is required");
  process.exit(1);
}
if (!RELAY_JWT_SECRET) {
  console.error("FATAL: RELAY_JWT_SECRET is required");
  process.exit(1);
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
}

const metrics: RelayMetrics = {
  activeConnections: 0,
  totalConnections: 0,
  totalMessages: 0,
  totalBytes: 0,
};

// ── HTTP Server (health check) ────────────────────────────────────────

const httpServer = createServer(
  (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          activeConnections: metrics.activeConnections,
          totalConnections: metrics.totalConnections,
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

  // 2. Connect to Gemini Live with real API key
  const geminiUrl = `${GEMINI_WS_BASE}?key=${GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(geminiUrl);

  let clientAlive = true;
  let geminiAlive = false;

  // 3. Proxy: Client → Gemini
  clientWs.on("message", (data: Buffer | string) => {
    if (geminiAlive) {
      metrics.totalMessages++;
      const size = typeof data === "string" ? data.length : data.byteLength;
      metrics.totalBytes += size;
      geminiWs.send(data);
    }
  });

  // 4. Proxy: Gemini → Client
  geminiWs.on("open", () => {
    geminiAlive = true;
    console.log(`[Relay] Gemini connected for interview=${interviewId}`);
  });

  geminiWs.on("message", (data: Buffer | string) => {
    if (clientAlive) {
      metrics.totalMessages++;
      const size = typeof data === "string" ? data.length : data.byteLength;
      metrics.totalBytes += size;
      clientWs.send(data);
    }
  });

  // 5. Error handling
  geminiWs.on("error", (err) => {
    console.error(
      `[Relay] Gemini WS error for interview=${interviewId}:`,
      err.message
    );
    if (clientAlive) {
      clientWs.close(4502, "Upstream connection error");
    }
  });

  clientWs.on("error", (err) => {
    console.error(
      `[Relay] Client WS error for interview=${interviewId}:`,
      err.message
    );
    if (geminiAlive) {
      geminiWs.close();
    }
  });

  // 6. Cleanup on disconnect
  const cleanup = (source: string) => {
    console.log(
      `[Relay] Disconnected (${source}): interview=${interviewId}`
    );
    metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);

    if (clientAlive) {
      clientAlive = false;
      try {
        clientWs.close();
      } catch {
        // already closed
      }
    }
    if (geminiAlive) {
      geminiAlive = false;
      try {
        geminiWs.close();
      } catch {
        // already closed
      }
    }
  };

  clientWs.on("close", () => cleanup("client"));
  geminiWs.on("close", () => cleanup("gemini"));

  // 7. Idle timeout — close if no messages for 5 minutes
  let idleTimer = setTimeout(() => cleanup("idle_timeout"), 5 * 60 * 1000);

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => cleanup("idle_timeout"), 5 * 60 * 1000);
  };

  clientWs.on("message", resetIdle);
  geminiWs.on("message", resetIdle);
});

// ── Start ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[Relay] Voice relay server listening on port ${PORT}`);
  console.log(`[Relay] Health check: http://localhost:${PORT}/health`);
  console.log(`[Relay] WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Relay] SIGTERM received, shutting down...");
  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));
  httpServer.close(() => process.exit(0));
});
