/**
 * middleware.ts — Next.js middleware for route-level auth protection.
 *
 * Runs on EVERY request before the page renders (edge runtime).
 * Two jobs:
 *   1. Refresh the Supabase session token — Supabase uses short-lived JWTs
 *      (access tokens) and longer-lived refresh tokens stored in cookies.
 *      We must call getUser() in the middleware to trigger a token refresh
 *      before the page renders, so Server Components always have a valid session.
 *
 *   2. Enforce route protection:
 *      - Unauthenticated users trying to access protected routes → redirect /login
 *      - Authenticated users on /login or /register → redirect /accounts
 *        (no point showing the login form to someone already logged in)
 *
 * PUBLIC_PATHS: routes that don't require authentication. The /api/auth prefix
 * is public because the signout handler needs to work even when the session
 * is expired.
 *
 * IMPORTANT (@supabase/ssr gotcha):
 *   We MUST use createServerClient here (not the regular createClient).
 *   createServerClient from @supabase/ssr handles reading AND writing cookies
 *   correctly in the edge middleware context. It refreshes the access token
 *   and writes the updated token back to the response cookies automatically.
 *   See: https://supabase.com/docs/guides/auth/server-side/nextjs
 *
 * IMPORTANT (Next.js 15 / @supabase/ssr pattern):
 *   After getUser(), we MUST return supabaseResponse (not a new NextResponse.next()).
 *   supabaseResponse may have updated Set-Cookie headers from the token refresh.
 *   Returning a different Response would drop those cookies, breaking session refresh.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
// Any pathname starting with these prefixes is allowed through without a session
const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

/**
 * Next.js middleware function — called before every route handler.
 * Must return a Response or NextResponse.
 */
export async function middleware(request: NextRequest) {
  // Start with a "pass through" response that we'll augment with Supabase cookies
  let supabaseResponse = NextResponse.next({ request });

  // Create a Supabase client that reads cookies from the request and writes
  // updated session cookies back to supabaseResponse
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read cookies from the incoming request
        getAll() {
          return request.cookies.getAll();
        },
        // Write updated cookies to both the request (for downstream use) and
        // the response (so the browser receives the refreshed token)
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Write to request object so Server Components see the updated cookies
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          // Create a new response with the updated request (carries the new cookies)
          supabaseResponse = NextResponse.next({ request });
          // Write updated cookies to the response headers (sent to the browser)
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            supabaseResponse.cookies.set(name, value, options as never)
          );
        },
      },
    },
  );

  // MUST call getUser() (not getSession()) — getUser() validates the token
  // with the Supabase server, preventing spoofed JWTs from bypassing auth.
  // getSession() only reads from the cookie without server verification.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  // Check if the current path starts with any of our public prefixes
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Rule 1: Unauthenticated access to a protected route → redirect to login
  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone(); // clone to preserve host, protocol, etc.
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Rule 2: Already logged-in user visiting login or register → redirect to settings/accounts
  // No point showing the auth form to someone who is already authenticated
  if (user && (pathname === "/login" || pathname === "/register")) {
    const accountsUrl = request.nextUrl.clone();
    accountsUrl.pathname = "/settings/accounts";
    return NextResponse.redirect(accountsUrl);
  }

  // Return the supabaseResponse — IMPORTANT: this may contain refreshed session
  // cookies from the token refresh. Do NOT replace with a plain NextResponse.next()
  return supabaseResponse;
}

/**
 * Route matcher — tells Next.js which paths to run this middleware on.
 * Excludes static files, image optimisation assets, and the favicon to avoid
 * unnecessary Supabase auth calls on every static asset request.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static  (static JS/CSS files)
     *   - _next/image   (Next.js image optimisation)
     *   - favicon.ico
     * This regex uses negative lookahead to exclude these paths.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
