/*
# Add company_id to documents table

1. Changes
- Add `company_id` (uuid, FK → companies.id) column to `documents`
- Distribute existing 30 seeded documents — 2 per company — using row_number
- Set column NOT NULL after update
- Add index on company_id for fast per-company queries

2. RLS
- No policy changes needed (authenticated USING(true) stays)

3. Notes
- Uses ROW_NUMBER() over created_at to deterministically assign existing rows
*/

ALTER TABLE documents ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- Distribute 2 docs per company to the 15 existing companies
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM documents
  WHERE company_id IS NULL
),
companies_numbered AS (
  SELECT id AS cid, ROW_NUMBER() OVER (ORDER BY name) AS cn
  FROM companies
)
UPDATE documents d
SET company_id = c.cid
FROM numbered n
JOIN companies_numbered c ON c.cn = CEIL(n.rn::numeric / 2)
WHERE d.id = n.id;

-- Enforce NOT NULL now that all rows are assigned
ALTER TABLE documents ALTER COLUMN company_id SET NOT NULL;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id);
