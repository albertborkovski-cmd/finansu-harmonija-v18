import Documents from "../Documents";
import type { Company } from "../../lib/supabase";
import type { InvoiceChatContext } from "./invoiceChat";

export default function InvoicesView({
  companyId,
  companyName = "",
  company,
  onStartChat,
}: {
  companyId: string;
  companyName?: string;
  company?: Company;
  onStartChat?: (context: InvoiceChatContext) => void;
}) {
  return (
    <Documents
      companyId={companyId}
      companyName={companyName}
      company={company}
      generalLedgerName={company?.general_ledger}
      title="Invoices"
      documentTypeFilter="invoice"
      onStartChat={onStartChat}
    />
  );
}
