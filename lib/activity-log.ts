import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";

interface LogActivityParams {
  userId: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  sessionId?: string;
  requestPath?: string;
  requestMethod?: string;
  responseStatus?: number;
  userAgent?: string;
}

/**
 * Extract client IP address from request headers.
 * Checks X-Forwarded-For, X-Real-IP, then falls back to "unknown".
 */
export async function extractClientIp(): Promise<string> {
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    return hdrs.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Extract user agent from request headers.
 */
export async function extractUserAgent(): Promise<string> {
  try {
    const hdrs = await headers();
    return hdrs.get("user-agent") || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Log an activity event with full request context.
 * Retries once on failure before giving up.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  // Auto-populate IP and user agent if not provided
  if (!params.ipAddress) {
    params.ipAddress = await extractClientIp();
  }
  if (!params.userAgent) {
    params.userAgent = await extractUserAgent();
  }

  const data = {
    userId: params.userId,
    userRole: params.userRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: params.metadata ?? undefined,
    ipAddress: params.ipAddress,
    sessionId: params.sessionId ?? undefined,
    requestPath: params.requestPath ?? undefined,
    requestMethod: params.requestMethod ?? undefined,
    responseStatus: params.responseStatus ?? undefined,
    userAgent: params.userAgent ?? undefined,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.activityLog.create({ data });
      return;
    } catch (error) {
      if (attempt === 1) {
        Sentry.captureException(error, {
          extra: { action: params.action, entityType: params.entityType },
        });
      }
    }
  }
}
