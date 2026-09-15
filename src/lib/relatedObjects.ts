import { canViewMenu, type AppSession } from './accessControl';
import { canAccessAssignedOrganization, type LinkedOrganization } from './linkedSettingsData';
import { supabase, type DbDocument } from './supabase';
import type { RelatedObject } from './notifications';
import { DEBT_ROWS, seedClients, type ClientRow } from './companyRelatedObjectData';
import { parseReconciliationState } from './reconciliation';
import { createReconciliationExamples } from './reconciliationExamples';
import { invoiceChatPersistenceKey, loadChatConversations, type InvoiceChatContext } from '../components/invoices/invoiceChat';

type ObjectOrganization = LinkedOrganization & { assigned_accountant?: string };
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

function canAccess(organization: ObjectOrganization, session: AppSession) {
  return Boolean(organization.id && session.access.companies.view
    && canAccessAssignedOrganization(organization, session));
}

function readArray(key: string): unknown[] | undefined {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    const rows: unknown = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

function clientRows(organization: ObjectOrganization): ClientRow[] {
  const stored = readArray(`finansu-harmonija:v12:company-clients:${organization.id}`);
  // The same fallback is used by the original Clients module. Reading the
  // selector must not persist seeds or overwrite an explicitly empty list.
  return (stored ?? seedClients(organization)).filter((row): row is ClientRow => Boolean(
    row && typeof row === 'object' && text((row as ClientRow).id)
      && (text((row as ClientRow).name) || text((row as ClientRow).companyCode)),
  ));
}

/** Same participant visibility as Chats, additionally scoped to this organization. */
export function loadRelatedObjectChats(
  organization: ObjectOrganization,
  session: AppSession,
  documents: readonly DbDocument[],
): InvoiceChatContext[] {
  if (!canAccess(organization, session) || !canViewMenu(session, 'messages')) return [];
  const discovered: InvoiceChatContext[] = documents.filter(document => document.company_id === organization.id).map(document => {
    const subject = text(document.number) || text(document.file_case) || text(document.document_type) || 'Document';
    return {
      storageKey: `${organization.name}:${subject}`,
      organizationId: organization.id,
      title: `${organization.name} / ${subject}`,
      companyName: organization.name,
      subject,
      sourceType: 'Document' as const,
    };
  });
  const currentEmail = session.email.trim().toLowerCase();
  const seen = new Set<string>();
  return [...loadChatConversations(), ...discovered].filter(context => {
    if (!context || !text(context.storageKey) || context.storageKey === '__general__') return false;
    if (seen.has(context.storageKey)) return false;
    seen.add(context.storageKey);
    // A recorded ID always wins; a matching company name cannot override it.
    if (context.organizationId ? context.organizationId !== organization.id
      : (text(context.companyName) || text(context.title).split('/')[0].trim()) !== organization.name.trim()) return false;
    if (context.createdByEmail) return [context.createdByEmail, context.recipientEmail]
      .some(email => text(email).toLowerCase() === currentEmail);
    return (readArray(invoiceChatPersistenceKey(context.storageKey)) ?? []).length > 0;
  }).map(context => ({ ...context, organizationId: organization.id }));
}

/**
 * Read the original modules' current records, never a second task-only dataset.
 * Reconciliation/Debt currently use the same explicit demo data as those modules.
 * Non-document IDs are namespaced; recordId retains each module's native ID.
 */
export async function loadRelatedObjects(
  organization: ObjectOrganization,
  session: AppSession,
): Promise<RelatedObject[]> {
  if (!canAccess(organization, session)) return [];
  const { data, error } = await supabase.from('documents').select('*').eq('company_id', organization.id);
  if (error) throw new Error('Unable to load related objects.');
  if (!canAccess(organization, session)) return [];
  const documents = ((data ?? []) as unknown as DbDocument[])
    .filter(document => document && document.company_id === organization.id && text(document.id));
  const objects: RelatedObject[] = documents.map(document => ({
    id: document.id,
    organizationId: organization.id,
    type: /invoice/i.test(document.document_type) ? 'Invoice' : 'Document',
    label: text(document.file_case) || text(document.number) || document.id,
  }));
  const add = (type: RelatedObject['type'], prefix: string, recordId: string, label: string) => {
    objects.push({ id: `${prefix}:${recordId}`, recordId, organizationId: organization.id, type, label });
  };

  // Company Bank currently displays a bank row for every company document.
  for (const document of documents) {
    const reference = text(document.order_no) || text(document.number) || text(document.file_case) || document.id;
    add('Bank operation', 'bank', document.id, [reference, text(document.client_counterparty)].filter(Boolean).join(' · '));
  }

  const reconciliationRaw = window.localStorage.getItem(`finansu-harmonija:v15:reconciliation-examples-v2:${organization.id}`);
  try {
    const reconciliation = reconciliationRaw === null
      ? createReconciliationExamples(organization.id)
      : parseReconciliationState(reconciliationRaw, organization.id);
    for (const item of reconciliation.items) {
      if (item.organizationId === organization.id) add('Reconciliation', 'reconciliation', item.id, `${item.documentNumber} · ${item.counterpartyName}`);
    }
    const itemNames = new Map(reconciliation.items.map(item => [item.id, item.documentNumber]));
    for (const batch of reconciliation.batches) {
      const names = [...new Set(batch.allocations.flatMap(allocation => [itemNames.get(allocation.fundingId), itemNames.get(allocation.invoiceId)]).filter(Boolean))];
      add('Reconciliation', 'reconciliation-batch', batch.id, `${names.join(' + ') || batch.id} · ${batch.at.slice(0, 10)}`);
    }
  } catch {
    // Corrupt or differently scoped saved data is unavailable, not replaced by
    // fresh examples and not written back by this read-only selector.
  }
  for (const debt of DEBT_ROWS) {
    add('Debt', 'debt', debt.id, `${debt.documentReference} · ${debt.counterpartyName} · ${debt.outstandingAmount} ${debt.currency}`);
  }
  for (const client of clientRows(organization)) {
    add('Counterparty', 'counterparty', client.id, [text(client.name), text(client.companyCode)].filter(Boolean).join(' · '));
  }
  for (const chat of loadRelatedObjectChats(organization, session, documents)) {
    add('Chat', 'chat', chat.storageKey, text(chat.subject) || text(chat.title) || chat.storageKey);
  }
  if (!canAccess(organization, session)) return [];
  // Retain first native identity if malformed/legacy storage contains duplicates.
  const unique = objects.filter((object, index, all) => all.findIndex(candidate => candidate.id === object.id) === index);
  const labels = new Map<string, number>();
  for (const object of unique) {
    const key = `${object.type}:${object.label}`;
    labels.set(key, (labels.get(key) ?? 0) + 1);
  }
  return unique.map(object => (labels.get(`${object.type}:${object.label}`) ?? 0) > 1
    ? { ...object, label: `${object.label} · ${object.recordId ?? object.id}` } : object);
}

/** Recheck membership, current existence and canonical IDs just before opening. */
export async function resolveRelatedObject(
  related: RelatedObject,
  organization: ObjectOrganization,
  session: AppSession,
): Promise<RelatedObject | undefined> {
  if (!related || related.organizationId !== organization.id || !canAccess(organization, session)) return undefined;
  const current = (await loadRelatedObjects(organization, session)).find(object => object.id === related.id && object.type === related.type);
  if (!current || (related.recordId !== undefined && related.recordId !== (current.recordId ?? current.id))) return undefined;
  return current;
}
