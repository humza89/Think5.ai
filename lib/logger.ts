/**
 * Production-safe logger — replaces console.log/error across the codebase.
 *
 * In production: sends breadcrumbs to Sentry (no stdout noise).
 * In development: logs to console as usual.
 */

import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

export const logger = {
  info(message: string, extra?: Record<string, unknown>): void {
    if (isProduction) {
      Sentry.addBreadcrumb({
        category: "app",
        message,
        level: "info",
        data: extra,
      });
    } else {
      console.log(`[INFO] ${message}`, extra || "");
    }
  },

  warn(message: string, extra?: Record<string, unknown>): void {
    if (isProduction) {
      Sentry.addBreadcrumb({
        category: "app",
        message,
        level: "warning",
        data: extra,
      });
    } else {
      console.warn(`[WARN] ${message}`, extra || "");
    }
  },

  error(message: string, error?: unknown, extra?: Record<string, unknown>): void {
    if (isProduction) {
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: { message, ...extra } });
      } else {
        Sentry.captureMessage(message, {
          level: "error",
          extra: { error, ...extra },
        });
      }
    } else {
      console.error(`[ERROR] ${message}`, error || "", extra || "");
    }
  },

  debug(message: string, extra?: Record<string, unknown>): void {
    if (!isProduction) {
      console.log(`[DEBUG] ${message}`, extra || "");
    }
  },
};
