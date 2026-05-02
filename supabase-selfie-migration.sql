-- Add selfie columns to time_logs
ALTER TABLE public.time_logs 
ADD COLUMN IF NOT EXISTS selfie_in TEXT,
ADD COLUMN IF NOT EXISTS selfie_out TEXT;

-- Storage policy: workers can upload their own selfies
INSERT INTO storage.buckets (id, name, public) 
VALUES ('selfies', 'selfies', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "selfies_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'selfies' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.workers WHERE auth_user_id = auth.uid()
    )
  );

-- Allow authenticated users to read their own selfies
CREATE POLICY "selfies_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'selfies' AND
    auth.role() = 'authenticated'
  );
