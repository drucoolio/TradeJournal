/**
 * GET /api/account
 *
 * Returns the stored MT5 account info from the session cookie.
 * Used by client components on the overview page to read account data.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AccountInfo } from "@/lib/vps";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("mt5_account")?.value;

  if (!raw) {
    return NextResponse.json(
      { error: "No active MT5 session. Please connect first." },
      { status: 401 },
    );
  }

  try {
    const account = JSON.parse(raw) as AccountInfo;
    return NextResponse.json(account);
  } catch {
    return NextResponse.json(
      { error: "Corrupt session cookie. Please reconnect." },
      { status: 400 },
    );
  }
}
