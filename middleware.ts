import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/auth/',
  '/api/auth/',
  '/api/health',
  '/interview/',       // Token-based access
  '/_next/',
  '/favicon',
];

// Route group → allowed roles mapping (deny-by-default)
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/admin':     ['admin'],
  '/candidate': ['candidate'],
  '/dashboard': ['recruiter', 'admin', 'hiring_manager'],
  '/jobs':      ['recruiter', 'admin', 'hiring_manager'],
  '/candidates':['recruiter', 'admin'],
  '/pipeline':  ['recruiter', 'admin', 'hiring_manager'],
  '/interviews':['recruiter', 'admin', 'hiring_manager'],
  '/clients':   ['recruiter', 'admin'],
  '/analytics': ['recruiter', 'admin', 'hiring_manager'],
  '/search':    ['recruiter', 'admin'],
  '/source':    ['recruiter', 'admin'],
  '/invitations':['recruiter', 'admin'],
  '/messaging': ['recruiter', 'admin', 'hiring_manager'],
  '/team':      ['recruiter', 'admin'],
  '/talent-pools':['recruiter', 'admin'],
  '/passive-profiles':['recruiter', 'admin'],
  '/settings':  ['recruiter', 'admin', 'hiring_manager', 'candidate'],
  '/recruiter': ['recruiter'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Skip API routes (they enforce their own auth)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Skip static assets and root page
  if (pathname === '/' || pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Create Supabase client for middleware
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session (important for keeping tokens alive)
  const { data: { user }, error } = await supabase.auth.getUser();

  // No session → redirect to sign in (for protected routes)
  if (error || !user) {
    const signinUrl = new URL('/auth/signin', request.url);
    signinUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(signinUrl);
  }

  // Fetch user profile for role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, account_status')
    .eq('id', user.id)
    .single();

  if (!profile) {
    const signinUrl = new URL('/auth/signin', request.url);
    return NextResponse.redirect(signinUrl);
  }

  // Block suspended/deactivated accounts
  const accountStatus = (profile as Record<string, unknown>).account_status as string | undefined;
  if (accountStatus === 'suspended' || accountStatus === 'deactivated') {
    return NextResponse.redirect(new URL('/auth/signin?error=account_disabled', request.url));
  }

  // Check role against route map
  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname.startsWith(routePrefix)) {
      if (!allowedRoles.includes(profile.role)) {
        // Redirect to their appropriate dashboard instead of /unauthorized
        const redirectUrl = getRoleHomePage(profile.role);
        return NextResponse.redirect(new URL(redirectUrl, request.url));
      }
      break;
    }
  }

  return response;
}

function getRoleHomePage(role: string): string {
  switch (role) {
    case 'admin': return '/admin';
    case 'candidate': return '/candidate/dashboard';
    case 'recruiter':
    case 'hiring_manager':
    default: return '/dashboard';
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
