/**
 * Session Store — Durable voice session state
 *
 * Uses Upstash Redis for serverless-compatible session persistence.
 * Falls back to in-memory Map if Redis is not configured.
 * Provides reconnect token generation and validation.
 */

import { randomUUID } from "crypto";

// Redis client (lazy-initialized)
let redisClient: any = null;
let redisAvailable = false;

async function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("Upstash Redis not configured. Using in-memory session fallback.");
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    redisAvailable = true;
    return redisClient;
  } catch {
    console.warn("Failed to initialize Redis client. Using in-memory fallback.");
    return null;
  }
}

// In-memory fallback
const memoryStore = new Map<string, string>();

const SESSION_TTL_SECONDS = 7200; // 2 hours

export interface SessionState {
  interviewId: string;
  transcript: Array<{ role: string; text: string; timestamp: string }>;
  moduleScores: Array<{ module: string; score: number; reason: string }>;
  questionCount: number;
  reconnectToken: string;
  lastActiveAt: string;
}

function sessionKey(interviewId: string): string {
  return `voice-session:${interviewId}`;
}

/**
 * Save voice session state to durable store.
 */
export async function saveSessionState(
  interviewId: string,
  state: SessionState
): Promise<void> {
  const key = sessionKey(interviewId);
  const serialized = JSON.stringify(state);

  const redis = await getRedis();
  if (redis) {
    await redis.set(key, serialized, { ex: SESSION_TTL_SECONDS });
  } else {
    memoryStore.set(key, serialized);
  }
}

/**
 * Retrieve voice session state from durable store.
 */
export async function getSessionState(
  interviewId: string
): Promise<SessionState | null> {
  const key = sessionKey(interviewId);

  const redis = await getRedis();
  if (redis) {
    const data = await redis.get(key);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data as SessionState;
  }

  const data = memoryStore.get(key);
  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Delete voice session state from durable store.
 */
export async function deleteSessionState(
  interviewId: string
): Promise<void> {
  const key = sessionKey(interviewId);

  const redis = await getRedis();
  if (redis) {
    await redis.del(key);
  } else {
    memoryStore.delete(key);
  }
}

/**
 * Generate a unique reconnect token for a voice session.
 * Stores the token in both the session state and the Interview record.
 */
export function generateReconnectToken(): string {
  return randomUUID();
}

/**
 * Validate a reconnect token against stored session state.
 */
export async function validateReconnectToken(
  interviewId: string,
  token: string
): Promise<SessionState | null> {
  const state = await getSessionState(interviewId);
  if (!state) return null;
  if (state.reconnectToken !== token) return null;
  return state;
}

/**
 * Check if Redis is available for session storage.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}
