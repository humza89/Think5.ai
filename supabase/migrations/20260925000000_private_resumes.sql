-- Phase 0 T5: resumes are PII. Make the bucket private and replace the
-- public-read policy with authenticated read. Readers obtain short-lived
-- signed URLs through lib/storage-urls.ts (service role, bypasses RLS).
-- Additive/idempotent: safe to re-run.

UPDATE storage.buckets SET public = false WHERE id = 'resumes';

DROP POLICY IF EXISTS "Public read resumes" ON storage.objects;

DO $$ BEGIN
  CREATE POLICY "Authenticated read resumes"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'resumes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
