/**
 * app/page.tsx — Root redirect.
 *
 * When a user visits "/", redirect them to the dashboard ("/overview").
 * This ensures the app always lands on a meaningful page.
 */

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/overview");
}
