import { useState } from 'react';
import { ArrowLeft, Send, Trash2, Download, Paperclip, MessageSquare, Plus, X } from 'lucide-react';
import UploadAttachmentPanel from './UploadAttachmentPanel';
import AddNotePanel from './AddNotePanel';
import SendInvoicePanel from './SendInvoicePanel';

interface InvoiceRow {
  id: string;
  date: string;
  receiveDate?: string;
  number: string;
  type: 'Sales' | 'Purchase';
  series: string;
  buyer: string;
  seller: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  dueDate: string;
  status: string;
  hasAttachment: boolean;
  paymentMethod: string;
  notes: string;
}

interface ServiceLine {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  vatRate: number;
  total: number;
}

interface Attachment {
  id: string;
  name: string;
  size: string;
  date: string;
}

interface Note {
  id: string;
  author: string;
  date: string;
  text: string;
}

interface ChatMessage {
  id: string;
  author: string;
  date: string;
  text: string;
  isOwn: boolean;
}

const SAMPLE_SERVICES: ServiceLine[] = [
  { id: '1', name: 'Accounting services - January 2024', unit: 'service', quantity: 1, price: 800.00, vatRate: 21, total: 968.00 },
  { id: '2', name: 'Payroll processing', unit: 'service', quantity: 1, price: 250.00, vatRate: 21, total: 302.50 },
  { id: '3', name: 'Annual report preparation', unit: 'service', quantity: 1, price: 200.00, vatRate: 21, total: 242.00 },
];

const SAMPLE_ATTACHMENTS: Attachment[] = [
  { id: '1', name: 'invoice_scan.pdf', size: '2.4 MB', date: '2024-01-15' },
  { id: '2', name: 'contract_signed.pdf', size: '1.1 MB', date: '2024-01-10' },
];

const SAMPLE_NOTES: Note[] = [
  { id: '1', author: 'John Brick', date: '2024-01-16', text: 'Invoice sent to client via email.' },
  { id: '2', author: 'Anna Smith', date: '2024-01-17', text: 'Client confirmed receipt. Payment expected by due date.' },
];

const SAMPLE_CHAT: ChatMessage[] = [
  { id: '1', author: 'John Brick', date: '2024-01-15 10:30', text: 'Invoice has been prepared and is ready for review.', isOwn: true },
  { id: '2', author: 'Anna Smith', date: '2024-01-15 11:15', text: 'Reviewed. Everything looks correct. Please proceed with sending.', isOwn: false },
  { id: '3', author: 'John Brick', date: '2024-01-15 14:00', text: 'Invoice sent to the client. Confirmation received.', isOwn: true },
];

const STATUS_COLORS: Record<string, string> = {
  Processed: '#0ED8A8',
  Pending: '#EEB648',
  Draft: '#D3E1EC',
  Declined: '#FF4550',
};

interface InvoiceDetailViewProps {
  invoice: InvoiceRow;
  onBack: () => void;
}

export default function InvoiceDetailView({ invoice, onBack }: InvoiceDetailViewProps) {
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');

  return (
    <div className="flex flex-col bg-white min-h-full relative">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-[#E5EDF9]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <ArrowLeft size={14} className="text-[#007EA7]" strokeWidth={2.5} />
          <span className="font-montserrat font-semibold text-[14px] text-[#007EA7]">Back to invoices</span>
        </button>
        <div className="flex items-center gap-2 ml-4">
          <span className="font-montserrat font-medium text-[12px] text-[#7288A3]">Invoices</span>
          <span className="text-[#7288A3]">/</span>
          <span className="font-montserrat font-medium text-[12px] text-[#10233A]">{invoice.number}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-[6px] px-2 py-1 rounded bg-[#F8FDFF] border border-[#D3E1EC]">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[invoice.status] || '#D3E1EC' }} />
            <span className="font-montserrat font-medium text-[12px] text-[#10233A]">{invoice.status}</span>
          </div>
          <button
            onClick={() => setShowSendPanel(true)}
            className="flex items-center gap-1 px-3 py-[6px] bg-[#007EA7] rounded-md h-8 hover:bg-[#006b8f] transition-colors"
          >
            <Send size={12} className="text-white" />
            <span className="font-montserrat font-semibold text-[13px] text-white">Send</span>
          </button>
          <button className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#E5EDF9] transition-colors" title="Download">
            <Download size={14} className="text-[#7288A3]" />
          </button>
          <button className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#FFF0F0] transition-colors" title="DELETE">
            <Trash2 size={14} className="text-[#FF4550]" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column - 550px */}
        <div className="flex flex-col gap-0 overflow-y-auto" style={{ width: 550, minWidth: 550 }}>
          {/* Invoice info */}
          <div className="border border-[#D3E1EC] rounded-lg m-6 mb-3">
            <div className="px-5 py-3 border-b border-[#D3E1EC]">
              <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">Invoice information</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4">
              <DetailField label="Invoice number" value={invoice.number} />
              <DetailField label="Invoice date" value={invoice.date} />
              <DetailField label="Receive date" value={invoice.receiveDate || '—'} />
              <DetailField label="Type" value={invoice.type} />
              <DetailField label="Series" value={invoice.series} />
              <DetailField label="Due date" value={invoice.dueDate} />
              <DetailField label="Payment method" value={invoice.paymentMethod} />
              <DetailField label="Currency" value={invoice.currency} />
              <DetailField label="Status" value={invoice.status} />
            </div>
          </div>

          {/* Buyer info */}
          <div className="border border-[#D3E1EC] rounded-lg mx-6 mb-3">
            <div className="px-5 py-3 border-b border-[#D3E1EC]">
              <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">Buyer information</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4">
              <DetailField label="Company name" value={invoice.buyer} />
              <DetailField label="Company code" value="305123456" />
              <DetailField label="VAT code" value="LT100012345611" />
              <DetailField label="Address" value="Gedimino pr. 1, Vilnius" />
              <DetailField label="Email" value="info@company.lt" />
              <DetailField label="Phone" value="+370 600 12345" />
            </div>
          </div>

          {/* Seller info */}
          <div className="border border-[#D3E1EC] rounded-lg mx-6 mb-3">
            <div className="px-5 py-3 border-b border-[#D3E1EC]">
              <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">Seller information</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4">
              <DetailField label="Company name" value={invoice.seller} />
              <DetailField label="Company code" value="302567890" />
              <DetailField label="VAT code" value="LT100098765432" />
              <DetailField label="Address" value="Konstitucijos pr. 7, Vilnius" />
              <DetailField label="Bank" value="Swedbank, AB" />
              <DetailField label="Account" value="LT12 7300 0100 1234 5678" />
            </div>
          </div>

          {/* Services table */}
          <div className="border border-[#D3E1EC] rounded-lg mx-6 mb-6">
            <div className="px-5 py-3 border-b border-[#D3E1EC] flex items-center justify-between">
              <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">Services / Items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="h-8 border-b border-[#E5EDF9]">
                    <th className="px-4 text-left"><span className="font-montserrat font-medium text-[11px] text-[#7288A3]">Service name</span></th>
                    <th className="px-3 text-left"><span className="font-montserrat font-medium text-[11px] text-[#7288A3]">Unit</span></th>
                    <th className="px-3 text-right"><span className="font-montserrat font-medium text-[11px] text-[#7288A3]">Qty</span></th>
                    <th className="px-3 text-right"><span className="font-montserrat font-medium text-[11px] text-[#7288A3]">Price</span></th>
                    <th className="px-3 text-right"><span className="font-montserrat font-medium text-[11px] text-[#7288A3]">VAT %</span></th>
                    <th className="px-4 text-right"><span className="font-montserrat font-medium text-[11px] text-[#7288A3]">Total</span></th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_SERVICES.map((svc, idx) => (
                    <tr key={svc.id} className={`h-9 ${idx % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                      <td className="px-4"><span className="font-montserrat font-medium text-[12px] text-[#10233A]">{svc.name}</span></td>
                      <td className="px-3"><span className="font-montserrat font-medium text-[12px] text-[#7288A3]">{svc.unit}</span></td>
                      <td className="px-3 text-right"><span className="font-montserrat font-medium text-[12px] text-[#10233A]">{svc.quantity}</span></td>
                      <td className="px-3 text-right"><span className="font-montserrat font-medium text-[12px] text-[#10233A]">{svc.price.toFixed(2)}</span></td>
                      <td className="px-3 text-right"><span className="font-montserrat font-medium text-[12px] text-[#7288A3]">{svc.vatRate}%</span></td>
                      <td className="px-4 text-right"><span className="font-montserrat font-semibold text-[12px] text-[#10233A]">{svc.total.toFixed(2)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Totals */}
            <div className="flex flex-col items-end px-5 py-3 border-t border-[#D3E1EC] gap-1">
              <div className="flex items-center gap-4">
                <span className="font-montserrat font-medium text-[12px] text-[#7288A3]">Net total:</span>
                <span className="font-montserrat font-medium text-[12px] text-[#10233A] w-[80px] text-right">{invoice.netAmount.toFixed(2)} {invoice.currency}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-montserrat font-medium text-[12px] text-[#7288A3]">VAT total:</span>
                <span className="font-montserrat font-medium text-[12px] text-[#10233A] w-[80px] text-right">{invoice.vatAmount.toFixed(2)} {invoice.currency}</span>
              </div>
              <div className="flex items-center gap-4 mt-1 pt-1 border-t border-[#E5EDF9]">
                <span className="font-montserrat font-semibold text-[13px] text-[#10233A]">Total:</span>
                <span className="font-montserrat font-semibold text-[13px] text-[#10233A] w-[80px] text-right">{invoice.totalAmount.toFixed(2)} {invoice.currency}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - flexible */}
        <div className="flex-1 flex flex-col gap-0 overflow-y-auto border-l border-[#E5EDF9] min-w-[320px]">
          {/* Chat section */}
          <div className="border-b border-[#E5EDF9] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-[#7288A3]" />
                <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">Chat</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 max-h-[200px] overflow-y-auto mb-3">
              {SAMPLE_CHAT.map(msg => (
                <div key={msg.id} className={`flex flex-col gap-[2px] ${msg.isOwn ? 'items-end' : 'items-start'}`}>
                  <div className={`px-3 py-2 rounded-lg max-w-[85%] ${msg.isOwn ? 'bg-[#E6F2F6]' : 'bg-[#F8FDFF] border border-[#E5EDF9]'}`}>
                    <span className="font-montserrat font-medium text-[12px] text-[#10233A]">{msg.text}</span>
                  </div>
                  <span className="font-montserrat font-medium text-[10px] text-[#A1B6C6]">{msg.author} - {msg.date}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 h-8 px-3 rounded border border-[#D3E1EC] font-montserrat font-medium text-[12px] text-[#10233A] placeholder:text-[#A1B6C6] outline-none focus:border-[#007EA7] transition-colors"
              />
              <button data-system-action="true" className="flex items-center justify-center w-8 h-8 bg-[#007EA7] rounded hover:bg-[#006b8f] transition-colors">
                <Send size={12} className="text-white" />
              </button>
            </div>
          </div>

          {/* Attachments section */}
          <div className="border-b border-[#E5EDF9] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Paperclip size={14} className="text-[#7288A3]" />
                <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">Attachments</span>
                <span className="font-montserrat font-medium text-[11px] text-[#A1B6C6]">({SAMPLE_ATTACHMENTS.length})</span>
              </div>
              <button
                onClick={() => setShowUploadPanel(true)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#E5EDF9] transition-colors"
              >
                <Plus size={12} className="text-[#007EA7]" />
                <span className="font-montserrat font-medium text-[12px] text-[#007EA7]">Add</span>
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {SAMPLE_ATTACHMENTS.map(att => (
                <div key={att.id} className="flex items-center gap-3 px-3 py-2 bg-[#F8FDFF] rounded border border-[#E5EDF9]">
                  <Paperclip size={12} className="text-[#7288A3] flex-shrink-0" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-montserrat font-medium text-[12px] text-[#007EA7] truncate">{att.name}</span>
                    <span className="font-montserrat font-medium text-[10px] text-[#A1B6C6]">{att.size} - {att.date}</span>
                  </div>
                  <button className="flex-shrink-0 hover:opacity-70 transition-opacity" title="Download">
                    <Download size={12} className="text-[#7288A3]" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(att.id)}
                    className="flex-shrink-0 hover:opacity-70 transition-opacity"
                    title="DELETE"
                  >
                    <Trash2 size={12} className="text-[#FF4550]" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes section */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">Notes</span>
              <button
                onClick={() => setShowNotePanel(true)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#E5EDF9] transition-colors"
              >
                <Plus size={12} className="text-[#007EA7]" />
                <span className="font-montserrat font-medium text-[12px] text-[#007EA7]">Add note</span>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {SAMPLE_NOTES.map(note => (
                <div key={note.id} className="flex flex-col gap-1 px-3 py-2 bg-[#F8FDFF] rounded border border-[#E5EDF9]">
                  <div className="flex items-center justify-between">
                    <span className="font-montserrat font-semibold text-[11px] text-[#10233A]">{note.author}</span>
                    <span className="font-montserrat font-medium text-[10px] text-[#A1B6C6]">{note.date}</span>
                  </div>
                  <span className="font-montserrat font-medium text-[12px] text-[#10233A]">{note.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Upload attachment panel */}
      {showUploadPanel && <UploadAttachmentPanel onClose={() => setShowUploadPanel(false)} />}

      {/* Add note panel */}
      {showNotePanel && <AddNotePanel onClose={() => setShowNotePanel(false)} />}

      {/* Send invoice panel */}
      {showSendPanel && (
        <SendInvoicePanel
          invoice={invoice}
          senderName={invoice.type === 'Purchase' ? invoice.buyer : invoice.seller}
          recipientName={invoice.type === 'Purchase' ? invoice.seller : invoice.buyer}
          reconciliationDate={new Date().toISOString().slice(0, 10)}
          onClose={() => setShowSendPanel(false)}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-lg border border-[#D3E1EC] shadow-lg p-6 max-w-[340px] w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <span className="font-montserrat font-semibold text-[16px] text-[#10233A]">Delete attachment</span>
              <button onClick={() => setShowDeleteConfirm(null)} className="hover:opacity-70">
                <X size={16} className="text-[#7288A3]" />
              </button>
            </div>
            <p className="font-montserrat font-medium text-[13px] text-[#7288A3] mb-6">
              Are you sure you want to delete this attachment? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 rounded-md border border-[#D3E1EC] font-montserrat font-medium text-[13px] text-[#10233A] hover:bg-[#F8FDFF] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 rounded-md bg-[#FF6200] font-montserrat font-semibold text-[13px] text-white hover:bg-[#E55800] transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="font-montserrat font-medium text-[11px] text-[#7288A3] uppercase tracking-wide">{label}</span>
      <span className="font-montserrat font-medium text-[13px] text-[#10233A]">{value}</span>
    </div>
  );
}
