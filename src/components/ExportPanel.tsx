import { useState, useEffect } from 'react';
import { SaveButton } from './ScopedActionButtons';

interface RecordData {
  name: string;
  description: string;
  permissions: string;
  ciResult: string;
  leResult: string;
  errorMessage: string;
  uuid: string;
  memberName: string;
  notes: string;
  status: string;
  url: string;
  s3Path: string;
  ocrJson: string;
}

interface Props {
  initialData?: Partial<RecordData>;
  onClose: () => void;
  onSave: (data: RecordData) => void;
}

const EMPTY: RecordData = {
  name: '', description: '', permissions: '', ciResult: '', leResult: '',
  errorMessage: '', uuid: '', memberName: '', notes: '', status: '', url: '',
  s3Path: '', ocrJson: '',
};

const FIELDS: { key: keyof RecordData; label: string }[] = [
  { key: 'name',         label: 'Name' },
  { key: 'description',  label: 'Description' },
  { key: 'permissions',  label: 'Permissions' },
  { key: 'ciResult',     label: 'CI result' },
  { key: 'leResult',     label: 'LE result' },
  { key: 'errorMessage', label: 'Error message' },
  { key: 'uuid',         label: 'Uuid' },
  { key: 'memberName',   label: 'Name' },
  { key: 'notes',        label: 'Notes' },
  { key: 'status',       label: 'Status' },
  { key: 'url',          label: 'URL' },
  { key: 's3Path',       label: 'S3 path' },
  { key: 'ocrJson',      label: 'Ocr json' },
];

export default function ExportPanel({ initialData, onClose, onSave }: Props) {
  const [form, setForm] = useState<RecordData>({ ...EMPTY, ...initialData });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 220);
  };

  const handleSave = () => {
    onSave(form);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 pointer-events-auto transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0, background: 'transparent' }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="relative pointer-events-auto flex flex-col bg-white overflow-y-auto transition-transform duration-[220ms] ease-out"
        style={{
          width: 440,
          boxShadow: '-2px 0px 0px #E5EDF9',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          padding: '24px 24px 32px',
          gap: 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-row justify-between items-center" style={{ marginBottom: 24 }}>
          <span
            className="font-montserrat font-semibold text-[#10233A] flex-1"
            style={{ fontSize: 22, lineHeight: '32px' }}
          >
            Edit record
          </span>
          <button
            onClick={handleClose}
            className="flex items-center justify-center flex-shrink-0 transition-colors hover:text-[#007EA7]"
            style={{ width: 24, height: 24, color: '#7288A3' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div className="flex flex-col" style={{ gap: 24, marginBottom: 32 }}>
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="flex flex-col" style={{ gap: 8 }}>
              <label
                className="font-montserrat font-semibold text-[#10233A]"
                style={{ fontSize: 14, lineHeight: '20px' }}
              >
                {label}
              </label>
              <input
                type="text"
                value={form[key]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full font-montserrat font-medium text-[#10233A] bg-white outline-none focus:border-[#007EA7] transition-colors"
                style={{
                  fontSize: 14,
                  lineHeight: '20px',
                  border: '1px solid #D3E1EC',
                  borderRadius: 8,
                  padding: '11px 14px',
                  height: 42,
                }}
                placeholder={label}
              />
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex flex-col" style={{ gap: 16 }}>
          <SaveButton onClick={handleSave} className="w-full" />
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center font-montserrat font-semibold transition-colors hover:border-[#A1B6C6]"
            style={{
              background: '#FFFFFF',
              border: '2px solid #D3E1EC',
              borderRadius: 8,
              height: 42,
              fontSize: 16,
              lineHeight: '24px',
              color: '#7288A3',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
