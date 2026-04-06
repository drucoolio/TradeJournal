-- ============================================================
-- 007c_note_images_bucket.sql
--
-- Creates the private `note-images` bucket used for rich-note image
-- uploads, and RLS policies on `storage.objects` that restrict read
-- + write to the owner's folder.
--
-- PATH CONVENTION
-- ---------------
-- Every object is stored under `{user_id}/{uuid}.{ext}`. The first
-- folder segment IS the user id — the RLS policies rely on this.
-- Clients must enforce the same shape when calling the signed-upload
-- endpoint; the server also constructs paths this way so nothing
-- should ever land outside a user's folder.
--
-- IDEMPOTENCY
-- -----------
-- Bucket creation uses `on conflict do nothing`; policy creation is
-- guarded by DROP POLICY IF EXISTS. Safe to re-run.
-- ============================================================

-- Create the bucket (private, 5 MB per file, image mimetypes only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  false,
  5242880,                                   -- 5 MB
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- RLS policies on storage.objects for bucket 'note-images'
-- ------------------------------------------------------------
-- The first path segment must equal the caller's auth.uid() for both
-- reads and writes. This uses the storage.foldername() helper which
-- splits the object name on '/'.

drop policy if exists "note-images read own folder" on storage.objects;
create policy "note-images read own folder"
  on storage.objects for select
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "note-images insert own folder" on storage.objects;
create policy "note-images insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "note-images update own folder" on storage.objects;
create policy "note-images update own folder"
  on storage.objects for update
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "note-images delete own folder" on storage.objects;
create policy "note-images delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
