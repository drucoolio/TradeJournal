import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase";

/**
 * Root page — redirect to /settings/accounts (if logged in) or /login (if not).
 * Logged-in users land on the settings accounts page where they can see all
 * their linked MT5 accounts and click one to open the dashboard.
 */
export default async function RootPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/settings/accounts" : "/login");
}
