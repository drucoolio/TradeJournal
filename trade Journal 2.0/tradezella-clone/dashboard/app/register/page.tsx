/**
 * app/register/page.tsx — New user registration page.
 *
 * Client Component: needs React state for the form fields and validation feedback.
 *
 * FLOW:
 *   1. User fills in email, password, and password confirmation
 *   2. Client-side validation: passwords match + minimum length (before hitting API)
 *   3. createSupabaseBrowser().signUp() creates the account in Supabase Auth
 *   4. If email confirmation is DISABLED (our setting): user is signed in immediately
 *      → redirect to /accounts
 *   5. If email confirmation is ENABLED: Supabase sends a confirmation email,
 *      user needs to click it before they can sign in
 *
 * NOTE: Email confirmation is disabled in our Supabase project settings for
 * development convenience. To enable it later, go to:
 *   Supabase Dashboard → Authentication → Email → Enable email confirmations
 *
 * The middleware redirects already-authenticated users away from this page
 * to /accounts, so logged-in users never see the registration form.
 */

"use client"; // Required: uses useState, useRouter, browser Supabase client

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

/**
 * Registration page component.
 * Validates locally before calling Supabase to avoid unnecessary API calls.
 */
export default function RegisterPage() {
  const router = useRouter();

  // Controlled form field state
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState(""); // password confirmation field

  // UI feedback state
  const [error, setError]     = useState("");    // validation or API error message
  const [loading, setLoading] = useState(false); // disables button during async call

  /**
   * Handles form submission.
   * Runs client-side validation first, then calls Supabase signUp.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); // clear previous errors

    // Client-side validation — run before hitting the API to give instant feedback
    if (password !== confirm) {
      setError("Passwords don't match.");
      return; // bail out before loading state
    }
    if (password.length < 8) {
      // Supabase also enforces this server-side, but checking here gives faster feedback
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    // createSupabaseBrowser() creates a browser-side Supabase client using the anon key.
    // signUp() creates the user in Supabase Auth and automatically signs them in
    // (if email confirmation is disabled in the Supabase project settings).
    const supabase = createSupabaseBrowser();
    const { error: authError } = await supabase.auth.signUp({ email, password });

    if (authError) {
      // e.g. "User already registered", "Password should be at least 6 characters"
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Success: if email confirmation is disabled, the user is now signed in.
    // Navigate to settings/accounts where they can connect their first MT5 account.
    // router.refresh() re-runs Server Components so middleware sees the fresh session.
    router.push("/settings/accounts");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* App logo + name — same as login page for consistent branding */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              {/* Chart icon */}
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 4-8" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg">Trade Journal</span>
          </div>
        </div>

        {/* Registration card */}
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl px-6 py-8">
          <h1 className="text-white text-xl font-semibold mb-1">Create account</h1>
          <p className="text-gray-500 text-sm mb-6">Start tracking your trades</p>

          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
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
                autoComplete="new-password" // tells password managers to generate/save a new password
                placeholder="Min. 8 characters"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2.5
                           text-sm text-white placeholder-gray-600
                           focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Confirmation field — only exists to prevent typos, not stored anywhere */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2.5
                           text-sm text-white placeholder-gray-600
                           focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Error message — shown for validation failures OR Supabase errors */}
            {error && (
              <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900
                         text-white font-medium text-sm rounded-lg py-2.5 transition"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        {/* Link back to login for existing users */}
        <p className="text-center text-sm text-gray-600 mt-4">
          Already have an account?{" "}
          <a href="/login" className="text-indigo-400 hover:text-indigo-300 transition">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
