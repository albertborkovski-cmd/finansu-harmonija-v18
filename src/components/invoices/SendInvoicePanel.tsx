import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Send, X } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import {
  appendOrganizationEmailHistory,
  createDebtReconciliationPortalUrl,
  loadOrganizationEmailTemplates,
  renderOrganizationEmailTemplate,
  saveDebtReconciliationPortalPreview,
  type OrganizationEmailPartyDetails,
} from '../../lib/organizationEmail';

interface InvoiceRow {
  id: string;
  number: string;
  buyer: string;
  totalAmount: number;
  currency: string;
}

interface SendInvoicePanelProps {
  invoice: InvoiceRow;
  organizationId?: string;
  senderName?: string;
  senderEmail?: string;
  senderDetails?: OrganizationEmailPartyDetails;
  recipientName?: string;
  recipientEmail?: string;
  recipientDetails?: OrganizationEmailPartyDetails;
  reconciliationDate?: string;
  onClose: () => void;
}

export default function SendInvoicePanel({
  invoice,
  organizationId,
  senderName = 'Organization',
  senderEmail = '',
  senderDetails,
  recipientName,
  recipientEmail = '',
  recipientDetails,
  reconciliationDate = new Date().toISOString().slice(0, 10),
  onClose,
}: SendInvoicePanelProps) {
  const templates = useMemo(() => loadOrganizationEmailTemplates().filter((template) => template.active), []);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? '');
  const [email, setEmail] = useState(recipientEmail);
  const [portalUrl] = useState(() => createDebtReconciliationPortalUrl(invoice.number || invoice.id));
  const [previewCreatedAt] = useState(() => new Date().toISOString());
  const recipient = recipientName || invoice.buyer || 'Counterparty';
  const debtBalance = `${invoice.totalAmount.toFixed(2)} ${invoice.currency}`;
  const templateData = { sender: senderName, recipient, reconciliationDate, debtBalance, portalUrl, documentReference: invoice.number };
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const [subject, setSubject] = useState(() => selectedTemplate ? renderOrganizationEmailTemplate(selectedTemplate.subject, templateData) : '');
  const [message, setMessage] = useState(() => selectedTemplate ? renderOrganizationEmailTemplate(selectedTemplate.body, templateData) : '');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    saveDebtReconciliationPortalPreview({
      id: `preview-${invoice.id}`,
      organizationId,
      sentAt: previewCreatedAt,
      sender: senderName,
      senderEmail,
      senderDetails,
      recipient,
      recipientEmail: email.trim(),
      recipientDetails: recipientDetails ? { ...recipientDetails, email: email.trim() || recipientDetails.email } : undefined,
      templateName: selectedTemplate?.name ?? '—',
      language: selectedTemplate?.language ?? '—',
      subject: subject.trim(),
      body: message.trim(),
      reconciliationDate,
      debtBalance,
      portalUrl,
      documentReference: invoice.number,
    });
  }, [debtBalance, email, invoice.id, invoice.number, message, organizationId, portalUrl, previewCreatedAt, recipient, recipientDetails, reconciliationDate, selectedTemplate?.language, selectedTemplate?.name, senderDetails, senderEmail, senderName, subject]);

  const selectTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplateId(template.id);
    setSubject(renderOrganizationEmailTemplate(template.subject, templateData));
    setMessage(renderOrganizationEmailTemplate(template.body, templateData));
  };

  const send = () => {
    if (!email.trim() || !subject.trim() || !message.trim() || !selectedTemplate) return;
    appendOrganizationEmailHistory({
      id: crypto.randomUUID(), organizationId, sentAt: new Date().toISOString(), sender: senderName, senderEmail, senderDetails,
      recipient, recipientEmail: email.trim(), recipientDetails: recipientDetails ? { ...recipientDetails, email: email.trim() || recipientDetails.email } : undefined, templateName: selectedTemplate.name,
      language: selectedTemplate.language, subject: subject.trim(), body: message.trim(),
      reconciliationDate, debtBalance, portalUrl, documentReference: invoice.number,
    });
    setSent(true);
  };

  return (
    <div className="absolute inset-0 z-[80] flex justify-end bg-transparent">
      <aside className="flex h-full w-full max-w-[620px] flex-col border-l border-[#E5EDF9] bg-white shadow-[-8px_0_24px_rgba(16,35,58,0.10)]">
        <header className="flex min-h-[72px] flex-shrink-0 items-center justify-between border-b border-[#E5EDF9] px-6 py-3">
          <div><h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Send to counterparty</h2><p className="font-montserrat text-[12px] font-medium text-[#7288A3]">Review and edit the message before sending.</p></div>
          <button type="button" aria-label="Close send panel" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#10233A]"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {sent ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8FAF5] text-[#0A9F79]"><Check size={24} /></span>
              <div><h3 className="font-montserrat text-[18px] font-semibold text-[#10233A]">Message sent</h3><p className="mt-1 font-montserrat text-[12px] font-medium text-[#7288A3]">The message was added to Organization email history.</p></div>
              <button type="button" onClick={onClose} className="h-9 rounded-md bg-[#007EA7] px-5 font-montserrat text-[13px] font-semibold text-white hover:bg-[#006A8E]">Close</button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#D3E1EC] bg-[#F8FDFF] p-4"><Summary label="Sender organization" value={senderName} /><Summary label="Recipient counterparty" value={recipient} /><Summary label="Reconciliation date" value={reconciliationDate} /><Summary label="Debt balance" value={debtBalance} /></div>
              <Field label="Template"><SearchableSelect ariaLabel="Template" value={selectedTemplateId} onChange={selectTemplate} placeholder="No active templates" options={templates.map((template) => ({ value: template.id, label: `${template.name} · ${template.language}` }))} className="h-9 rounded-md border border-[#D3E1EC] bg-white px-3 pr-9 font-montserrat text-[12px] font-medium text-[#10233A]" /></Field>
              <Field label="Recipient email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter counterparty email" className="h-9 w-full rounded-md border border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]" /></Field>
              <Field label="Subject"><input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-9 w-full rounded-md border border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" /></Field>
              <Field label="Message"><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={12} className="w-full resize-y rounded-md border border-[#D3E1EC] px-3 py-2 font-montserrat text-[12px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]" /></Field>
              <Field label="Reconciliation portal"><a href={portalUrl} target="_blank" rel="noreferrer" className="block break-all rounded-md bg-[#F8FDFF] px-3 py-2 font-montserrat text-[12px] font-medium text-[#007EA7] underline">{portalUrl}</a></Field>
            </div>
          )}
        </div>
        {!sent && <footer className="flex flex-shrink-0 justify-end gap-3 border-t border-[#E5EDF9] px-6 py-4"><button type="button" onClick={onClose} className="h-9 rounded-md border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[13px] font-semibold text-[#7288A3] hover:border-[#A1B6C6]">Cancel</button><button data-system-action="true" type="button" disabled={!email.trim() || !subject.trim() || !message.trim() || !selectedTemplate} onClick={send} className="flex h-9 items-center gap-2 rounded-md bg-[#007EA7] px-4 font-montserrat text-[13px] font-semibold text-white hover:bg-[#006A8E] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]"><Send size={14} />Send message</button></footer>}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="font-montserrat text-[12px] font-medium text-[#7288A3]">{label}</span>{children}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="font-montserrat text-[11px] font-medium text-[#7288A3]">{label}</p><p className="mt-1 truncate font-montserrat text-[13px] font-semibold text-[#10233A]" title={value}>{value || '—'}</p></div>;
}
