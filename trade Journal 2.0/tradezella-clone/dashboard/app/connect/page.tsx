/**
 * app/connect/page.tsx — Redirect to the new settings connect page.
 *
 * The connect account form now lives at /settings/connect inside the Settings
 * layout. This redirect keeps old bookmarks working.
 */

import { redirect } from "next/navigation";

export default function ConnectPage() {
  redirect("/settings/connect");
}
