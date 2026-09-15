import { useEffect, useRef, useState } from 'react';
import { TABLE_BATCH_SIZE } from '../lib/tablePaging';
import TablePagination from './TablePagination';
import { X } from 'lucide-react';
import { PageActionButton } from './PageHeader';
import SearchableSelect from './SearchableSelect';
import { supabase, type Company } from '../lib/supabase';
import { importOrganizationCard, importRowFromRecord, type OrganizationImportRow } from '../lib/organizationImport';
import { findOrganizationDuplicate } from '../lib/organizationCreation';

export default function OrganizationImportWizard({ onClose, onOpenSetup, onImported }: { onClose: () => void; onOpenSetup: (company: Company) => void; onImported: () => void }) {
  const [step, setStep] = useState(1);
  const [page, setPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPage(1), [step]);
  const [source, setSource] = useState('Rivilė');
  const [erpName, setErpName] = useState('');
  const [environment, setEnvironment] = useState('');
  const [rows, setRows] = useState<OrganizationImportRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Array<{ row: OrganizationImportRow; company?: Company; outcome: string }>>([]);
  const sourceName = source === 'Other ERP' ? erpName.trim() : source;
  const inputClass = 'h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[12px] outline-none focus:border-[#007EA7]';
  const selected = rows.filter(row => row.selected);
  const itemCount = step === 2 ? rows.length : step === 3 ? selected.length : step === 4 ? results.length : 0;
  const loadFile = async (file: File) => {
    setBusy(true); setError(''); setRows([]); setPage(1);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Maximum file size is 10 MB.');
      let records: unknown;
      if (/\.json$/i.test(file.name)) records = JSON.parse(await file.text());
      else if (/\.(csv|xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        records = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
      } else throw new Error('Choose a JSON, CSV, XLSX or XLS file.');
      if (!Array.isArray(records) || !records.length || records.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('The file must contain organization card records.');
      const { data, error: lookupError } = await supabase.from('companies').select('*');
      if (lookupError) throw new Error(lookupError.message);
      const available = (data ?? []) as unknown as Company[];
      setCompanies(available);
      setRows(records.map(record => {
        const row = importRowFromRecord(record);
        const match = findOrganizationDuplicate(available, { tax_country: row.country, company_code: row.code, vat_code: row.vat });
        return { ...row, targetId: match?.id ?? '' };
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read file.'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (busy) return;
    setBusy(true); setError('');
    const completed: typeof results = [];
    for (const row of selected) {
      try { const result = await importOrganizationCard(row, sourceName, environment.trim()); completed.push({ row, ...result }); }
      catch (cause) { completed.push({ row, outcome: cause instanceof Error ? cause.message : 'Import failed' }); }
    }
    setResults(completed); setStep(4); setBusy(false); onImported();
  };
  const validSelection = selected.length > 0 && selected.every(row => row.name && row.country && row.code && row.externalId.trim()) && new Set(selected.map(row => row.externalId.trim())).size === selected.length;
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#10233A]/20 p-6">
    <section role="dialog" aria-modal="true" aria-label="Import organizations" className="flex max-h-[90vh] w-full max-w-[1100px] flex-col gap-6 rounded-xl bg-white p-6 font-montserrat text-[12px] text-[#10233A] shadow-xl">
      <header className="flex items-center justify-between"><h2 className="text-[22px] font-semibold">Import organizations</h2><button disabled={busy} onClick={onClose} aria-label="Close import organizations"><X size={22} /></button></header>
      <ol className="flex gap-4 text-[#7288A3]">{['Source', 'Organizations & identifiers', 'Create / link in FH', 'Setup & integration'].map((label, index) => <li key={label} className={step === index + 1 ? 'font-semibold text-[#007EA7]' : ''}>{index + 1}. {label}</li>)}</ol>
      <div ref={tableScrollRef} className="min-h-0 overflow-auto">
        {step === 1 && <div className="max-w-[500px] space-y-4">
          <label className="block">Source<SearchableSelect ariaLabel="Organization import source" options={['Rivilė', 'Other ERP', 'File']} value={source} onChange={setSource} /></label>
          {source === 'Other ERP' && <label className="block">ERP name<input className={inputClass} value={erpName} onChange={event => setErpName(event.target.value)} /></label>}
          <label className="block">Source environment / database identifier <span className="text-red-600">*</span><input className={inputClass} value={environment} onChange={event => setEnvironment(event.target.value)} /></label>
          <p className="text-[#7288A3]">Organization cards only. Upload an export from the selected source. Direct ERP connections are not configured.</p>
        </div>}
        {step === 2 && <div className="space-y-4">
          <input aria-label="Organization cards file" type="file" accept=".json,.csv,.xlsx,.xls" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void loadFile(file); }} />
          <p className="text-[#7288A3]">Fields: name, country, company_code, vat_code (optional), external_id. Select cards and map source IDs to FH organizations. No accounting data will be imported.</p>
          {!!rows.length && <table className="w-full text-left"><thead><tr><th><input aria-label="Select all imported organizations" type="checkbox" checked={rows.every(row => row.selected)} onChange={event => setRows(current => current.map(row => ({ ...row, selected: event.target.checked })))} /></th><th>Name / country / code</th><th>Source organization ID</th><th>FH organization</th></tr></thead><tbody>
            {rows.slice(0, page * TABLE_BATCH_SIZE).map((row, index) => <tr key={index} className={index % 2 === 0 ? 'bg-[#F8FDFF]' : ''}><td className="p-2"><input aria-label={`Select ${row.name || index + 1}`} type="checkbox" checked={row.selected} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} /></td><td className="p-2">{row.name || 'Missing name'}<div className="text-[#7288A3]">{row.country || 'Missing country'} / {row.code || 'Missing code'} / {row.vat || '—'}</div></td><td className="p-2"><input aria-label={`Source ID for ${row.name}`} className={inputClass} value={row.externalId} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, externalId: event.target.value } : item))} /></td><td className="min-w-[260px] p-2"><SearchableSelect ariaLabel={`FH organization for ${row.name}`} value={row.targetId} options={[{ value: '', label: 'Create new / match identifiers' }, ...companies.map(company => ({ value: company.id, label: `${company.name} (${company.company_code})` }))]} onChange={value => setRows(current => current.map((item, i) => i === index ? { ...item, targetId: value } : item))} /></td></tr>)}
          </tbody></table>}
          {!!rows.length && !validSelection && <p className="text-red-600">Select at least one valid card. Required identifiers must be filled; source IDs must be unique within the selection.</p>}
        </div>}
        {step === 3 && <div className="space-y-3"><p>{selected.length} organizations from {sourceName} / {environment}.</p>{selected.slice(0, page * TABLE_BATCH_SIZE).map(row => <p key={row.externalId}>{row.name} · {row.externalId} → {companies.find(company => company.id === row.targetId)?.name || 'Create new or link an exact match'}</p>)}<p className="text-[#7288A3]">Existing FH cards will not be overwritten. Accounting data migration is a separate, per-organization process.</p></div>}
        {step === 4 && <div className="space-y-3">{results.slice(0, page * TABLE_BATCH_SIZE).map((result, index) => <div key={index} className="flex items-center justify-between gap-4 rounded-lg bg-[#F8FDFF] p-3"><div>{result.row.name}<p className={result.company ? 'text-[#7288A3]' : 'text-red-600'}>{result.outcome}</p></div>{result.company && <PageActionButton onClick={() => onOpenSetup(result.company!)}>Manage/Admin → Setup & integration</PageActionButton>}</div>)}<p className="text-[#7288A3]">Only organization cards and source ID links were processed. Continue accounting data transfer in each organization’s Initial setup / Migration process.</p></div>}
      </div>
      {step > 1 && <TablePagination scrollRef={tableScrollRef} currentPage={page} totalPages={Math.max(1, Math.ceil(itemCount / TABLE_BATCH_SIZE))} itemCount={itemCount} onPageChange={setPage} />}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <footer className="flex justify-end gap-2">{step > 1 && step < 4 && <PageActionButton disabled={busy} onClick={() => setStep(step - 1)}>Back</PageActionButton>}{step === 1 && <PageActionButton disabled={!sourceName || !environment.trim()} onClick={() => setStep(2)}>Next</PageActionButton>}{step === 2 && <PageActionButton disabled={busy || !validSelection} onClick={() => setStep(3)}>Next</PageActionButton>}{step === 3 && <PageActionButton disabled={busy} onClick={() => void confirm()}>{busy ? 'Importing…' : 'Create / link organizations'}</PageActionButton>}{step === 4 && <PageActionButton onClick={onClose}>Close</PageActionButton>}</footer>
    </section>
  </div>;
}
