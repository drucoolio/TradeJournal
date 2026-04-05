/**
 * app/settings/profile/page.tsx — Profile settings page (Server Component).
 *
 * Loads the current user's profile data from Supabase Auth and renders:
 *   1. Avatar card on the left — shows user initials, full name, email, timezone
 *   2. Profile details form on the right — editable first name, last name,
 *      username, and email fields with a Save button
 *
 * Profile data is stored in Supabase Auth's user_metadata JSONB column:
 *   { first_name, last_name, username }
 * Email lives on the auth.users row directly.
 *
 * The form is a Client Component (ProfileForm) since it needs useState for
 * controlled inputs and fetch() to POST updates to /api/profile.
 */

import { requireAuth } from "@/lib/auth";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  // Get the authenticated user
  const user = await requireAuth();

  // Extract profile fields from user_metadata (may be empty if never set)
  const meta = user.user_metadata ?? {};
  const profile = {
    email: user.email ?? "",
    first_name: (meta.first_name as string) ?? "",
    last_name: (meta.last_name as string) ?? "",
    username: (meta.username as string) ?? "",
  };

  return (
    <div className="flex gap-8 py-4">
      {/* Left column — Avatar card */}
      <AvatarCard
        firstName={profile.first_name}
        lastName={profile.last_name}
        email={profile.email}
      />

      {/* Right column — Editable profile form */}
      <div className="flex-1">
        <ProfileForm initialProfile={profile} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AvatarCard — shows initials, name, email, and timezone
// ---------------------------------------------------------------------------

/**
 * Displays the user's avatar (initials-based), full name, email,
 * and current timezone. Static server-rendered card.
 */
function AvatarCard({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  // Build initials from first + last name, falling back to email initial
  const initials =
    (firstName?.[0] ?? "").toUpperCase() + (lastName?.[0] ?? "").toUpperCase() ||
    (email?.[0] ?? "U").toUpperCase();

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || email;

  // Detect timezone from the server's perspective (user will see their own
  // timezone once this becomes a client component or uses browser APIs)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const localTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });

  return (
    <div className="w-48 flex-shrink-0 text-center">
      {/* Circular avatar with initials */}
      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3 relative">
        <span className="text-2xl font-semibold text-gray-500">{initials}</span>
        {/* Camera icon overlay — placeholder for future image upload */}
        <div className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full border-2 border-gray-200
                        flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      </div>

      {/* User info */}
      <p className="text-sm font-semibold text-gray-900">{fullName}</p>
      <p className="text-xs text-gray-400 mt-0.5">{timezone.replace("_", " ")}</p>
      <p className="text-xs text-gray-400">
        {localTime}
      </p>

      {/* Image action buttons (non-functional for now) */}
      <button className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium
                         px-4 py-1.5 rounded-lg transition">
        Update image
      </button>
      <button className="block mx-auto mt-2 text-xs text-gray-400 hover:text-gray-600 transition">
        Remove image
      </button>
    </div>
  );
}
