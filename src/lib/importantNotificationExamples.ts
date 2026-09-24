import { SAMPLE_NOTIFICATIONS, type NotificationRow, type RelatedObject } from './notifications';

export function linkImportantNotificationExamples(companyId: string, email: string, objects: RelatedObject[]): void {
  const key = 'finansu-harmonija:v7:notifications';
  const prefix = `demo-important:${companyId}:${email.trim().toLowerCase()}:`;
  let rows: NotificationRow[];
  try { rows = JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return; }
  if (!Array.isArray(rows)) return;
  let changed = false;
  const next = rows.map(row => {
    if (!row.id.startsWith(prefix) || row.relatedObject) return row;
    if (row.type === 'Reports' || row.type === 'Integrations') return row;
    const type = row.type === 'Bank' ? 'Bank operation' : row.type === 'Reconciliation' ? 'Reconciliation' : row.type === 'Invoices' ? 'Invoice' : 'Document';
    const object = objects.find(candidate => candidate.organizationId === companyId && candidate.type === type)
      ?? (type === 'Document' ? objects.find(candidate => candidate.organizationId === companyId && candidate.type === 'Invoice') : undefined);
    if (!object) return row;
    changed = true;
    return { ...row, relatedObject: { ...object }, message: `${row.message} Test record: ${object.label}.` };
  });
  if (!changed) return;
  localStorage.setItem(key, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('finansu-harmonija:persistent-state-changed', { detail: { storageKey: key } }));
}

/** Local demo alerts only; never changes real bank, document or reconciliation records. */
export function ensureImportantNotificationExamples(company: { id: string; name: string }, email: string): void {
  const key = 'finansu-harmonija:v7:notifications';
  const identity = `${company.id}:${email.trim().toLowerCase()}`;
  const marker = `finansu-harmonija:v17:process-error-examples-v2:${identity}`;
  if (localStorage.getItem(marker)) return;
  const stored = localStorage.getItem(key);
  let rows: NotificationRow[];
  try { rows = stored === null ? [...SAMPLE_NOTIFICATIONS] : JSON.parse(stored); } catch { return; }
  if (!Array.isArray(rows)) return;
  const examples = [
    ['Critical', 'Bank', 'Bank synchronization failed', 'Demo process error: bank authentication failed. Reconnect the bank integration.'],
    ['Warning', 'Reconciliation', 'Reconciliation confirmations were not sent', 'Demo process exception: recipient addresses are invalid. Correct them and retry sending.'],
    ['Critical', 'Integrations', 'ERP export failed for 3 invoices', 'Demo process error: the ERP connection is unavailable. Review the export result and retry.'],
    ['Warning', 'OCR', 'OCR failed for 2 documents', 'Demo process exception: document recognition failed. Review the affected documents.'],
    ['Critical', 'Reports', 'PVM declaration rejected by VMI', 'Demo process error: declaration validation failed. Review the rejection details.'],
    ['Warning', 'Bank', 'Payment file rejected by bank', 'Demo process exception: the payment file contains invalid account details. Correct and resubmit it.'],
  ] as const;
  const now = Date.now();
  examples.forEach(([severity, type, name, message], index) => {
    const id = `demo-important:${identity}:${index}`;
    const existingIndex = rows.findIndex(row => row.id === id);
    const existing = existingIndex >= 0 ? rows[existingIndex] : undefined;
    const record: NotificationRow = { ...existing, id, severity, type, name: `Demo: ${name}`, message, origin: 'system', status: existing?.status ?? 'Active',
      eventKind: severity === 'Critical' ? 'process-error' : 'process-exception', outcome: 'failure',
      relatedObject: existing?.type === type && type !== 'Reports' && type !== 'Integrations' ? existing?.relatedObject : undefined,
      requiresAction: true, organizationId: company.id, organizationName: company.name,
      recipientEmails: [email.trim().toLowerCase()], createdAt: existing?.createdAt ?? new Date(now - index * 60000).toISOString() };
    if (existingIndex >= 0) rows[existingIndex] = record;
    else rows.push(record);
  });
  localStorage.setItem(key, JSON.stringify(rows));
  localStorage.setItem(marker, '1');
  window.dispatchEvent(new CustomEvent('finansu-harmonija:persistent-state-changed', { detail: { storageKey: key } }));
}
