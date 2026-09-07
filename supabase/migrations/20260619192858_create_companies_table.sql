
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_code text NOT NULL,
  vat_code text NOT NULL,
  client_since integer NOT NULL,
  action_required integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_companies" ON companies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_companies" ON companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_companies" ON companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_companies" ON companies FOR DELETE TO authenticated USING (true);

INSERT INTO companies (name, company_code, vat_code, client_since, action_required) VALUES
  ('John Brick',    'ec6940fg5698', 'ec6940fg5698', 2019, 0),
  ('Alice Stone',   'ab1234cd5678', 'ab1234cd5678', 2021, 3),
  ('Bob Morris',    'xy9876zw5432', 'xy9876zw5432', 2020, 1),
  ('Carol White',   'mn3456op7890', 'mn3456op7890', 2022, 0),
  ('David Lane',    'qr2345st6789', 'qr2345st6789', 2018, 2),
  ('Emma Clarke',   'gh5678ij9012', 'gh5678ij9012', 2023, 0),
  ('Frank Hughes',  'cd3456ef7890', 'cd3456ef7890', 2017, 5),
  ('Grace Kim',     'wx8901yz2345', 'wx8901yz2345', 2022, 0),
  ('Henry Ford',    'op4567qr8901', 'op4567qr8901', 2020, 1),
  ('Iris Taylor',   'ij0123kl4567', 'ij0123kl4567', 2021, 0),
  ('James Wilson',  'ef7890gh1234', 'ef7890gh1234', 2019, 3),
  ('Karen Scott',   'st2345uv6789', 'st2345uv6789', 2023, 0),
  ('Leo Nolan',     'uv6789wx0123', 'uv6789wx0123', 2018, 2),
  ('Mia Turner',    'yz4567ab8901', 'yz4567ab8901', 2022, 0),
  ('Noah Reed',     'bc8901de2345', 'bc8901de2345', 2016, 7);
