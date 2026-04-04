/**
 * lib/supabase.ts — Supabase client factory.
 *
 * THREE DIFFERENT CLIENTS — use the right one for the right context:
 *
 *  1. serverClient()         — Service role key. Bypasses ALL Row Level Security.
 *                              Use in API routes for upserts, admin reads. Never
 *                              expose this to the browser (it has full DB access).
 *
 *  2. createSupabaseServer() — Anon key + SSR cookie adapter. Reads the logged-in
 *                              user's session from the HTTP cookie. Use in Server
 *                              Components and middleware to call supabase.auth.getUser().
 *                              The cookies() import is done lazily inside the function
 *                              because next/headers can only be called in async Server
 *                              Component context, not at module load time.
 *
 *  3. createSupabaseBrowser() — Anon key, browser-side only. Use in Client Components
 *                               ("use client") for auth actions like signInWithPassword
 *                               and signUp. It automatically reads/writes the session
 *                               from localStorage and cookies in the browser.
 *
 * Key gotcha: next/headers cannot be imported at the top level of a shared module
 * because that module is also imported by client components, causing a build error.
 * Solution: import cookies() dynamically inside the async function body instead.
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient, createBrowserClient } from "@supabase/ssr";

// These env vars are validated at module load time so the app fails fast if misconfigured
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
if (!ANON_KEY)     throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");

// ---------------------------------------------------------------------------
// 1. Service-role client — bypasses RLS, server-side only
// ---------------------------------------------------------------------------

/**
 * Returns a Supabase client authenticated with the service role key.
 * This client ignores Row Level Security, so it can read/write any row.
 * Use ONLY in server-side API routes (never in client components or passed
 * to the browser in any form).
 *
 * persistSession: false prevents the service role key from being stored
 * in any session storage, which would be a security risk.
 */
export function serverClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// 2. SSR server client — reads auth session from cookies
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client that reads the user's auth session from the
 * request cookies. This is the correct way to check auth in Next.js 14
 * Server Components using @supabase/ssr.
 *
 * Why async + dynamic import?
 *   next/headers.cookies() is only available in async Server Component
 *   context. If we import it at the top of this file (a shared module),
 *   the build fails because this file is also imported by client components.
 *   Importing inside the function body avoids that problem.
 *
 * The setAll try/catch is required by @supabase/ssr: in Server Components,
 * the cookie store is read-only (you can't set cookies from a Server
 * Component). The middleware handles refreshing the session cookie instead.
 *
 * Usage:
 *   const supabase = await createSupabaseServer();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export async function createSupabaseServer() {
  // Dynamic import avoids top-level next/headers import in a shared module
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      // getAll: read every cookie from the current request
      getAll() {
        return cookieStore.getAll();
      },
      // setAll: write session cookies back to the response
      // Wrapped in try/catch because Server Components can't set cookies —
      // only Route Handlers and middleware can. The catch is a no-op for
      // Server Components; middleware handles the actual refresh.
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            cookieStore.set(name, value, options as never)
          );
        } catch {
          // Called from a Server Component — silently ignore. The
          // middleware.ts createServerClient will handle the refresh.
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// 3. Browser client — use in "use client" components
// ---------------------------------------------------------------------------

/**
 * Returns a Supabase client suitable for use in browser (Client Component)
 * code. Uses the public anon key and automatically stores the session in
 * browser storage. Safe to call multiple times — createBrowserClient caches
 * the instance internally.
 *
 * Use this for: supabase.auth.signInWithPassword, supabase.auth.signUp,
 * supabase.auth.signOut, and any client-side realtime subscriptions.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, ANON_KEY);
}

/**
 * @deprecated Use createSupabaseBrowser() in Client Components.
 * This plain createClient call does not use the @supabase/ssr cookie adapter
 * and therefore won't correctly refresh sessions across server/client boundary.
 */
export function browserClient() {
  return createClient(SUPABASE_URL, ANON_KEY);
}
