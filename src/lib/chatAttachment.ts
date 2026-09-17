import { supabase, type Company } from './supabase';
import { parseSession, canEditMenu } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';
import { canAccessAssignedOrganization } from './linkedSettingsData';
import type { InvoiceChatContext, InvoiceChatMessage } from '../components/invoices/invoiceChat';

export function validateChatAttachment(file: File) {
  if (!/\.(pdf|jpe?g|png|tiff?)$/i.test(file.name)) throw new Error('Supported: PDF, JPG, PNG, TIF.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Maximum file size: 50 MB.');
  if (!file.size) throw new Error('The selected file is empty.');
}

export async function registerChatAttachment(context: InvoiceChatContext, file: File, id: string): Promise<NonNullable<InvoiceChatMessage['attachments']>[number]> {
  validateChatAttachment(file);
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  if (!session || !canEditMenu(session, 'messages') || (!session.access.companies.edit && !session.roleNames.includes('External demo user'))) throw new Error('You do not have permission to upload documents.');
  const { data } = await supabase.from('companies').select('*');
  const matches = ((data ?? []) as unknown as Company[]).filter(company => context.organizationId ? company.id === context.organizationId : company.name === context.companyName);
  const company = matches.length === 1 ? matches[0] : undefined;
  if (!company || !canAccessAssignedOrganization(company, session)) throw new Error('An accessible organization is required.');
  const path = `chats/${company.id}/${id}-${file.name}`;
  const { error } = await supabase.storage.from('documents').upload(path, file);
  if (error) throw new Error(error.message);
  const url = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;
  const now = new Date();
  const date = now.toLocaleDateString('lt-LT');
  const { error: recordError } = await supabase.from('documents').upsert({
    id, company_id: company.id, receive_date: date, created_at: now.toISOString(), created_by: session.fullName,
    file_case: file.name, image_url: url, source: 'Chat upload', status: 'Submitted', document_type: 'OCR intake',
    client_counterparty: '', number: id, total_amount: '0.00', currency: 'EUR', document_date: date,
    document_purpose: 'Submitted for OCR processing', operation_date: date, due_end_date: '', order_no: '', type: 'Expense',
    invoice_contract_date: '', expense_account: '', vat_classifier: '', amount_without_vat: '0.00', vat: '0.00', vat_percent: '0%',
    department_code: '', object_project: '', valid_form: 'OCR queue', accountable_responsible: '', cost_center: '', series: 'OCR',
    chat_storage_key: context.storageKey, ocr_input_priority: 'user-confirmed',
  }, { onConflict: 'id' });
  if (recordError) throw new Error(recordError.message);
  return { documentId: id, name: file.name, size: file.size, url };
}
