/*
# Add image_url column to documents

1. Modified Tables
- `documents`
  - Add `image_url` (text, nullable) — stores the URL of an uploaded document preview image. When NULL, the UI shows an upload placeholder instead of a preview.

2. Security
- No RLS changes. Existing policies continue to govern access.

3. Important Notes
1. The column is nullable and has no default — existing rows will have `image_url = NULL`, which the UI renders as the upload placeholder.
2. No destructive changes. No data loss.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE documents ADD COLUMN image_url text;
  END IF;
END $$;