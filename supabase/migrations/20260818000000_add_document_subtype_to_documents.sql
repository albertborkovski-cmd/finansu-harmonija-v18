ALTER TABLE documents
ADD COLUMN IF NOT EXISTS document_subtype text NOT NULL DEFAULT '';
