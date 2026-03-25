import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/', '/auth/signin', '/auth/signup', '/auth/verify', '/auth/callback'];
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }
  for (const prefix of publicPrefixes) {
    if (pathname.startsWith(prefix)) {
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
    const interviewPublicPattern = /^\/api\/interviews\/(accept|[^/]+\/(stream|validate|report-status|consent|pause|recording|voice|voice-init))$/;
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
  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname.startsWith(routePrefix)) {
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
