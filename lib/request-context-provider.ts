/**
 * Browser-safe registry for the ambient request context (Phase 0 T12).
 *
 * `lib/logger.ts` is shared by client and server bundles, so it cannot import
 * `lib/request-context.ts` (node:async_hooks). Server code registers the real
 * provider when it loads; in the browser the provider stays empty.
 */
export interface RequestContext {
  requestId?: string;
  interviewId?: string;
  tenantId?: string;
}

let provider: () => RequestContext = () => ({});

export function setRequestContextProvider(fn: () => RequestContext): void {
  provider = fn;
}

export function currentRequestContext(): RequestContext {
  try {
    return provider() ?? {};
  } catch {
    return {};
  }
}
