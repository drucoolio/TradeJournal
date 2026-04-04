/**
 * app/settings/profile/ProfileForm.tsx — Editable profile details form.
 *
 * Client Component because it needs:
 *   - useState for controlled form inputs
 *   - fetch() to send updates to /api/profile
 *   - Loading/success/error feedback state
 *
 * FIELDS (mirrors Tradezella's profile page):
 *   - First name + Last name (side by side)
 *   - User name
 *   - Email
 *   - Save button (disabled when nothing has changed or while saving)
 *
 * All data is stored via Supabase Auth user_metadata except email,
 * which lives on the auth.users row directly.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shape of the profile data passed from the Server Component. */
interface ProfileData {
  email: string;
  first_name: string;
  last_name: string;
  username: string;
}

interface Props {
  initialProfile: ProfileData;
}

/**
 * ProfileForm — renders the "Profile details" card with editable fields.
 * Tracks dirty state so the Save button only activates when something changed.
 */
export default function ProfileForm({ initialProfile }: Props) {
  const router = useRouter();

  // Controlled form state — initialized from server-loaded data
  const [firstName, setFirstName] = useState(initialProfile.first_name);
  const [lastName, setLastName]   = useState(initialProfile.last_name);
  const [username, setUsername]   = useState(initialProfile.username);
  const [email, setEmail]         = useState(initialProfile.email);

  // UI feedback state
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState<"idle" | "saved" | "error">("idle");
  const [error, setError]     = useState("");

  // Dirty check — enable Save only when something actually changed
  const isDirty =
    firstName !== initialProfile.first_name ||
    lastName !== initialProfile.last_name ||
    username !== initialProfile.username ||
    email !== initialProfile.email;

  /**
   * Sends the updated profile fields to /api/profile via PUT.
   * Only sends fields that have actually changed.
   */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty || saving) return;

    setSaving(true);
    setStatus("idle");
    setError("");

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          username,
          email,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setStatus("saved");
      // Re-run Server Component so the avatar card updates with the new name
      router.refresh();

      // Reset "saved" indicator after 3 seconds
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Profile details</h2>

      <form onSubmit={handleSave} className="space-y-5 max-w-lg">
        {/* First name + Last name — side by side */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1.5">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         placeholder-gray-400 focus:outline-none focus:border-indigo-400
                         focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1.5">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         placeholder-gray-400 focus:outline-none focus:border-indigo-400
                         focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">User name</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                       placeholder-gray-400 focus:outline-none focus:border-indigo-400
                       focus:ring-1 focus:ring-indigo-400 transition"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                       placeholder-gray-400 focus:outline-none focus:border-indigo-400
                       focus:ring-1 focus:ring-indigo-400 transition"
          />
        </div>

        {/* Error message */}
        {status === "error" && error && (
          <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Save button + success indicator */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!isDirty || saving}
            className={`text-sm font-medium px-5 py-2 rounded-lg transition
              ${isDirty
                ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            {saving ? "Saving…" : "Save"}
          </button>

          {status === "saved" && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
