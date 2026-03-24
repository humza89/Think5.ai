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

  // Session expired (410)
  if (statusCode === 410 || errorMessage.includes("expired")) {
    return {
      title: "Session Expired",
      message: "Your interview session has expired.",
      action:
        "Contact support if you need to reschedule your interview.",
      severity: "error",
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

  // Generic fallback
  return {
    title: "Something Went Wrong",
    message: "An unexpected error occurred. Your progress has been saved.",
    action: "Try refreshing the page. If the issue persists, contact support.",
    severity: "error",
    recoverable: true,
  };
}
