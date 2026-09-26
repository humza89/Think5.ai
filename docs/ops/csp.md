# Content-Security-Policy architecture (Issue #14)

Status: implemented on `main` by the Issue #14 PR. Replaces the temporary
`'unsafe-inline'` allowance that PR #16 added to the app-route `script-src`
so hard loads could hydrate.

## Policies by route

| Route class | Where the header is set | `script-src` | Why |
| --- | --- | --- | --- |
| App / authenticated pages: `/dashboard`, `/candidates`, `/candidate/*`, `/admin/*`, `/interview/*`, `/interviews/*`, `/jobs/*`, `/reports/shared/*`, `/recruiter/*`, `/settings`, … (everything not listed below) | `proxy.ts` → `applyNonceCsp()` per request | `'nonce-<128-bit>' 'strict-dynamic'` | Next.js App Router stamps the request nonce on every script it renders; scripts those trusted scripts insert are allowed by `'strict-dynamic'`. No inline or host allowance is needed. |
| `/` and the public marketing + auth pages (`/product`, `/recruitment`, `/about`, `/ai-training`, `/research`, `/contact`, `/unauthorized`, `/auth/*`) | `next.config.ts` `headers()` (static) | `'self' 'unsafe-inline'` | Static, CDN-cacheable pages. A nonce would force dynamic rendering of the marketing site for no security gain: these pages carry no session and no user data. Intentionally scoped and reviewed. |
| `/spline-embed` | `next.config.ts` (static) | `'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://prod.spline.design` | The Spline runtime needs `eval`. It is isolated in a sandboxed iframe on this single route with `frame-ancestors 'self'`. |
| `/api/*` | `next.config.ts` (static) | `'self' 'unsafe-inline'` (pre-#14 strict policy, unchanged) | JSON responses execute nothing; the few HTML exports (evidence bundle) open in their own tab. Kept static so API responses stay cacheable where routes allow it. |
| Static assets (`/_next/*`, images, fonts) | none | — | Not documents. |

Every other directive is shared between the app and API policies
(`lib/csp.ts` → `appDirectives`): `default-src 'self'`, `style-src 'self'
'unsafe-inline'` (Tailwind/inline style attributes; unchanged), `img-src`,
`connect-src` (Supabase, Upstash, Gemini Live, the Fly relay, Spline CDN),
`media-src`, `font-src`, `frame-src`, `frame-ancestors 'none'`,
`report-uri /api/csp-report`. `'unsafe-eval'` exists only on `/spline-embed`.

## How the nonce flows

1. `proxy.ts` runs for every non-asset request. For an `app` route
   (`cspModeFor()` in `lib/csp.ts`) it generates a 16-byte random nonce
   (`crypto.getRandomValues`, base64) and builds the policy with
   `buildAppCsp(nonce)`.
2. The policy is set as the **request** header `Content-Security-Policy`
   and the nonce as `x-nonce`. Every `NextResponse.next({ request })` in the
   proxy forwards these mutated request headers to the renderer. Next.js
   reads the nonce from the CSP request header and adds `nonce="…"` to the
   inline RSC payload scripts, the hydration bootstrap and the chunk
   `<script src>` tags it emits. Application code that renders its own
   `<script>` can read `x-nonce` through `headers()`.
3. The same policy is set on the **response** (never on redirects, which
   carry no document).
4. Regression coverage: `e2e/hard-navigation.spec.ts` (signed-out
   `/interview/accept?token=…` hard load + refresh, `/interviews` redirect,
   marketing/auth pages keep the static policy) and
   `e2e/golden/csp-nonce.spec.ts` (signed-in hard load + refresh of
   `/dashboard`, the dynamic job detail route and `/candidate/dashboard`).
   Each asserts the exact `script-src`, that the document hydrated past the
   client-only "Loading..." shell, that every script tag carries the nonce,
   that the two documents got different nonces, and that the console shows
   no CSP violation. `__tests__/lib/csp.test.ts` locks the route → policy
   mapping and the directive set.

## Caching and rendering trade-off

A nonce is unique per response, so a nonced document cannot be served from
a shared cache or a build-time prerender. Measured with `next build` on
`main` (69452fc) and on the Issue #14 head:

| Route class | Before (`main`) | After |
| --- | --- | --- |
| App routes (`/dashboard`, `/interview/accept`, `/candidates`, …) | mostly `○` static prerenders of the client shell (the guard's "Loading..." HTML) | `ƒ` dynamic: the shell is server-rendered per request so the nonce can be stamped into it |
| `/reports/shared/[token]` | `ƒ` dynamic | `ƒ` dynamic (unchanged) |
| `/`, `/product`, `/recruitment`, `/about`, `/ai-training`, `/research`, `/contact`, `/unauthorized`, `/auth/*` | `○` static | `○` static — pinned with `export const dynamic = "force-static"` on those segments |

Why app routes must be dynamic: the root layout reads `headers()` to pass
the nonce to the theme provider's inline script, and Next.js can only stamp
a per-request nonce on framework scripts it renders per request. A
statically prerendered shell would carry no nonce and be blocked by the
policy. The cost is one server render of a small client shell per app-route
request (no data fetching happens in that render; every app page fetches
after hydration as before). App routes were never CDN-cacheable in a useful
way: they are session-gated by the proxy and immediately fetch per-user
data.

Why the public pages stay static: they carry no session and no user data,
so they keep `script-src 'self' 'unsafe-inline'` and a build-time prerender
(`force-static` makes the root layout's `headers()` read return empty, so no
nonce is needed there). If a public page ever renders user-controlled
content, move it to the app policy by dropping the pin.

Cost per app-route request in the proxy: one `crypto.getRandomValues` and a
string build. No additional database or network work.

## Why `'unsafe-inline'` is no longer needed on app routes

Next.js needs inline scripts for streaming the RSC payload
(`self.__next_f.push(...)`) and for the hydration bootstrap. With
`'unsafe-inline'` those ran because *any* inline script could run — including
one injected through a markup-injection bug. With the nonce, only scripts
carrying the per-response nonce run; an attacker cannot know it in
advance. `'strict-dynamic'` then lets the trusted bootstrap load the
route's chunks without a host allow-list, and makes browsers ignore any
`'self'`/`'unsafe-inline'` fallback tokens, which is why the app policy
lists neither.

## Security review of the resulting headers

Reviewed on the final head of the Issue #14 PR:

- `script-src 'nonce-…' 'strict-dynamic'` on app routes; no
  `'unsafe-inline'`, `'unsafe-eval'` or host sources. Nonce is 128 bits,
  base64, validated by `buildAppCsp` so a malformed value cannot break out
  of the directive.
- `style-src 'self' 'unsafe-inline'` is unchanged (out of #14's scope; a
  style nonce would require removing inline `style=` attributes across the
  UI). CSS injection cannot execute script under this policy.
- `frame-ancestors 'none'` plus `X-Frame-Options: DENY` on app routes;
  `frame-ancestors 'self'` only on the Spline embed.
- `report-uri /api/csp-report` remains, so any regression in production
  shows up as violation reports.
- Auth, CSRF and rate-limit behaviour in `proxy.ts` is untouched; the nonce
  step runs after CSRF/rate-limit rejection and before authorisation, and
  only mutates headers.
- Public/marketing/auth pages intentionally keep `'unsafe-inline'`; they are
  static, carry no session and hold no user data. Revisit if a marketing page
  ever renders user-controlled content.
