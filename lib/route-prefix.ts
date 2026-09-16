/**
 * Path-segment aware prefix matching for route gates.
 *
 * A bare `pathname.startsWith(prefix)` lets `/interview` (candidate room,
 * public) swallow `/interviews/*` (recruiter pages) and `/candidate`
 * (candidate role) swallow `/candidates/*` (recruiter pages). A prefix
 * matches only the exact path or a longer path at a `/` boundary; prefixes
 * that already end in `/` behave as plain directory prefixes.
 */
export function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
