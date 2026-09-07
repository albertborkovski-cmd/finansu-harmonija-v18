/*
# Create document_history table

1. New Tables
- `document_history`
  - `id` (uuid, primary key)
  - `document_id` (uuid, FK to documents.id, cascade delete)
  - `action` (text) — the new status value applied (e.g. "Paid", "Rejected")
  - `user_name` (text) — accountable/responsible person name from the document
  - `details` (text) — human-readable description of what changed
  - `created_at` (timestamptz) — when the action occurred

2. Security
- Enable RLS on `document_history`.
- Allow anon + authenticated SELECT, INSERT (consistent with documents table).

3. Notes
- History rows are inserted when a document's status changes.
- Cascade delete ensures history is removed when a document is deleted.
*/

CREATE TABLE IF NOT EXISTS document_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  action text NOT NULL,
  user_name text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE document_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_document_history" ON document_history;
CREATE POLICY "anon_select_document_history" ON document_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_document_history" ON document_history;
CREATE POLICY "anon_insert_document_history" ON document_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_document_history" ON document_history;
CREATE POLICY "anon_update_document_history" ON document_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_document_history" ON document_history;
CREATE POLICY "anon_delete_document_history" ON document_history FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS document_history_document_id_idx ON document_history(document_id);
CREATE INDEX IF NOT EXISTS document_history_created_at_idx ON document_history(created_at DESC);
