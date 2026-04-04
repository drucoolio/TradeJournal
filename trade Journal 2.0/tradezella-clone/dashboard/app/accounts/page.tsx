/**
 * app/accounts/page.tsx — Redirect to the new settings accounts page.
 *
 * This page previously showed account cards for selection. That functionality
 * now lives at /settings/accounts inside the Settings layout with a table view.
 * This redirect keeps old bookmarks and the /api/connect success redirect working.
 */

import { redirect } from "next/navigation";

export default function AccountsPage() {
  redirect("/settings/accounts");
}
