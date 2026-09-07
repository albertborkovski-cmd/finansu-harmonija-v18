import type { DbDocument } from './supabase';

export type UploadedStatus =
  | 'Processing'
  | 'Processed'
  | 'Organization not identified'
  | 'Rejected'
  | 'Exception'
  | 'Duplicate'
  | 'Not document';

export type UploadedDocumentsGroup =
  | 'All'
  | 'Processing'
  | 'Needs attention'
  | 'Processed';

const UNASSIGNED_TEST_DOCUMENT_ID = 'uploaded-document-unassigned-test';
const DUPLICATE_TEST_DOCUMENT_ID = 'uploaded-document-duplicate-test';

const UNASSIGNED_TEST_DOCUMENT: DbDocument = {
  id: UNASSIGNED_TEST_DOCUMENT_ID,
  receive_date: '28.08.2026',
  client_counterparty: 'Organization pending identification',
  document_type: 'VAT invoice',
  source: 'Email',
  total_amount: '0.00 €',
  due_end_date: '',
  file_case: 'UNASSIGNED-TEST-001.pdf',
  order_no: '',
  number: 'UNASSIGNED-TEST-001',
  type: 'Expense',
  document_date: '28.08.2026',
  document_purpose: 'Organization assignment test',
  invoice_contract_date: '',
  operation_date: '28.08.2026',
  expense_account: '',
  vat_classifier: '',
  currency: 'EUR',
  amount_without_vat: '0.00 €',
  vat: '0.00 €',
  vat_percent: '0%',
  department_code: '',
  object_project: '',
  valid_form: 'Organization identification required',
  accountable_responsible: '',
  cost_center: '',
  series: '',
  status: 'Processing',
  created_at: '2026-08-28T09:00:00.000Z',
  created_by: 'sender@example.com',
  image_url: null,
};

export function uploadedDocumentTimestamp(document: DbDocument) {
  const created = Date.parse(document.created_at || '');
  if (Number.isFinite(created)) return created;
  const parts = (document.receive_date || '').match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/,
  );
  return parts
    ? new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])).getTime()
    : 0;
}

export function uploadedStatus(document: DbDocument): UploadedStatus {
  const raw = (document.status || '').trim().toLowerCase();
  if (raw === 'rejected') return 'Rejected';
  if (raw === 'exception' || raw === 'exceptional') return 'Exception';
  if (raw.includes('duplicate') || raw.includes('dublicate')) return 'Duplicate';
  if (raw === 'not document' || raw === 'not documented') return 'Not document';
  if (!document.company_id) return 'Organization not identified';
  if (
    raw === 'overdue' ||
    raw === 'needs info' ||
    raw === 'provide additional' ||
    raw === 'provide additional data'
  ) {
    return 'Exception';
  }
  if (
    ['paid', 'accepted', 'processed', 'completed', 'transferred', 'approved'].includes(
      raw,
    )
  ) {
    return 'Processed';
  }
  return 'Processing';
}

export function uploadedStatusGroup(
  status: UploadedStatus,
): UploadedDocumentsGroup {
  if (status === 'Processing') return 'Processing';
  if (status === 'Processed') return 'Processed';
  return 'Needs attention';
}

export function isUploadedDocumentUnresolved(status: UploadedStatus) {
  return status === 'Processing' || uploadedStatusGroup(status) === 'Needs attention';
}

export function matchesUploadedDateFilter(
  document: DbDocument,
  dateFilter: string,
  now = Date.now(),
) {
  const status = uploadedStatus(document);
  if (isUploadedDocumentUnresolved(status) || dateFilter === 'all') return true;
  const days = Number(dateFilter || 30);
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return uploadedDocumentTimestamp(document) >= cutoff;
}

export function prepareUploadedDocuments(sourceDocuments: DbDocument[]) {
  let documents = [...sourceDocuments];
  const generated: DbDocument[] = [];

  if (
    !documents.some((document) => !document.company_id) &&
    !documents.some((document) => document.id === UNASSIGNED_TEST_DOCUMENT_ID)
  ) {
    generated.push(UNASSIGNED_TEST_DOCUMENT);
    documents = [UNASSIGNED_TEST_DOCUMENT, ...documents];
  }

  if (!documents.some((document) => document.id === DUPLICATE_TEST_DOCUMENT_ID)) {
    const duplicateSource = documents.find(
      (document) =>
        document.id !== UNASSIGNED_TEST_DOCUMENT_ID &&
        document.id !== DUPLICATE_TEST_DOCUMENT_ID &&
        !document.status?.toLowerCase().includes('duplicate') &&
        Boolean(document.company_id),
    );
    if (duplicateSource) {
      const duplicateDocument: DbDocument = {
        ...duplicateSource,
        id: DUPLICATE_TEST_DOCUMENT_ID,
        status: 'Duplicate',
        created_at: '2026-08-28T10:00:00.000Z',
        created_by: 'duplicate-detection@meso.lt',
        valid_form: 'A matching original document was detected.',
      };
      generated.push(duplicateDocument);
      documents = [duplicateDocument, ...documents];
    }
  }

  return { documents, generated };
}
