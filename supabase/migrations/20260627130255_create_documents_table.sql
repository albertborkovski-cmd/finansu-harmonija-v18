/*
# Create documents table

1. New Tables
- `documents`
  - `id` (uuid, primary key)
  - `receive_date` (text) — display format DD.MM.YYYY
  - `client_counterparty` (text)
  - `document_type` (text) — e.g. VAT invoice, Credit note
  - `source` (text) — Email, Upload, Manual
  - `total_amount` (text) — pre-formatted with € symbol
  - `due_end_date` (text) — display format DD.MM.YYYY
  - `file_case` (text) — filename
  - `order_no` (text)
  - `number` (text) — series+number
  - `type` (text) — Income or Expense
  - `document_date` (text)
  - `document_purpose` (text)
  - `invoice_contract_date` (text)
  - `operation_date` (text)
  - `expense_account` (text)
  - `vat_classifier` (text)
  - `currency` (text)
  - `amount_without_vat` (text)
  - `vat` (text)
  - `vat_percent` (text)
  - `department_code` (text)
  - `object_project` (text)
  - `valid_form` (text)
  - `accountable_responsible` (text)
  - `cost_center` (text)
  - `series` (text)
  - `status` (text) — Pending, Paid, Overdue, Draft
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `documents`.
- Authenticated users can SELECT/INSERT/UPDATE/DELETE (shared business data, no per-user isolation).

3. Seed Data
- 30 sample documents inserted.
*/

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receive_date text NOT NULL,
  client_counterparty text NOT NULL DEFAULT '',
  document_type text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  total_amount text NOT NULL DEFAULT '',
  due_end_date text NOT NULL DEFAULT '',
  file_case text NOT NULL DEFAULT '',
  order_no text NOT NULL DEFAULT '',
  number text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT '',
  document_date text NOT NULL DEFAULT '',
  document_purpose text NOT NULL DEFAULT '',
  invoice_contract_date text NOT NULL DEFAULT '',
  operation_date text NOT NULL DEFAULT '',
  expense_account text NOT NULL DEFAULT '',
  vat_classifier text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'EUR',
  amount_without_vat text NOT NULL DEFAULT '',
  vat text NOT NULL DEFAULT '',
  vat_percent text NOT NULL DEFAULT '',
  department_code text NOT NULL DEFAULT '',
  object_project text NOT NULL DEFAULT '',
  valid_form text NOT NULL DEFAULT '',
  accountable_responsible text NOT NULL DEFAULT '',
  cost_center text NOT NULL DEFAULT '',
  series text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_documents" ON documents;
CREATE POLICY "select_documents" ON documents FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_documents" ON documents;
CREATE POLICY "insert_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_documents" ON documents;
CREATE POLICY "update_documents" ON documents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_documents" ON documents;
CREATE POLICY "delete_documents" ON documents FOR DELETE
  TO authenticated USING (true);

INSERT INTO documents (receive_date,client_counterparty,document_type,source,total_amount,due_end_date,file_case,order_no,number,type,document_date,document_purpose,invoice_contract_date,operation_date,expense_account,vat_classifier,currency,amount_without_vat,vat,vat_percent,department_code,object_project,valid_form,accountable_responsible,cost_center,series,status) VALUES
('01.01.2025','UAB Robolabs','VAT invoice','Email','266.20 €','15.02.2025','TTP9470000.pdf','ORD-0941','TTP-001','Income','31.12.2024','Services','01.01.2025','01.01.2025','6000','PVM1','EUR','220.00 €','46.20 €','21%','DEP-01','PROJ-A','Standard','J. Pavardenis','CC-100','TTP','Pending'),
('07.01.2025','MB Technologijos','Credit note','Upload','483.68 €','21.02.2025','CR9470001.pdf','ORD-0940','CR-002','Expense','06.01.2025','Consulting','01.01.2025','07.01.2025','5000','PVM1','EUR','399.74 €','83.94 €','21%','DEP-02','PROJ-B','Standard','A. Varduonis','CC-200','CR','Paid'),
('13.01.2025','UAB Sprendimų grupė','Receipt','Manual','720.97 €','27.02.2025','EXP9470002.pdf','ORD-0939','EXP-003','Income','12.01.2025','Correction','—','13.01.2025','6000','PVM2','EUR','661.44 €','—','0%','DEP-03','PROJ-C','Receipt','K. Jonaitis','CC-300','EXP','Overdue'),
('19.01.2025','UAB IT Sprendimai','Advance invoice','Email','993.99 €','04.03.2025','ADV10470003.pdf','—','ADV-004','Expense','18.01.2025','Office supplies','01.01.2025','19.01.2025','5000','PVM1','EUR','821.48 €','172.51 €','21%','DEP-01','—','Advance','R. Petrauskas','CC-100','ADV','Draft'),
('25.01.2025','UAB Prekybos tinklas','Debit note','Upload','1 267.00 €','10.03.2025','REC9470004.pdf','ORD-0937','REC-005','Income','24.01.2025','Travel','—','25.01.2025','6000','PVM2','EUR','1 162.39 €','—','0%','DEP-02','PROJ-A','Standard','J. Pavardenis','CC-200','REC','Pending'),
('31.01.2025','MB Konsultacijos','VAT invoice','Manual','1 539.00 €','15.03.2025','INV10470005.pdf','ORD-0936','INV-006','Expense','30.01.2025','Software','01.01.2025','31.01.2025','5000','PVM1','EUR','1 271.90 €','267.10 €','21%','DEP-03','PROJ-B','Standard','A. Varduonis','CC-300','INV','Paid'),
('06.02.2025','UAB Logistika LT','Credit note','Email','1 813.00 €','21.03.2025','TTP9470006.pdf','ORD-0935','TTP-007','Income','05.02.2025','Development','01.02.2025','06.02.2025','6000','PVM1','EUR','1 498.35 €','314.65 €','21%','DEP-01','PROJ-C','Standard','K. Jonaitis','CC-100','TTP','Overdue'),
('12.02.2025','UAB Finansų grupė','Receipt','Upload','2 086.00 €','27.03.2025','CR9470007.pdf','—','CR-008','Expense','11.02.2025','Advance','—','12.02.2025','5000','PVM2','EUR','1 913.76 €','—','0%','R. Petrauskas','—','Receipt','R. Petrauskas','CC-200','CR','Draft'),
('18.02.2025','UAB Robolabs','Advance invoice','Manual','2 385.00 €','04.04.2025','EXP9470008.pdf','ORD-0933','EXP-009','Income','17.02.2025','Services','01.02.2025','18.02.2025','6000','PVM1','EUR','1 971.07 €','413.93 €','21%','DEP-03','PROJ-A','Advance','J. Pavardenis','CC-300','EXP','Pending'),
('24.02.2025','MB Technologijos','Debit note','Email','2 657.00 €','10.04.2025','ADV10470009.pdf','ORD-0932','ADV-010','Expense','23.02.2025','Consulting','01.02.2025','24.02.2025','5000','PVM1','EUR','2 196.69 €','460.31 €','21%','DEP-01','PROJ-B','Standard','A. Varduonis','CC-100','ADV','Paid'),
('02.03.2025','UAB Sprendimų grupė','VAT invoice','Upload','2 931.00 €','16.04.2025','REC9470010.pdf','ORD-0931','REC-011','Income','01.03.2025','Correction','01.03.2025','02.03.2025','6000','PVM2','EUR','2 689.91 €','—','0%','DEP-02','PROJ-C','Standard','K. Jonaitis','CC-200','REC','Overdue'),
('08.03.2025','UAB IT Sprendimai','Credit note','Manual','3 204.00 €','22.04.2025','INV10470011.pdf','—','INV-012','Expense','07.03.2025','Office supplies','01.03.2025','08.03.2025','5000','PVM1','EUR','2 648.76 €','555.24 €','21%','DEP-03','—','Standard','R. Petrauskas','CC-300','INV','Draft'),
('14.03.2025','UAB Prekybos tinklas','Receipt','Email','3 477.00 €','28.04.2025','TTP9470012.pdf','ORD-0929','TTP-013','Income','13.03.2025','Travel','—','14.03.2025','6000','PVM2','EUR','3 189.91 €','—','0%','DEP-01','PROJ-A','Receipt','J. Pavardenis','CC-100','TTP','Pending'),
('20.03.2025','MB Konsultacijos','Advance invoice','Upload','3 750.00 €','04.05.2025','CR9470013.pdf','ORD-0928','CR-014','Expense','19.03.2025','Software','01.03.2025','20.03.2025','5000','PVM1','EUR','3 099.17 €','650.83 €','21%','DEP-02','PROJ-B','Advance','A. Varduonis','CC-200','CR','Paid'),
('26.03.2025','UAB Logistika LT','Debit note','Manual','4 024.00 €','10.05.2025','EXP9470014.pdf','ORD-0927','EXP-015','Income','25.03.2025','Development','01.03.2025','26.03.2025','6000','PVM1','EUR','3 325.62 €','698.38 €','21%','DEP-03','PROJ-C','Standard','K. Jonaitis','CC-300','EXP','Overdue'),
('01.04.2025','UAB Finansų grupė','VAT invoice','Email','4 297.00 €','16.05.2025','ADV10470015.pdf','—','ADV-016','Expense','31.03.2025','Advance','—','01.04.2025','5000','PVM2','EUR','3 940.37 €','—','0%','DEP-01','—','Standard','R. Petrauskas','CC-100','ADV','Draft'),
('07.04.2025','UAB Robolabs','Credit note','Upload','4 570.00 €','22.05.2025','REC9470016.pdf','ORD-0925','REC-017','Income','06.04.2025','Services','01.04.2025','07.04.2025','6000','PVM1','EUR','3 776.86 €','793.14 €','21%','DEP-02','PROJ-A','Standard','J. Pavardenis','CC-200','REC','Pending'),
('13.04.2025','MB Technologijos','Receipt','Manual','4 844.00 €','28.05.2025','INV10470017.pdf','ORD-0924','INV-018','Expense','12.04.2025','Consulting','01.04.2025','13.04.2025','5000','PVM2','EUR','4 443.12 €','—','0%','DEP-03','PROJ-B','Receipt','A. Varduonis','CC-300','INV','Paid'),
('19.04.2025','UAB Sprendimų grupė','Advance invoice','Email','5 117.00 €','03.06.2025','TTP9470018.pdf','—','TTP-019','Income','18.04.2025','Correction','01.04.2025','19.04.2025','6000','PVM1','EUR','4 229.75 €','887.25 €','21%','DEP-01','PROJ-C','Advance','K. Jonaitis','CC-100','TTP','Overdue'),
('25.04.2025','UAB IT Sprendimai','Debit note','Upload','5 390.00 €','09.06.2025','CR9470019.pdf','ORD-0922','CR-020','Expense','24.04.2025','Office supplies','01.04.2025','25.04.2025','5000','PVM1','EUR','4 454.55 €','935.45 €','21%','DEP-02','—','Standard','R. Petrauskas','CC-200','CR','Draft'),
('01.05.2025','UAB Prekybos tinklas','VAT invoice','Manual','5 664.00 €','15.06.2025','EXP9470020.pdf','ORD-0921','EXP-021','Income','30.04.2025','Travel','—','01.05.2025','6000','PVM2','EUR','5 195.41 €','—','0%','DEP-03','PROJ-A','Standard','J. Pavardenis','CC-300','EXP','Pending'),
('07.05.2025','MB Konsultacijos','Credit note','Email','5 937.00 €','21.06.2025','ADV10470021.pdf','ORD-0920','ADV-022','Expense','06.05.2025','Software','01.05.2025','07.05.2025','5000','PVM1','EUR','4 907.44 €','1 029.56 €','21%','DEP-01','PROJ-B','Standard','A. Varduonis','CC-100','ADV','Paid'),
('13.05.2025','UAB Logistika LT','Receipt','Upload','6 210.00 €','27.06.2025','REC9470022.pdf','ORD-0919','REC-023','Income','12.05.2025','Development','01.05.2025','13.05.2025','6000','PVM2','EUR','5 697.25 €','—','0%','DEP-02','PROJ-C','Receipt','K. Jonaitis','CC-200','REC','Overdue'),
('19.05.2025','UAB Finansų grupė','Advance invoice','Manual','6 484.00 €','02.07.2025','INV10470023.pdf','—','INV-024','Expense','18.05.2025','Advance','—','19.05.2025','5000','PVM1','EUR','5 358.68 €','1 125.32 €','21%','DEP-03','—','Advance','R. Petrauskas','CC-300','INV','Draft'),
('25.05.2025','UAB Robolabs','Debit note','Email','6 757.00 €','08.07.2025','TTP9470024.pdf','ORD-0917','TTP-025','Income','24.05.2025','Services','01.05.2025','25.05.2025','6000','PVM1','EUR','5 584.30 €','1 172.70 €','21%','DEP-01','PROJ-A','Standard','J. Pavardenis','CC-100','TTP','Pending'),
('31.05.2025','MB Technologijos','VAT invoice','Upload','7 030.00 €','14.07.2025','CR9470025.pdf','ORD-0916','CR-026','Expense','30.05.2025','Consulting','01.05.2025','31.05.2025','5000','PVM2','EUR','6 449.54 €','—','0%','DEP-02','PROJ-B','Standard','A. Varduonis','CC-200','CR','Paid'),
('06.06.2025','UAB Sprendimų grupė','Credit note','Manual','7 303.00 €','20.07.2025','EXP9470026.pdf','ORD-0915','EXP-027','Income','05.06.2025','Correction','01.06.2025','06.06.2025','6000','PVM1','EUR','6 035.54 €','1 267.46 €','21%','DEP-03','PROJ-C','Standard','K. Jonaitis','CC-300','EXP','Overdue'),
('12.06.2025','UAB IT Sprendimai','Receipt','Email','7 577.00 €','26.07.2025','ADV10470027.pdf','—','ADV-028','Expense','11.06.2025','Office supplies','—','12.06.2025','5000','PVM2','EUR','6 952.29 €','—','0%','DEP-01','—','Receipt','R. Petrauskas','CC-100','ADV','Draft'),
('18.06.2025','UAB Prekybos tinklas','Advance invoice','Upload','7 850.00 €','01.08.2025','REC9470028.pdf','ORD-0913','REC-029','Income','17.06.2025','Travel','01.06.2025','18.06.2025','6000','PVM1','EUR','6 487.60 €','1 362.40 €','21%','DEP-02','PROJ-A','Advance','J. Pavardenis','CC-200','REC','Pending'),
('24.06.2025','MB Konsultacijos','Debit note','Manual','8 123.00 €','07.08.2025','INV10470029.pdf','ORD-0912','INV-030','Expense','23.06.2025','Software','01.06.2025','24.06.2025','5000','PVM1','EUR','6 713.22 €','1 409.78 €','21%','DEP-03','PROJ-B','Standard','A. Varduonis','CC-300','INV','Paid');
