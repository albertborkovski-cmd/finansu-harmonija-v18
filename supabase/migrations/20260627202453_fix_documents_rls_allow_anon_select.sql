DROP POLICY IF EXISTS "select_documents" ON documents;
CREATE POLICY "select_documents" ON documents FOR SELECT TO anon, authenticated USING (true);