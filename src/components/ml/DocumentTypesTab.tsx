import { useState } from 'react';
import { X } from 'lucide-react';
import ScheduleDatePicker from '../ScheduleDatePicker';

const FIELD_CLASS = 'h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]';
const LABEL_CLASS = 'font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]';

const CRON_FIELDS = [
  ['Minute', '0-59', '* , - /'],
  ['Hour', '0-23', '* , - /'],
  ['Day of month', '1-31', '* , - /'],
  ['Month', '1-12', '* , - /'],
  ['Day of week', '0-6', '* , - /'],
];

const CRON_SYMBOLS = [
  ['*', 'Used to select all values within a field.'],
  [',', 'Used to separate items of a list. For example, using "1,3,5" in the 5th field (day of week) means Monday, Wednesday and Friday.'],
  ['-', 'Used to specify ranges. For example, using 1–5 in the 5th field (day of week) indicates Monday through Friday.'],
  ['/', 'Can be combined with ranges to specify step values. For example, */5 in the 1st field (minutes) indicates every 5 minutes.'],
];

export default function DocumentTypesTab() {
  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cron, setCron] = useState('');
  const [showCronHelp, setShowCronHelp] = useState(false);

  return (
    <section aria-label="Autoretrain scheduler settings" className="flex flex-1 items-start">
      <div className="flex h-[638px] w-[380px] flex-col items-start gap-6 rounded-none border border-[#D3E1EC] bg-white p-6">
        <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">General</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-label="Enable autoretrain scheduler"
            aria-checked={enabled}
            onClick={() => setEnabled(current => !current)}
            className={`relative h-[18px] w-[30px] rounded-full transition-colors ${enabled ? 'bg-[#007EA7]' : 'bg-[#D3E1EC]'}`}
          >
            <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all ${enabled ? 'left-[14px]' : 'left-[2px]'}`} />
          </button>
          <span className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Enable</span>
        </div>

        <label className="flex w-full flex-col gap-2">
          <span className={LABEL_CLASS}>Name <span className="text-[#FF4550]">*</span></span>
          <input aria-label="Scheduler name" value={name} onChange={event => setName(event.target.value)} placeholder="Enter scheduler name" className={FIELD_CLASS} />
        </label>

        <label className="flex w-full flex-col gap-2">
          <span className={LABEL_CLASS}>Description</span>
          <textarea
            aria-label="Scheduler description"
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="Description"
            className="h-20 w-full resize-none rounded-lg border border-[#D3E1EC] bg-white px-[14px] py-[11px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
          />
        </label>

        <div className="flex w-full flex-col gap-2">
          <span className={LABEL_CLASS}>Schedule period</span>
          <div className="flex w-full gap-4">
            <ScheduleDatePicker value={startDate} onChange={setStartDate} placeholder="Start date" ariaLabel="Schedule start date" />
            <ScheduleDatePicker value={endDate} onChange={setEndDate} placeholder="End date" ariaLabel="Schedule end date" align="right" />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <h3 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Frequency</h3>
          <label className="flex w-full flex-col gap-2">
            <span className={LABEL_CLASS}>CRON expression <span className="text-[#FF4550]">*</span></span>
            <input aria-label="CRON expression" value={cron} onChange={event => setCron(event.target.value)} placeholder="CRON" className={FIELD_CLASS} />
          </label>
          <div className="flex flex-col items-start gap-0">
            <span className="font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">Enter a valid CRON schedule</span>
            <button type="button" onClick={() => setShowCronHelp(true)} className="font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline">What is CRON?</button>
          </div>
        </div>
      </div>

      {showCronHelp && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#10233A]/20 p-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="cron-help-title" className="flex h-[722px] max-h-[calc(100vh-48px)] w-[588px] max-w-[calc(100vw-48px)] flex-col gap-6 overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]">
            <div className="flex h-6 flex-shrink-0 items-start justify-between gap-2">
              <h2 id="cron-help-title" className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Writing a CRON expression</h2>
              <button type="button" aria-label="Close CRON help" onClick={() => setShowCronHelp(false)} className="flex h-6 w-6 items-center justify-center text-[#7288A3] transition-colors hover:text-[#10233A]"><X size={24} /></button>
            </div>

            <div className="flex flex-col gap-6">
              <p className="font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">A CRON expression is a string comprising five fields separated by white space that represents a set of times, as a schedule to execute the automation process.</p>

              <div className="flex flex-col gap-2">
                <p className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">A CRON expression takes the following format:</p>
                <code className="font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">&lt;minute&gt; &lt;hour&gt; &lt;day of month&gt; &lt;month&gt; &lt;day of week&gt;</code>
              </div>

              <div className="overflow-hidden rounded border border-[#E5E7EB]">
                <div className="grid h-[42px] grid-cols-3 items-center border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 font-montserrat text-[12px] font-medium leading-[18px] text-black">
                  <span>Field</span><span>Allowed Values</span><span>Special Characters</span>
                </div>
                {CRON_FIELDS.map(([field, values, symbols]) => (
                  <div key={field} className="grid h-[42px] grid-cols-3 items-center border-b border-[#E5E7EB] px-3 font-montserrat text-[12px] font-medium leading-[18px] text-black last:border-b-0">
                    <span>{field}</span><span>{values}</span><span>{symbols}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                {CRON_SYMBOLS.map(([symbol, description]) => (
                  <div key={symbol} className="flex min-h-10 items-start gap-[14px]">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-[#F8FAFC] font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">{symbol}</span>
                    <p className="pt-[10px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
