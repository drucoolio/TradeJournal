/**
 * app/settings/security/PasswordForm.tsx — Password change form.
 *
 * Client Component because it needs:
 *   - useState for controlled inputs and feedback state
 *   - fetch() to call /api/security/change-password
 *   - Client-side validation (match check, minimum length)
 *
 * FIELDS (mirrors Tradezella's security page):
 *   - Current password (required to verify identity)
 *   - New password (minimum 8 characters)
 *   - Confirm new password (must match new password)
 *   - Save button (disabled until all fields valid)
 *
 * FLOW:
 *   1. User fills in all three fields
 *   2. Client-side validation: passwords match, minimum length
 *   3. POST to /api/security/change-password
 *   4. API verifies current password via Supabase signInWithPassword
 *   5. API updates password via Supabase updateUser
 *   6. Success message shown, form resets
 */

"use client";

import { useState } from "react";

export default function PasswordForm() {
  // Form field state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI feedback state
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);

  // Validation checks
  const passwordsMatch = newPassword === confirmPassword;
  const minLength      = newPassword.length >= 8;
  const allFilled      = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;
  const isValid        = allFilled && passwordsMatch && minLength;

  /**
   * Submits the password change request to the API.
   * Resets form and shows success message on success.
   * Shows error message on failure (wrong current password, etc).
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || saving) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/security/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");

      // Success — reset form and show confirmation
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Current password */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400
                     transition bg-white"
          autoComplete="current-password"
        />
      </div>

      {/* New password */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400
                     transition bg-white"
          autoComplete="new-password"
        />
        {/* Minimum length hint — only shown after user starts typing */}
        {newPassword.length > 0 && !minLength && (
          <p className="text-xs text-amber-500 mt-1">Password must be at least 8 characters</p>
        )}
      </div>

      {/* Confirm new password */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Confirm new password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400
                     transition bg-white"
          autoComplete="new-password"
        />
        {/* Mismatch warning — only shown after user starts typing confirmation */}
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
        )}
      </div>

      {/* Error message from API */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Success message */}
      {success && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Password changed successfully
        </p>
      )}

      {/* Save button — disabled until all validation passes */}
      <button
        type="submit"
        disabled={!isValid || saving}
        className={`px-5 py-2 text-sm font-medium rounded-lg transition
          ${isValid && !saving
            ? "bg-indigo-600 hover:bg-indigo-500 text-white"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
