/**
 * Error Classification — User-friendly error messages
 *
 * Maps technical error codes and messages to clear,
 * actionable messages for interview candidates.
 */

export interface ClassifiedError {
  title: string;
  message: string;
  action: string;
  severity: "info" | "warning" | "error" | "critical";
  recoverable: boolean;
}

/**
 * Classify an error into a user-friendly message with recovery guidance.
 */
export function classifyError(
  error: unknown,
  context?: { statusCode?: number; type?: string }
): ClassifiedError {
  const statusCode = context?.statusCode;
  const errorMessage =
    error instanceof Error ? error.message : String(error || "");

  // Network timeout
  if (
    errorMessage.includes("timeout") ||
    errorMessage.includes("AbortError") ||
    errorMessage.includes("network")
  ) {
    return {
      title: "Connection Timeout",
      message:
        "Your internet connection timed out. This is usually temporary.",
      action: "Check your Wi-Fi or try moving closer to your router.",
      severity: "warning",
      recoverable: true,
    };
  }

  // Session expired or duration exceeded (410)
  if (statusCode === 410 || errorMessage.includes("expired")) {
    const isDurationExceeded = errorMessage.includes("duration") || errorMessage.includes("time limit") || context?.type === "duration_exceeded";
    return {
      title: isDurationExceeded ? "Time Limit Reached" : "Session Expired",
      message: isDurationExceeded
        ? "The maximum interview duration has been reached. Your progress has been saved."
        : "Your interview session has expired.",
      action: isDurationExceeded
        ? "Your interview will be submitted automatically."
        : "Contact support if you need to reschedule your interview.",
      severity: isDurationExceeded ? "warning" as const : "error" as const,
      recoverable: false,
    };
  }

  // Server error (500)
  if (statusCode === 500 || errorMessage.includes("Internal server")) {
    return {
      title: "Temporary Issue",
      message:
        "We're experiencing a temporary issue. Your progress has been saved.",
      action: "Please wait a moment and try again.",
      severity: "warning",
      recoverable: true,
    };
  }

  // Auth error (401/403)
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    errorMessage.includes("Unauthorized")
  ) {
    return {
      title: "Access Denied",
      message: "Your access credentials are no longer valid.",
      action:
        "Please use the original invitation link to rejoin.",
      severity: "error",
      recoverable: false,
    };
  }

  // WebSocket / SSE close
  if (
    errorMessage.includes("WebSocket") ||
    errorMessage.includes("SSE") ||
    errorMessage.includes("connection")
  ) {
    return {
      title: "Connection Interrupted",
      message:
        "The voice connection was interrupted. We're attempting to reconnect.",
      action: "Please stay on this page while we restore your session.",
      severity: "warning",
      recoverable: true,
    };
  }

  // Conflict (409) — duplicate session
  if (statusCode === 409 || errorMessage.includes("already active")) {
    return {
      title: "Session Already Active",
      message:
        "This interview is already running in another tab or device.",
      action: "Close other tabs and refresh this page.",
      severity: "warning",
      recoverable: true,
    };
  }

  // Rate limited (429)
  if (statusCode === 429) {
    return {
      title: "Too Many Requests",
      message: "You're sending requests too quickly.",
      action: "Please wait a few seconds and try again.",
      severity: "info",
      recoverable: true,
    };
  }

  // Not found (404)
  if (statusCode === 404 || errorMessage.includes("not found")) {
    return {
      title: "Not Found",
      message: "The requested interview could not be found.",
      action: "Check your invitation link or contact support.",
      severity: "error",
      recoverable: false,
    };
  }

  // Service unavailable (503)
  if (statusCode === 503 || errorMessage.includes("unavailable")) {
    return {
      title: "Service Temporarily Unavailable",
      message: "Our servers are temporarily overloaded. Your progress has been saved.",
      action: "Please wait a minute and try again.",
      severity: "warning",
      recoverable: true,
    };
  }

  // Gateway timeout (504)
  if (statusCode === 504) {
    return {
      title: "Request Timed Out",
      message: "The server took too long to respond. This is usually temporary.",
      action: "Please try again in a few seconds.",
      severity: "warning",
      recoverable: true,
    };
  }

  // Payload too large (413)
  if (statusCode === 413 || errorMessage.includes("too large")) {
    return {
      title: "Data Too Large",
      message: "The recording chunk was too large to upload.",
      action: "This is usually temporary. The system will retry automatically.",
      severity: "warning",
      recoverable: true,
    };
  }

  // Checksum mismatch (422)
  if (statusCode === 422 || errorMessage.includes("checksum") || errorMessage.includes("corrupted")) {
    return {
      title: "Data Integrity Issue",
      message: "A recording chunk was corrupted during upload. Retrying automatically.",
      action: "No action needed — the system will retry.",
      severity: "info",
      recoverable: true,
    };
  }

  // Pause exceeded (410 with cancel)
  if (errorMessage.includes("pause") || errorMessage.includes("cancelled")) {
    return {
      title: "Interview Cancelled",
      message:
        "The interview was automatically cancelled due to exceeding the pause time limit.",
      action: "Contact your recruiter to schedule a new interview.",
      severity: "critical",
      recoverable: false,
    };
  }

  // Generic fallback — include error code for support reference
  const errorCode = statusCode ? `ERR-${statusCode}` : "ERR-UNKNOWN";
  return {
    title: "Something Went Wrong",
    message: `An unexpected error occurred. Your progress has been saved. (Reference: ${errorCode})`,
    action: "Try refreshing the page. If the issue persists, contact support with the reference code above.",
    severity: "error",
    recoverable: true,
  };
}
