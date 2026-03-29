/**
 * Toast Utilities — Typed wrappers around Sonner for common patterns.
 *
 * Usage:
 *   import { toastPromise, toastAction } from "@/lib/toast";
 *
 *   // Async operation with loading → success/error
 *   toastPromise(saveData(), {
 *     loading: "Saving...",
 *     success: "Saved!",
 *     error: "Failed to save",
 *   });
 *
 *   // Toast with undo action
 *   toastAction("Item deleted", {
 *     action: { label: "Undo", onClick: () => restoreItem() },
 *   });
 */

import { toast } from "sonner";

// ── Promise Toast ──────────────────────────────────────────────────────
// Wraps an async operation with loading → success/error lifecycle.

interface PromiseToastMessages<T> {
  loading: string;
  success: string | ((data: T) => string);
  error: string | ((err: unknown) => string);
}

export function toastPromise<T>(
  promise: Promise<T>,
  messages: PromiseToastMessages<T>
) {
  return toast.promise(promise, messages);
}

// ── Action Toast ───────────────────────────────────────────────────────
// Toast with a clickable action button (e.g., "Undo").

interface ActionToastOptions {
  action: {
    label: string;
    onClick: () => void;
  };
  cancel?: {
    label: string;
    onClick: () => void;
  };
  description?: string;
  duration?: number;
}

export function toastAction(message: string, options: ActionToastOptions) {
  return toast(message, {
    description: options.description,
    duration: options.duration ?? 5000,
    action: {
      label: options.action.label,
      onClick: options.action.onClick,
    },
    ...(options.cancel
      ? {
          cancel: {
            label: options.cancel.label,
            onClick: options.cancel.onClick,
          },
        }
      : {}),
  });
}

// ── Interview Status Toasts ────────────────────────────────────────────
// Specialized toasts for interview lifecycle events.

export const interviewToast = {
  connecting: () =>
    toast.loading("Connecting to interview...", { id: "interview-status" }),

  connected: () =>
    toast.success("Connected! Interview starting.", {
      id: "interview-status",
      duration: 2000,
    }),

  reconnecting: (attempt: number) =>
    toast.loading(`Reconnecting... (attempt ${attempt})`, {
      id: "interview-status",
    }),

  reconnected: () =>
    toast.success("Reconnected! Resuming interview.", {
      id: "interview-status",
      duration: 2000,
    }),

  completed: () =>
    toast.success("Interview completed! Your assessment will be ready shortly.", {
      id: "interview-status",
      duration: 5000,
    }),

  error: (message: string) =>
    toast.error(message, {
      id: "interview-status",
      duration: 6000,
    }),
};

// ── Recording Status Toasts ────────────────────────────────────────────

export const recordingToast = {
  uploading: () =>
    toast.loading("Uploading recording...", { id: "recording-status" }),

  saved: () =>
    toast.success("Recording saved", {
      id: "recording-status",
      duration: 2000,
    }),

  failed: (retry?: () => void) =>
    toast.error("Recording upload failed", {
      id: "recording-status",
      duration: 5000,
      ...(retry
        ? { action: { label: "Retry", onClick: retry } }
        : {}),
    }),
};
