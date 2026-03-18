-- ============================================
-- Create Supabase Storage Buckets
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('photos', 'photos', true),
  ('resumes', 'resumes', true),
  ('secure-recordings', 'secure-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Photos bucket: public read, authenticated write
-- ============================================

CREATE POLICY "Public read photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

CREATE POLICY "Auth upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.role() = 'authenticated');

CREATE POLICY "Auth update photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photos' AND auth.role() = 'authenticated');

-- ============================================
-- Resumes bucket: public read, authenticated write
-- ============================================

CREATE POLICY "Public read resumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes');

CREATE POLICY "Auth upload resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resumes' AND auth.role() = 'authenticated');

CREATE POLICY "Auth update resumes"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'resumes' AND auth.role() = 'authenticated');

-- ============================================
-- Secure recordings bucket: private, authenticated only
-- ============================================

CREATE POLICY "Auth upload recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'secure-recordings' AND auth.role() = 'authenticated');

CREATE POLICY "Auth read recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'secure-recordings' AND auth.role() = 'authenticated');
