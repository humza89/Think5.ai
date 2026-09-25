import { createServerClient } from '@supabase/ssr';
import { matchesRoutePrefix } from '@/lib/route-prefix';
import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { applyRateLimit } from '@/lib/api-rate-limit';

// ─────────────────────────────────────────────────────────────────────
// CSRF protection + rate limiting (merged from the former middleware.ts;
// Next 16 allows only one of middleware.ts / proxy.ts)
//
// Generates a CSRF token per session and validates it on state-changing
// requests. Token stored in an HttpOnly cookie, validated via the
// X-CSRF-Token header.
//
// Exemptions:
// - GET, HEAD, OPTIONS requests (safe methods)
// - Webhook endpoints (use HMAC signature verification)
// - Health check endpoints
// - Interview accept endpoint (uses its own token flow)
// - Cron endpoints (server-to-server)
// - Next.js internal routes
// ─────────────────────────────────────────────────────────────────────

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_CLIENT_COOKIE_NAME = 'csrf-token-client';
const CSRF_HEADER_NAME = 'x-csrf-token';

const CSRF_EXEMPT_PATTERNS = [
  // T15: only the webhook receivers are CSRF-exempt (they are HMAC-verified);
  // connect / sync / links are cookie-authenticated writes and keep the CSRF check.
  /^\/api\/integrations\/[^/]+\/webhook$/,
  /^\/api\/v1\/health/, // Health checks
  /^\/api\/cron\//, // Server-to-server cron
  // T14: Inngest invokes registered functions with POST /api/inngest (and
  // registers with PUT). Those calls carry no session or CSRF cookie; the
  // serve handler verifies Inngest's request signature (INNGEST_SIGNING_KEY)
  // in production. Without this exemption no durable function could ever run.
  /^\/api\/inngest$/,
  /^\/api\/csp-report/, // CSP violation reports
  /^\/_next\//, // Next.js internals
  /^\/api\/auth\/callback/, // OAuth callbacks
  // T1: pre-session flows. The browser may not hold the CSRF cookie yet
  // (fresh device, cleared storage) and these routes are rate-limited and
  // token/credential-validated on their own. Still subject to applyRateLimit.
  /^\/api\/auth\/(register|forgot-password|reset-password|verify)$/,
  /^\/api\/auth\/sso\/callback/, // IdP POST binding
];

// Routes that use their own token validation (not session-based CSRF)
const TOKEN_AUTH_PATTERNS = [
  /^\/api\/interviews\/[^/]+\/voice/, // Voice endpoints use Bearer token
  /^\/api\/interviews\/[^/]+\/recording/, // Recording uses Bearer token
  /^\/api\/interviews\/[^/]+\/proctoring/, // Proctoring uses Bearer token
  /^\/api\/interviews\/[^/]+\/screen-capture/, // Screen capture uses Bearer token
  /^\/api\/interviews\/accept/, // Uses invitation token
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateCsrfToken(): string {
  return createHash('sha256')
    .update(randomUUID())
    .update(Date.now().toString())
    .digest('hex');
}

/**
 * Returns an early response when CSRF validation or rate limiting rejects
 * the request; otherwise null so the auth logic can run.
 */
async function enforceCsrfAndRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (SAFE_METHODS.has(method)) return null;
  if (!pathname.startsWith('/api/')) return null;

  // T1: rate-limit every state-changing API request first, including the
  // CSRF-exempt and token-authenticated routes (voice, recording, proctoring,
  // accept, pre-session auth). Previously those returned before the limiter.
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const rateLimitResponse = await applyRateLimit(pathname, clientIp);
  if (rateLimitResponse) return rateLimitResponse;

  if (CSRF_EXEMPT_PATTERNS.some((p) => p.test(pathname))) return null;
  if (TOKEN_AUTH_PATTERNS.some((p) => p.test(pathname))) return null;

  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken || !headerToken || headerToken !== cookieToken) {
    return NextResponse.json({ error: 'CSRF token validation failed' }, { status: 403 });
  }

  return null;
}

/** Ensures the CSRF cookies exist on whatever response is being returned. */
function attachCsrfCookies(request: NextRequest, response: NextResponse): NextResponse {
  const secure = process.env.NODE_ENV === 'production';
  let csrfToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  // Non-HttpOnly copy the client reads to send in the header
  if (!request.cookies.get(CSRF_CLIENT_COOKIE_NAME)?.value) {
    response.cookies.set(CSRF_CLIENT_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
  }

  return response;
}

// Routes that don't require authentication
const publicRoutes = [
  '/',
  '/product',
  '/ai-training',
  '/recruitment',
  '/about',
  '/research',
  '/contact',
  '/unauthorized',
  '/auth/signin',
  '/auth/signup',
  '/auth/verify',
  '/auth/callback',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/error', // T9: SSO / verification failure landing page
  '/api/integrations/greenhouse/webhook', // T15: HMAC-verified receiver, no session
  '/api/inngest', // T14: Inngest register/invoke (request-signature verified by the serve handler)
];
const publicPrefixes = ['/api/auth/', '/api/health', '/_next/', '/uploads/', '/Logos/', '/favicon', '/interview', '/reports/shared'];

// Route group → allowed roles mapping (deny-by-default for page routes)
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/admin':     ['admin'],
  '/candidate': ['candidate'],
  '/dashboard': ['recruiter', 'hiring_manager'],
  '/jobs':      ['recruiter', 'hiring_manager'],
  '/candidates':['recruiter'],
  '/pipeline':  ['recruiter', 'hiring_manager'],
  '/interviews':['recruiter', 'hiring_manager'],
  '/clients':   ['recruiter'],
  '/analytics': ['recruiter', 'hiring_manager'],
  '/search':    ['recruiter'],
  '/source':    ['recruiter'],
  '/invitations':['recruiter'],
  '/messaging': ['recruiter', 'hiring_manager'],
  '/team':      ['recruiter'],
  '/talent-pools':['recruiter'],
  '/passive-profiles':['recruiter'],
  '/settings':  ['recruiter', 'hiring_manager', 'candidate'],
  '/recruiter': ['recruiter'],
};

function getRoleHomePage(role: string): string {
  switch (role) {
    case 'admin': return '/admin';
    case 'candidate': return '/candidate/dashboard';
    case 'recruiter':
    case 'hiring_manager':
    default: return '/dashboard';
  }
}

const REQUEST_ID_HEADER = 'x-request-id';

/** T12: every request carries an id; clients may supply one, otherwise we mint it. */
function ensureRequestId(request: NextRequest): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  if (incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)) return incoming;
  const id = randomUUID();
  request.headers.set(REQUEST_ID_HEADER, id);
  return id;
}

export async function proxy(request: NextRequest) {
  const requestId = ensureRequestId(request);
  // HTTPS enforcement in production (tokens must never travel over HTTP)
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('x-forwarded-proto') !== 'https'
  ) {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl.toString(), 301);
  }

  const rejected = await enforceCsrfAndRateLimit(request);
  if (rejected) {
    rejected.headers.set(REQUEST_ID_HEADER, requestId);
    return rejected;
  }

  const response = await authorize(request);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return attachCsrfCookies(request, response);
}

async function authorize(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }
  // Segment-aware: '/interview' must not make '/interviews/*' public.
  for (const prefix of publicPrefixes) {
    if (matchesRoutePrefix(pathname, prefix)) {
      return NextResponse.next();
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — IMPORTANT: do not remove this
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // For API routes, return 401 if not authenticated
  // Exception: interview stream/validate routes use accessToken auth instead
  if (pathname.startsWith('/api/')) {
    // T2: every candidate token-authenticated interview route. Each one
    // validates the interview credential itself (lib/interview-credential).
    const interviewPublicPattern = /^\/api\/interviews\/(accept|[^/]+\/(stream|validate|report-status|report-stream|consent|pause|recording|proctoring|screen-capture|memory-status|replay|voice|voice-init|voice\/(turn-commit|fragment|recover|context|context-capsule)|session\/refresh))$/;
    if (interviewPublicPattern.test(pathname)) {
      return supabaseResponse;
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return supabaseResponse;
  }

  // For page routes, redirect to sign in
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/signin';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Role-based route protection (deny-by-default)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, onboarding_status, account_status')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return supabaseResponse;
  }

  // Account status gate — block suspended/deactivated users
  if (profile.account_status === 'suspended' || profile.account_status === 'deactivated') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/signin';
    url.searchParams.set('reason', 'account_' + profile.account_status);
    return NextResponse.redirect(url);
  }

  // Role-based route check
  // Segment-aware: '/candidate' must not claim '/candidates/*' for candidates.
  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (matchesRoutePrefix(pathname, routePrefix)) {
      if (!allowedRoles.includes(profile.role)) {
        return NextResponse.redirect(new URL(getRoleHomePage(profile.role), request.url));
      }
      break;
    }
  }

  // Onboarding/approval gates for candidates
  if (profile.role === 'candidate') {
    const os = profile.onboarding_status;
    const allowedPaths = ['/candidate/onboarding', '/candidate/settings', '/auth/'];
    const isAllowed = allowedPaths.some(p => pathname.startsWith(p));

    if (!isAllowed && os !== 'approved') {
      if (!os || os === 'not_started' || os === 'in_progress') {
        return NextResponse.redirect(new URL('/candidate/onboarding', request.url));
      }
      // pending_approval, rejected, on_hold → status page
      return NextResponse.redirect(new URL('/candidate/onboarding/status', request.url));
    }
  }

  // Onboarding gate for recruiters
  if (profile.role === 'recruiter') {
    const os = profile.onboarding_status;
    const isOnboardingPath = pathname.startsWith('/recruiter/onboarding');

    if (!isOnboardingPath && os !== 'completed' && os !== 'approved') {
      if (!os || os === 'not_started' || os === 'in_progress') {
        return NextResponse.redirect(new URL('/recruiter/onboarding', request.url));
      }
      // pending_approval, rejected → status page
      return NextResponse.redirect(new URL('/recruiter/onboarding/status', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)',
  ],
};
