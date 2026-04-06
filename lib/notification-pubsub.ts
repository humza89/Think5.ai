/**
 * Notification pub/sub via Redis.
 * Replaces DB polling with event-driven notifications.
 */

import { logger } from "@/lib/logger";

let _redis: any = null;

async function getRedis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

export async function publishNotification(userId: string, notificationId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.zadd(`notifications:${userId}`, { score: Date.now(), member: notificationId });
    await redis.expire(`notifications:${userId}`, 86400);
  } catch (err) {
    logger.debug("[notification-pubsub] Failed to publish", err as Record<string, unknown>);
  }
}

export async function checkNewNotifications(userId: string, since: number): Promise<string[]> {
  const redis = await getRedis();
  if (!redis) return [];
  try {
    return (await redis.zrangebyscore(`notifications:${userId}`, since, "+inf")) as string[];
  } catch {
    return [];
  }
}

export async function acknowledgeNotifications(userId: string, notificationIds: string[]): Promise<void> {
  const redis = await getRedis();
  if (!redis || notificationIds.length === 0) return;
  try {
    await redis.zrem(`notifications:${userId}`, ...notificationIds);
  } catch {
    // Best effort
  }
}
