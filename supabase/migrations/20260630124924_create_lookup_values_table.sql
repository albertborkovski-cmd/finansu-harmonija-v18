/*
# Create lookup_values table

Stores reusable dropdown options for document line item fields.

1. New Tables
   - `lookup_values`
     - `id` (uuid, primary key)
     - `type` (text) — field category: 'cost_center', 'series', 'object_project', 'department_code', 'vat_class', 'division'
     - `value` (text) — the display/stored value
     - `created_at` (timestamp)

2. Security
   - RLS enabled with full anon+authenticated CRUD (single-tenant, no auth)

3. Notes
   - Unique constraint on (type, value) prevents duplicate entries per category
*/

CREATE TABLE IF NOT EXISTS lookup_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (type, value)
);

ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_lookup_values" ON lookup_values;
CREATE POLICY "anon_select_lookup_values" ON lookup_values FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_lookup_values" ON lookup_values;
CREATE POLICY "anon_insert_lookup_values" ON lookup_values FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_lookup_values" ON lookup_values;
CREATE POLICY "anon_update_lookup_values" ON lookup_values FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_lookup_values" ON lookup_values;
CREATE POLICY "anon_delete_lookup_values" ON lookup_values FOR DELETE
  TO anon, authenticated USING (true);
