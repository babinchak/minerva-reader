-- Migration: Storage policies for pdfs bucket (parity with epubs)
-- Date: 2025-03-05
-- Upload route uses service client; these enable future direct client access if needed

DROP POLICY IF EXISTS "Users can upload their own PDFs" ON storage.objects;
CREATE POLICY "Users can upload their own PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdfs' AND name LIKE 'books/' || auth.uid()::text || '/%'
);

DROP POLICY IF EXISTS "Users can read their own PDFs" ON storage.objects;
CREATE POLICY "Users can read their own PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdfs' AND name LIKE 'books/' || auth.uid()::text || '/%'
);

DROP POLICY IF EXISTS "Users can delete their own PDFs" ON storage.objects;
CREATE POLICY "Users can delete their own PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdfs' AND name LIKE 'books/' || auth.uid()::text || '/%'
);
