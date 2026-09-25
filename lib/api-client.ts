/**
 * Canonical browser API client (Phase 0 T1).
 *
 * One CSRF strategy: proxy.ts issues an HttpOnly `csrf-token` cookie plus a
 * readable `csrf-token-client` mirror, and rejects every state-changing
 * /api request that does not echo the mirror in `x-csrf-token`. This module
 * is the only place browser code needs to know that.
 *
 * Two surfaces, one implementation:
 *
 * - `apiFetch(url, init)` is a drop-in replacement for `fetch` that adds the
 *   header on non-GET/HEAD requests and returns the raw `Response`. Existing
 *   call sites keep their `res.ok` / `res.json()` handling unchanged.
 * - `api.get/post/put/patch/delete<T>()` is the typed surface for new code:
 *   JSON in, parsed JSON out, and a typed `ApiError` on non-2xx.
 *
 * Both always send `credentials: "same-origin"`. Token-authenticated
 * `navigator.sendBeacon` calls (interview teardown) are outside this client
 * on purpose; the proxy exempts those routes.
 */
import { csrfHeaders } from "@/lib/csrf-client";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

function withCsrf(init: RequestInit = {}): RequestInit {
  const method = (init.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return { credentials: "same-origin", ...init };
  const headers = new Headers(init.headers ?? {});
  for (const [key, value] of Object.entries(csrfHeaders())) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return { credentials: "same-origin", ...init, headers };
}

/** `fetch` with the CSRF contract applied. Returns the Response untouched. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, withCsrf(init));
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await apiFetch(url, {
    ...init,
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const data = await parseBody(response);
  if (!response.ok) throw new ApiError(response.status, errorMessage(data, response.statusText || `HTTP ${response.status}`), data);
  return data as T;
}

export const api = {
  get: <T = unknown>(url: string, init?: RequestInit) => request<T>("GET", url, undefined, init),
  post: <T = unknown>(url: string, body?: unknown, init?: RequestInit) => request<T>("POST", url, body, init),
  put: <T = unknown>(url: string, body?: unknown, init?: RequestInit) => request<T>("PUT", url, body, init),
  patch: <T = unknown>(url: string, body?: unknown, init?: RequestInit) => request<T>("PATCH", url, body, init),
  delete: <T = unknown>(url: string, body?: unknown, init?: RequestInit) => request<T>("DELETE", url, body, init),
};
