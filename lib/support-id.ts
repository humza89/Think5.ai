/**
 * Support ID (Phase 0 T12) — browser-safe. `lib/request-context.ts` re-exports
 * this for server code; client components must import from here because the
 * request-context module depends on node:async_hooks.
 */
export function supportId(interviewId: string | undefined, requestId: string | undefined): string | null {
  if (!interviewId && !requestId) return null;
  return [interviewId?.slice(0, 8), requestId?.slice(0, 8)].filter(Boolean).join("-");
}
