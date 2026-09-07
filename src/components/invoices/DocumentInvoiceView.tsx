import type { Company } from '../../lib/supabase';
import type { Document as DocumentRecord, DocumentLineItem } from '../Documents';
import {
  CreatedInvoiceView,
  type InvoicePreviewPartyDetails,
  type InvoicePreviewServiceLine,
} from './CreateInvoicePanel';
import type { InvoiceChatContext } from './invoiceChat';

type Props = {
  doc: DocumentRecord;
  companyName: string;
  company?: Company;
  onBack: () => void;
  onStartChat?: (context: InvoiceChatContext) => void;
};

function amount(value: string) {
  return Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function cleanPercent(value: string) {
  return String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.') || '0';
}

function lineToService(line: DocumentLineItem): InvoicePreviewServiceLine {
  return {
    id: line.id,
    name: line.product || line.productGroup || '',
    description: line.product || '',
    quantity: line.qty || '1',
    price: String(amount(line.price || line.subtotal)),
    vatRate: cleanPercent(line.vatPct),
  };
}

function companyParty(company?: Company): InvoicePreviewPartyDetails {
  return {
    title: company?.name ?? '',
    country: company?.tax_country ?? company?.country ?? '',
    city: '',
    address: company?.address ?? '',
    postalCode: '',
    code: company?.company_code ?? '',
    vatCode: company?.vat_code ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
    countryOfSale: company?.tax_country ?? company?.country ?? '',
  };
}

function counterparty(title: string, vatCode = ''): InvoicePreviewPartyDetails {
  return {
    title,
    country: '',
    city: '',
    address: '',
    postalCode: '',
    code: '',
    vatCode,
    phone: '',
    email: '',
    countryOfSale: '',
  };
}

export default function DocumentInvoiceView({ doc, companyName, company, onBack, onStartChat }: Props) {
  const purchase = /purchase|expense|pirk/i.test(`${doc.type} ${doc.documentType}`);
  const currentCompany = companyParty(company);
  if (!currentCompany.title) currentCompany.title = companyName;

  const otherParty = counterparty(doc.clientCounterparty || doc.source, doc.vatClassifier);
  const buyer = purchase ? currentCompany : otherParty;
  const seller = purchase ? otherParty : currentCompany;
  const sourceLines = doc.summaryLineItems.length
    ? doc.summaryLineItems
    : doc.lineItems.length
      ? doc.lineItems
      : [];
  const services = sourceLines.length
    ? sourceLines.map(lineToService)
    : [{
        id: `${doc.id}-line`,
        name: doc.documentPurpose || doc.documentType,
        description: '',
        quantity: '1',
        price: String(amount(doc.amountWithoutVat)),
        vatRate: cleanPercent(doc.vatPercent),
      }];

  return (
    <CreatedInvoiceView
      organizationId={company?.id ?? doc.companyId}
      companyName={companyName}
      organizationEmail={company?.email}
      organizationCompany={company}
      sellerCompany={purchase ? undefined : company}
      sellerDetails={seller}
      sellerBankAccount=""
      invoiceDetails={{
        invoiceNumber: doc.number || doc.fileCase || 'Invoice',
        invoiceDate: doc.invoiceContractDate || doc.documentDate,
        payByDate: doc.dueEndDate,
        language: doc.validForm,
        currency: doc.currency,
        salesTeam: '',
        magazine: doc.series,
        customerManager: doc.accountableResponsible,
        mainAnalyticalAccount: doc.expenseAccount,
      }}
      receiveDate={doc.receiveDate}
      partyDetails={buyer}
      personType="legal"
      attachmentNames={doc.fileCase ? [doc.fileCase] : []}
      note=""
      services={services}
      amount={amount(doc.amountWithoutVat)}
      vat={amount(doc.vat)}
      onBack={onBack}
      onStartChat={onStartChat}
      initialReceivedMessage={{
        author: seller.title || doc.clientCounterparty || 'Counterparty',
        date: doc.receiveDate || doc.documentDate || '—',
        text: `${doc.source || 'Email'}: received ${doc.fileCase || doc.number || 'invoice'} from ${seller.title || 'counterparty'}.`,
      }}
    />
  );
}
