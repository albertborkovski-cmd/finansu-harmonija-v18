import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import CompanyBreadcrumb from './CompanyBreadcrumb';
import { PageActionButton, PageHeader } from './PageHeader';

type PreviewField = { label: string; value: string | number | null | undefined };

/** Read-only native-record view used when a task or notification opens its related object. */
export default function RelatedObjectPreview({ companyName, section, title, fields, loading = false, unavailable = false, onBack }: {
  companyName: string;
  section: string;
  title: string;
  fields: PreviewField[];
  loading?: boolean;
  unavailable?: boolean;
  onBack: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.focus({ preventScroll: true }); }, [title]);

  return <div ref={contentRef} tabIndex={-1} className="flex min-w-0 flex-col gap-6 bg-white px-4 py-10 outline-none sm:px-8 lg:px-[56px]">
    <PageHeader title={title} leading={<PageActionButton iconOnly icon={<ArrowLeft size={18} />} ariaLabel="Back to task or notification" onClick={onBack}>Back</PageActionButton>} />
    <CompanyBreadcrumb companyName={companyName} items={[section, title]} />
    {loading ? <p role="status" className="font-montserrat text-[13px] text-[#7288A3]">Loading related object…</p>
      : unavailable ? <p role="alert" className="rounded-lg border border-[#D3E1EC] bg-[#F8FDFF] p-4 font-montserrat text-[13px] text-[#7288A3]">This related object is no longer available in this organization.</p>
        : <dl className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border border-[#D3E1EC] p-5 font-montserrat sm:grid-cols-2 xl:grid-cols-3">
          {fields.map(({ label, value }) => <div key={label} className="min-w-0">
            <dt className="text-[12px] font-medium leading-[18px] text-[#7288A3]">{label}</dt>
            <dd className="m-0 mt-1 whitespace-pre-wrap break-words text-[13px] font-normal leading-5 text-[#10233A]">{value === '' || value == null ? '—' : value}</dd>
          </div>)}
        </dl>}
  </div>;
}
