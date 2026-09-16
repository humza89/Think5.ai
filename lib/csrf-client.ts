/**
 * Browser-side CSRF helper.
 *
 * proxy.ts issues two cookies per visitor: an HttpOnly `csrf-token` and a
 * readable `csrf-token-client` mirror. Every state-changing request to /api
 * must echo the mirror in the `x-csrf-token` header, otherwise the proxy
 * answers 403 before the route handler runs.
 *
 * Phase 0 T1 folds this into the shared API client; until then callers
 * spread `csrfHeaders()` into their fetch headers.
 */
export const CSRF_CLIENT_COOKIE_NAME = "csrf-token-client";
export const CSRF_HEADER_NAME = "x-csrf-token";

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${CSRF_CLIENT_COOKIE_NAME}=`;
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!entry) return null;
  const value = entry.slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
}

export function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}
