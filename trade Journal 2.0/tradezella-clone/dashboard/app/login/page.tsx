/**
 * app/login/page.tsx — Email + password sign-in page.
 *
 * This is a Client Component because it needs React state (form fields,
 * loading/error) and browser-side Supabase auth actions.
 *
 * FLOW:
 *   1. User enters email + password and submits the form
 *   2. createSupabaseBrowser().signInWithPassword() calls Supabase Auth
 *   3. On success: Supabase sets session cookies automatically, then we
 *      redirect to /accounts so the user can pick an MT5 account
 *   4. On failure: display the error message from Supabase (e.g. "Invalid login credentials")
 *
 * router.refresh() after push() is important: it tells Next.js to re-run
 * Server Components on the next navigation, so the middleware sees the
 * fresh session cookie and doesn't redirect back to /login.
 *
 * The middleware already handles the reverse redirect: if the user is
 * already logged in and navigates to /login, they get sent to /accounts.
 */

"use client"; // Required: uses useState, useRouter, browser Supabase client

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

/**
 * Login page component.
 * Uses local state for form fields and feedback — no global state needed.
 */
export default function LoginPage() {
  const router = useRouter();

  // Form field state — controlled inputs
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  // UI feedback state
  const [error, setError]     = useState("");   // error message from Supabase or validation
  const [loading, setLoading] = useState(false); // disables button during async call

  /**
   * Handles form submission.
   * e.preventDefault() stops the default HTML form POST — we handle it via fetch.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");    // clear any previous error
    setLoading(true);

    // createSupabaseBrowser() is the correct client for auth in Client Components.
    // It stores the session in cookies automatically (not localStorage).
    const supabase = createSupabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Supabase returns a message like "Invalid login credentials" — show it directly
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Success: session cookies have been set by Supabase.
    // Push to settings/accounts so the user can see their MT5 accounts.
    // router.refresh() re-runs Server Components so middleware sees the new session.
    router.push("/settings/accounts");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* App logo + name — same branding as Sidebar */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              {/* Chart icon — represents trading journal */}
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 4-8" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg">Trade Journal</span>
          </div>
        </div>

        {/* Card container — dark card on darker background */}
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl px-6 py-8">
          <h1 className="text-white text-xl font-semibold mb-1">Welcome back</h1>
          <p className="text-gray-500 text-sm mb-6">Sign in to your account</p>

          {/* Sign-in form — controlled inputs with autocomplete hints for password managers */}
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email" // hint for browser password managers
                placeholder="you@example.com"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2.5
                           text-sm text-white placeholder-gray-600
                           focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password" // tells password managers this is a login form
                placeholder="••••••••"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2.5
                           text-sm text-white placeholder-gray-600
                           focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Error banner — only shown when authError is set */}
            {error && (
              <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit button — disabled while loading to prevent double-submission */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900
                         text-white font-medium text-sm rounded-lg py-2.5 transition"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Link to registration for new users */}
        <p className="text-center text-sm text-gray-600 mt-4">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-indigo-400 hover:text-indigo-300 transition">
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}
