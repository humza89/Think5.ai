/**
 * Request correlation context (Phase 0 T12).
 *
 * proxy.ts assigns an `x-request-id` to every request and echoes it on the
 * response. Route handlers that opt in run their work inside
 * `runWithRequestContext`, after which `lib/logger` and `lib/otel` stamp
 * requestId / interviewId / tenantId on every log line and span without
 * threading them through call signatures.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId?: string;
  interviewId?: string;
  tenantId?: string;
}

export const REQUEST_ID_HEADER = "x-request-id";

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}

export function requestIdFrom(headers: { get(name: string): string | null }): string | undefined {
  return headers.get(REQUEST_ID_HEADER) ?? undefined;
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => Promise<T> | T): Promise<T> | T {
  const merged = { ...getRequestContext(), ...stripUndefined(context) };
  return storage.run(merged, fn);
}

/** Short, human-readable support id shown on error cards: `<interview8>-<request8>`. */
export { supportId } from "@/lib/support-id";

function stripUndefined(context: RequestContext): RequestContext {
  const out: RequestContext = {};
  for (const key of ["requestId", "interviewId", "tenantId"] as const) if (context[key] !== undefined) out[key] = context[key];
  return out;
}
