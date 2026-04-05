/**
 * app/settings/security/page.tsx — Security settings page (Server Component).
 *
 * Renders inside the Settings layout (Sidebar + SettingsSidebar + content).
 * Currently contains only the password change form.
 *
 * Future additions could include:
 *   - Two-factor authentication (2FA) setup
 *   - Active sessions management
 *   - Login history / audit log
 */

import { requireAuth } from "@/lib/auth";
import PasswordForm from "./PasswordForm";

export default async function SecurityPage() {
  // Verify authentication — redirect to login if no session
  await requireAuth();

  return (
    <div className="py-4 max-w-lg">
      {/* Page heading */}
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Security settings</h2>

      {/* Password change section */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Change your password</h3>
        <p className="text-xs text-gray-500 mb-6">
          You must provide your current password in order to change it
        </p>

        <PasswordForm />
      </div>
    </div>
  );
}
