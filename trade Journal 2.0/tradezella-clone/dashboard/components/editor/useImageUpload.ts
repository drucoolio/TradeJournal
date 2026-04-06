/**
 * components/editor/useImageUpload.ts
 *
 * React hook that encapsulates the Supabase Storage upload flow for note
 * images. Kept in its own file so the toolbar Image button can stay UI-only
 * and this logic can be tested or reused independently.
 *
 * Upload flow:
 *   1. Client asks /api/note-images/sign for a one-shot signed upload URL
 *      → { path, token, signedUrl }
 *   2. Client PUTs the file bytes straight to Supabase Storage via the
 *      supabase-js `uploadToSignedUrl` helper — bytes never round-trip
 *      through our Next.js server.
 *   3. Client asks /api/note-images/read for a signed READ URL tied to the
 *      same path so the <img> tag can render immediately.
 *
 * We STORE the storage path in the image `src` attribute in the DB.
 * Re-rendering old notes asks /read for a fresh signed URL at display time.
 * (This is handled in a future pass; for now the initial render uses the
 * signed URL returned from step 3 and the TipTap doc holds that URL.)
 */

"use client";

import { useCallback, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type UploadResult = { path: string; displayUrl: string };

/**
 * Lazy-built anon Supabase client for Storage uploads. The signed upload
 * token authorizes the write so the anon key is only used for transport.
 */
let _storageClient: ReturnType<typeof createClient> | null = null;
function storageClient() {
  if (_storageClient) return _storageClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  _storageClient = createClient(url, anon);
  return _storageClient;
}

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File): Promise<UploadResult | null> => {
    setError(null);
    setUploading(true);
    try {
      // 1) pull extension
      const dot = file.name.lastIndexOf(".");
      const ext = (dot >= 0 ? file.name.slice(dot + 1) : "png").toLowerCase();

      // 2) request a signed upload URL
      const signRes = await fetch("/api/note-images/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ext }),
      });
      if (!signRes.ok) throw new Error("Failed to get upload URL");
      const { path, token } = (await signRes.json()) as {
        path: string;
        token: string;
      };

      // 3) upload straight to storage via the signed token
      const supa = storageClient();
      const { error: upErr } = await supa.storage
        .from("note-images")
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || `image/${ext}`,
        });
      if (upErr) throw upErr;

      // 4) ask for an immediate signed READ URL to render
      const readRes = await fetch("/api/note-images/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!readRes.ok) throw new Error("Failed to get read URL");
      const { url } = (await readRes.json()) as { url: string };

      return { path, displayUrl: url };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Image upload failed";
      console.error("[useImageUpload]", msg);
      setError(msg);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading, error };
}
