export type OrganizationEmailTemplate = {
  id: string;
  name: string;
  language: string;
  subject: string;
  body: string;
  active: boolean;
};

export type OrganizationEmailPartyDetails = {
  name: string;
  companyCode?: string;
  vatCode?: string;
  address?: string;
  email?: string;
  phone?: string;
};

export type OrganizationEmailHistoryEntry = {
  id: string;
  organizationId?: string;
  sentAt: string;
  sender: string;
  senderEmail?: string;
  senderDetails?: OrganizationEmailPartyDetails;
  recipient: string;
  recipientEmail: string;
  recipientDetails?: OrganizationEmailPartyDetails;
  templateName: string;
  language: string;
  subject: string;
  body: string;
  reconciliationDate: string;
  debtBalance: string;
  portalUrl: string;
  documentReference: string;
  responseReceivedAt?: string;
  responseDecision?: 'matches' | 'differs';
  resendOfId?: string;
};

export type OrganizationEmailTemplateData = {
  sender: string;
  recipient: string;
  reconciliationDate: string;
  debtBalance: string;
  portalUrl: string;
  documentReference: string;
};

const TEMPLATE_KEY = 'finansu-harmonija:v12:organization-email-templates';
const HISTORY_KEY = 'finansu-harmonija:v12:organization-email-history';
const PORTAL_PREVIEW_KEY = 'finansu-harmonija:v12:debt-reconciliation-previews';

const DEFAULT_TEMPLATES: OrganizationEmailTemplate[] = [
  {
    id: 'debt-reconciliation-lt',
    name: 'Skolų suderinimas',
    language: 'LT',
    active: true,
    subject: 'Skolų suderinimas – {{sender}}',
    body: 'Sveiki, {{recipient}},\n\n{{sender}} prašo suderinti {{reconciliationDate}} dienos skolos likutį: {{debtBalance}}.\n\nDokumentą galite peržiūrėti ir patikslinti čia:\n{{portalUrl}}\n\nDokumento numeris: {{documentReference}}\n\nPagarbiai\n{{sender}}',
  },
  {
    id: 'debt-reconciliation-en',
    name: 'Debt reconciliation',
    language: 'EN',
    active: true,
    subject: 'Debt reconciliation – {{sender}}',
    body: 'Hello {{recipient}},\n\n{{sender}} asks you to reconcile the outstanding balance of {{debtBalance}} as of {{reconciliationDate}}.\n\nOpen the reconciliation document to review or update it:\n{{portalUrl}}\n\nDocument reference: {{documentReference}}\n\nKind regards\n{{sender}}',
  },
];

function readArray<T>(key: string): T[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return Array.isArray(parsed) ? parsed as T[] : null;
  } catch {
    return null;
  }
}

export function loadOrganizationEmailTemplates() {
  return readArray<OrganizationEmailTemplate>(TEMPLATE_KEY) ?? DEFAULT_TEMPLATES.map((template) => ({ ...template }));
}

export function saveOrganizationEmailTemplates(templates: OrganizationEmailTemplate[]) {
  window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  window.dispatchEvent(new CustomEvent('organization-email-settings-updated'));
}

export function loadOrganizationEmailHistory() {
  return readArray<OrganizationEmailHistoryEntry>(HISTORY_KEY) ?? [];
}

export function loadOrganizationEmailHistoryForOrganization(
  organizationId: string,
  organizationName: string,
) {
  const normalizedName = organizationName.trim().toLocaleLowerCase();
  return loadOrganizationEmailHistory().filter((entry) =>
    entry.organizationId
      ? entry.organizationId === organizationId
      : Boolean(normalizedName) &&
        entry.sender.trim().toLocaleLowerCase() === normalizedName,
  );
}

export function appendOrganizationEmailHistory(entry: OrganizationEmailHistoryEntry) {
  const history = [entry, ...loadOrganizationEmailHistory()];
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  window.dispatchEvent(new CustomEvent('organization-email-history-updated'));
}

export function saveDebtReconciliationPortalPreview(entry: OrganizationEmailHistoryEntry) {
  const previews = readArray<OrganizationEmailHistoryEntry>(PORTAL_PREVIEW_KEY) ?? [];
  const next = [entry, ...previews.filter((item) => item.portalUrl !== entry.portalUrl)];
  window.localStorage.setItem(PORTAL_PREVIEW_KEY, JSON.stringify(next));
}

export function loadDebtReconciliationPortalPreview(path: string) {
  const previews = readArray<OrganizationEmailHistoryEntry>(PORTAL_PREVIEW_KEY) ?? [];
  return previews.find((item) => {
    try {
      return new URL(item.portalUrl).pathname === path;
    } catch {
      return false;
    }
  });
}

export function markOrganizationEmailResponseReceived(
  entryId: string,
  responseReceivedAt: string,
  responseDecision?: 'matches' | 'differs',
) {
  const history = loadOrganizationEmailHistory().map((entry) =>
    entry.id === entryId ? { ...entry, responseReceivedAt, responseDecision } : entry,
  );
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  window.dispatchEvent(new CustomEvent('organization-email-history-updated'));
}

export function renderOrganizationEmailTemplate(
  value: string,
  data: OrganizationEmailTemplateData,
) {
  return Object.entries(data).reduce(
    (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement || '—'),
    value,
  );
}

export function createDebtReconciliationPortalUrl(documentReference: string) {
  const safeReference = documentReference.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || crypto.randomUUID();
  return `${window.location.origin}/debt-reconciliation/${safeReference}-${crypto.randomUUID().slice(0, 8)}`;
}
