
-- Create public storage bucket for document images
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-images', 'document-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read objects (public bucket)
CREATE POLICY "public_read_document_images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'document-images');

-- Allow authenticated users to upload
CREATE POLICY "auth_insert_document_images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'document-images');

-- Allow anon to upload too (no-auth app)
CREATE POLICY "anon_insert_document_images"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'document-images');
