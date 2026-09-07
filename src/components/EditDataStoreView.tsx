import { useState } from 'react';
import { ArrowLeft, Type, AlignLeft, Braces, WrapText, Copy, Maximize2 } from 'lucide-react';
import { PageActionButton, PageHeader } from './PageHeader';

interface Props {
  storeName: string;
  onBack: () => void;
}

interface FieldConfig {
  label: string;
  value: string;
  type: 'input' | 'textarea';
}

const INITIAL_FIELDS: FieldConfig[] = [
  { label: 'Document type', value: 'Invoice', type: 'textarea' },
  { label: 'Model document type', value: 'Invoice', type: 'input' },
  { label: 'Document type score', value: '0.9999692440032959', type: 'input' },
  { label: 'CI result', value: '{"scoreThreshold":0.9,"multipleChoice":false,"sco...', type: 'input' },
  { label: 'Le result', value: '{"City":"Ponta do Sol","products":[{"Price":"110 00",', type: 'input' },
  { label: 'Error message', value: '\u2014', type: 'input' },
  { label: 'Uuid', value: '9f9cd30f-ce9b-44c6-9a7d-9f489953', type: 'input' },
  { label: 'Name', value: 'Document 9f9cd30f-ce9b-44c6-9a7d-9f489953e..', type: 'input' },
  { label: 'Notes', value: 'Document for idp_sample/input_1ht5good/INVO..', type: 'input' },
  { label: 'Status', value: 'Ready', type: 'input' },
  { label: 'URL', value: 'https://cs2.easyrpa.eu/api/v1/s3/proxy/data/id.', type: 'input' },
  { label: 'S3 path', value: 'idp_sample/2a20a66b-f760-40cc-847b-ea84c5b...', type: 'input' },
  { label: 'Ocr json', value: '{"runUuid":"b1cb4197-5f36-4be6-8161-97a90642...', type: 'input' },
];

export default function EditDataStoreView({ storeName, onBack }: Props) {
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [treeViewEnabled, setTreeViewEnabled] = useState(true);
  const [showRepairBanner] = useState(true);

  const updateField = (idx: number, value: string) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, value } : f));
  };

  const groupManagementTitle = `Group Management (${storeName} DataStore)`;

  return (
    <div className="flex flex-col bg-white min-h-full px-[72px] py-[56px] overflow-y-auto" style={{ gap: 32 }}>

      {/* Header */}
      <div className="flex flex-col gap-4 flex-shrink-0">
        <PageHeader title="Edit data store" leading={<button onClick={onBack} className="flex-shrink-0 text-[#7288A3] hover:text-[#007EA7] transition-colors"><ArrowLeft size={20} /></button>} actions={<><PageActionButton onClick={onBack}>Cancel</PageActionButton><PageActionButton disabled>Create new</PageActionButton></>} />

        {/* Breadcrumb */}
        <div className="flex flex-row items-center gap-2 flex-wrap">
          <button onClick={onBack} className="font-montserrat font-medium text-[12px] leading-[17px] text-[#7288A3] hover:text-[#007EA7] transition-colors">
            Data stores
          </button>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">/</span>
          <button onClick={onBack} className="font-montserrat font-medium text-[12px] leading-[17px] text-[#7288A3] hover:text-[#007EA7] transition-colors">
            {groupManagementTitle}
          </button>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">/</span>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#7288A3]">Data store details</span>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">/</span>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">Edit data store</span>
        </div>
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-6">
        {fields.map((field, idx) => (
          <div key={idx} className="flex flex-row items-end gap-4">
            {/* Input section */}
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                {field.label}
              </label>

              {field.type === 'textarea' ? (
                <div className="flex flex-col">
                  <textarea
                    value={field.value}
                    onChange={e => updateField(idx, e.target.value)}
                    className="w-full h-[120px] px-[14px] py-[11px] bg-white border border-[#D3E1EC] border-b-0 rounded-t-lg font-montserrat font-medium text-[14px] leading-[140%] text-[#10233A] resize-none focus:outline-none focus:border-[#007EA7] transition-colors"
                  />

                  {/* Repair banner */}
                  {showRepairBanner && (
                    <div className="flex flex-row justify-between items-center px-3 py-2 bg-[#F0FDF4]">
                      <span className="font-montserrat font-medium text-[14px] leading-[140%] text-[#065F46]">
                        The loaded JSON document was invalid but it is successfully repaired.
                      </span>
                      <div className="flex flex-row items-center gap-2">
                        <button data-system-action="true" className="flex items-center justify-center px-3 py-[6px] bg-[#007EA7] rounded-md h-8">
                          <span className="font-montserrat font-semibold text-[14px] leading-5 text-white">Apply</span>
                        </button>
                        <button data-system-action="true" className="flex items-center justify-center px-3 py-[6px] bg-[#007EA7] rounded-md h-8">
                          <span className="font-montserrat font-semibold text-[14px] leading-5 text-white">Apply and format as JSON</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Toolbar */}
                  <div className="flex flex-row justify-between items-center px-3 py-3 bg-[#F8FAFC] border border-t-[#E5EDF9] rounded-b-lg">
                    <div className="flex flex-row items-center gap-2">
                      {/* Toggle */}
                      <button
                        onClick={() => setTreeViewEnabled(v => !v)}
                        className="relative w-[30px] h-[18px] rounded-full transition-colors flex-shrink-0"
                        style={{ backgroundColor: treeViewEnabled ? '#007EA7' : '#D3E1EC' }}
                      >
                        <div
                          className="absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-all"
                          style={{ left: treeViewEnabled ? 14 : 2 }}
                        />
                      </button>
                      <span className="font-montserrat font-medium text-[14px] leading-5 text-[#7288A3]">Tree View</span>
                    </div>
                    <div className="flex flex-row items-center gap-4">
                      <button className="text-[#7288A3] hover:text-[#007EA7] transition-colors">
                        <WrapText size={16} />
                      </button>
                      <button className="text-[#7288A3] hover:text-[#007EA7] transition-colors">
                        <Copy size={16} />
                      </button>
                      <button className="text-[#7288A3] hover:text-[#007EA7] transition-colors">
                        <Maximize2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={field.value}
                  onChange={e => updateField(idx, e.target.value)}
                  className="w-full h-[42px] px-[14px] py-[11px] bg-white border border-[#D3E1EC] rounded-lg font-montserrat font-medium text-[14px] leading-[140%] text-[#10233A] focus:outline-none focus:border-[#007EA7] transition-colors"
                />
              )}
            </div>

            {/* Field type icons */}
            {field.type !== 'textarea' && (
              <div className="flex flex-row items-center gap-4 pb-[13px] flex-shrink-0">
                <button className="text-[#7288A3] hover:text-[#007EA7] transition-colors" title="Text field">
                  <Type size={16} />
                </button>
                <button className="text-[#7288A3] hover:text-[#007EA7] transition-colors" title="Paragraph">
                  <AlignLeft size={16} />
                </button>
                <button className="text-[#7288A3] hover:text-[#007EA7] transition-colors" title="JSON">
                  <Braces size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
