/**
 * app/api/note-images/read/route.ts
 *
 * POST body: { path: string }
 * → { url: string }
 *
 * Issues a short-lived signed READ URL for a file in the private
 * `note-images` bucket, so `<img>` tags inside rich notes can render.
 * RLS on storage.objects still applies — a user who asks for a path
 * that isn't in their own folder will get a 400/500 response.
 *
 * TTL is kept short (60 minutes) so URLs don't leak persistently.
 * The client should lazily re-sign if a signed URL expires.
 */

import { NextResponse } from "next/server";
import { apiAuth, unauthorized, badRequest } from "@/lib/api-helpers";

const TTL_SECONDS = 60 * 60; // 1 hour

export async function POST(req: Request) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const path = String((body as { path?: unknown }).path ?? "");
  if (!path) return badRequest("path is required");

  // Cheap defense-in-depth: reject any path that doesn't start with the
  // caller's user id. RLS would also reject it, but bailing early
  // saves a round-trip and gives a clearer error.
  if (!path.startsWith(`${ctx.userId}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data, error } = await ctx.supa.storage
      .from("note-images")
      .createSignedUrl(path, TTL_SECONDS);
    if (error) throw error;
    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error("[note-images read]", err);
    return NextResponse.json({ error: "Failed to sign read URL" }, { status: 500 });
  }
}
