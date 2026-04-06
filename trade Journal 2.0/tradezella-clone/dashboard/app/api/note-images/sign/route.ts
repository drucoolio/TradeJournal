/**
 * app/api/note-images/sign/route.ts
 *
 * POST body: { ext: 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif' }
 * → { path: string, token: string, publicUrl: string }
 *
 * Issues a one-shot upload URL for the `note-images` Storage bucket.
 * The client then PUTs the image bytes straight to Supabase Storage
 * using the returned token, never round-tripping bytes through our
 * Next.js server. We use `createSignedUploadUrl` which the client
 * can use with Supabase's storage-js `uploadToSignedUrl` helper.
 *
 * PATH CONVENTION
 * ---------------
 * {user_id}/{uuid}.{ext}
 * The first folder segment is the user's id — matches the RLS policy
 * on storage.objects created in 007c_note_images_bucket.sql.
 *
 * SECURITY
 * --------
 * - Requires an authenticated user.
 * - Extension allowlist is enforced here; the bucket's mime allowlist
 *   is a second layer.
 * - UUIDv4 random filename so callers can't guess/trample paths.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { apiAuth, unauthorized, badRequest } from "@/lib/api-helpers";

const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function POST(req: Request) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const ext = String((body as { ext?: unknown }).ext ?? "").toLowerCase().replace(/^\./, "");
  if (!ALLOWED_EXT.has(ext)) {
    return badRequest(`Extension must be one of: ${Array.from(ALLOWED_EXT).join(", ")}`);
  }

  // Build the path: {user_id}/{uuid}.{ext}
  const path = `${ctx.userId}/${randomUUID()}.${ext}`;

  try {
    const { data, error } = await ctx.supa.storage
      .from("note-images")
      .createSignedUploadUrl(path);
    if (error) throw error;

    // Construct a public URL the editor can use as the <img src>.
    // Note: bucket is private, so this URL requires a signed READ URL at
    // render time. The client layer is responsible for calling
    // createSignedUrl() when rendering. We return the storage path
    // so the client knows what to sign later.
    return NextResponse.json({
      path,                // "uid/uuid.png" — store this alongside the image
      token: data.token,   // used with uploadToSignedUrl on the client
      signedUrl: data.signedUrl,
    });
  } catch (err) {
    console.error("[note-images sign]", err);
    return NextResponse.json({ error: "Failed to issue upload URL" }, { status: 500 });
  }
}
