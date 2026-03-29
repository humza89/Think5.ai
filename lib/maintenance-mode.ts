/**
 * Maintenance Mode — Graceful degradation for voice interview system
 *
 * When enabled, all voice endpoints return 503 with a user-friendly message.
 * Can be toggled via:
 *   1. Environment variable: MAINTENANCE_MODE=true
 *   2. Redis key: system:maintenance (for runtime toggling without redeploy)
 */

let redisClient: any = null;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    return null;
  }
}

const MAINTENANCE_KEY = "system:maintenance";
const DEFAULT_MESSAGE = "The interview system is undergoing scheduled maintenance. Please try again in a few minutes.";

/**
 * Check if maintenance mode is active.
 * Checks env var first (fast), then Redis key (runtime toggle).
 */
export async function isMaintenanceMode(): Promise<boolean> {
  // Environment variable takes precedence (set at deploy time)
  if (process.env.MAINTENANCE_MODE === "true") {
    return true;
  }

  // Check Redis for runtime toggle
  const redis = await getRedis();
  if (!redis) return false;

  try {
    const val = await redis.get(MAINTENANCE_KEY);
    return val === "true" || val === "1";
  } catch {
    return false;
  }
}

/**
 * Get the maintenance message to display to users.
 */
export async function getMaintenanceMessage(): Promise<string> {
  const redis = await getRedis();
  if (!redis) return DEFAULT_MESSAGE;

  try {
    const msg = await redis.get(`${MAINTENANCE_KEY}:message`);
    return typeof msg === "string" && msg.length > 0 ? msg : DEFAULT_MESSAGE;
  } catch {
    return DEFAULT_MESSAGE;
  }
}

/**
 * Enable or disable maintenance mode at runtime (via Redis).
 * Does not require a redeploy.
 */
export async function setMaintenanceMode(
  enabled: boolean,
  message?: string
): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    throw new Error("Cannot set maintenance mode without Redis");
  }

  if (enabled) {
    await redis.set(MAINTENANCE_KEY, "true");
    if (message) {
      await redis.set(`${MAINTENANCE_KEY}:message`, message);
    }
  } else {
    await redis.del(MAINTENANCE_KEY);
    await redis.del(`${MAINTENANCE_KEY}:message`);
  }
}

/**
 * Helper to create a 503 maintenance response for API routes.
 */
export function maintenanceResponse(message: string): Response {
  return Response.json(
    {
      error: "Service Unavailable",
      maintenance: true,
      message,
    },
    { status: 503 }
  );
}
