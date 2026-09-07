import { useState } from 'react';
import { AlignLeft, ArrowLeft, Braces, ChevronDown, ChevronUp, TextCursorInput } from 'lucide-react';

interface DocumentDetailsViewProps {
  documentName: string;
  documentSetName: string;
  onBack: () => void;
}

const DETAIL_FIELDS = [
  { label: 'Name', value: 'Invoice1-047985462m.pdf' },
  { label: 'Status', value: 'Active' },
  { label: 'Model', value: 'invoice-information-extraction' },
  { label: 'Version', value: '1.0.0' },
  { label: 'Type', value: 'Invoice' },
  { label: 'Created', value: '10.04.2026 12:22' },
];

const DETAIL_SECTIONS = [
  { id: 'fields', label: 'Fields', content: 'Invoice number, supplier, invoice date, total amount and currency' },
  { id: 'preprocessing', label: 'Preprocessing', content: 'Resize, deskew and OCR image normalization' },
  { id: 'postprocessing', label: 'Postprocessing', content: 'Field validation and ISO date formatting' },
  { id: 'execution', label: 'Execution data', content: 'Last processed successfully on 10.04.2026 12:23' },
];

export default function DocumentDetailsView({ documentName, documentSetName, onBack }: DocumentDetailsViewProps) {
  const [values, setValues] = useState(() => DETAIL_FIELDS.map(field => ({ ...field, value: field.label === 'Name' ? documentName : field.value })));
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  const toggleSection = (id: string) => {
    setOpenSections(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="relative flex min-h-full flex-col gap-6 bg-white px-9 py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
      <div className="flex flex-shrink-0 flex-col gap-4">
        <div className="flex items-center gap-4">
          <button type="button" aria-label="Back to Documents" onClick={onBack} className="flex h-[18px] w-[18px] items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]">
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <h1 className="font-montserrat text-[36px] font-semibold leading-[46px] text-[#10233A]">Documents details</h1>
        </div>

        <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium leading-[17px]">
          <span className="text-[#7288A3]">Machine learning</span>
          <span className="text-[#A1B6C6]">/</span>
          <span className="text-[#7288A3]">Document sets</span>
          <span className="text-[#A1B6C6]">/</span>
          <button type="button" onClick={onBack} className="text-[#7288A3] hover:text-[#007EA7]">{documentSetName}</button>
          <span className="text-[#A1B6C6]">/</span>
          <span className="text-[#A1B6C6]">Documents details</span>
        </div>
      </div>

      <div className="flex w-full max-w-[1440px] flex-col gap-6">
        {values.map((field, index) => (
          <div key={field.label} className="flex h-[70px] items-end gap-4">
            <label className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">{field.label}</span>
              <input
                aria-label={`Document ${field.label}`}
                value={field.value}
                onChange={event => {
                  setSaved(false);
                  setValues(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item));
                }}
                className="h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors focus:border-[#1B55E9]"
              />
            </label>
            <div className="flex h-[42px] w-20 items-center gap-4 py-[13px] text-[#7288A3]" aria-label={`${field.label} field format`}>
              <TextCursorInput size={16} />
              <AlignLeft size={16} />
              <Braces size={16} />
            </div>
          </div>
        ))}

        {DETAIL_SECTIONS.map(section => {
          const open = openSections.has(section.id);
          return (
            <div key={section.id} className="flex flex-col">
              <div className="flex h-[42px] items-center justify-between gap-4">
                <button type="button" aria-expanded={open} onClick={() => toggleSection(section.id)} className="flex flex-1 items-center gap-1 text-left font-montserrat text-[14px] font-semibold leading-5 text-[#10233A] hover:text-[#007EA7]">
                  {section.label}
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <div className="flex h-[42px] w-20 items-center gap-4 py-[13px] text-[#7288A3]" aria-hidden="true">
                  <TextCursorInput size={16} />
                  <AlignLeft size={16} />
                  <Braces size={16} />
                </div>
              </div>
              {open && (
                <div className="mr-24 rounded-lg border border-[#D3E1EC] bg-[#F8FDFF] px-[14px] py-3 font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">{section.content}</div>
              )}
            </div>
          );
        })}

        <div className="flex justify-end pt-1">
          {saved && <span role="status" className="mr-4 self-center font-montserrat text-[12px] font-medium text-[#2EA96B]">Changes updated</span>}
          <button type="button" onClick={() => setSaved(true)} className="flex h-8 w-[78px] items-center justify-center rounded-md bg-[#007EA7] px-3 font-montserrat text-[14px] font-semibold leading-5 text-white transition-colors hover:bg-[#006B8F]">Update</button>
        </div>
      </div>
    </div>
  );
}
