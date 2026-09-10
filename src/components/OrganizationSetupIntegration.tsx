import { useState } from 'react';
import type { Company } from '../lib/supabase';
import { loadOrganizationSourceLinks } from '../lib/organizationImport';
import { MIGRATION_SCOPE, loadMigrationSetup, saveMigrationSetup, validateMigrationPackage } from '../lib/organizationMigration';
import { PageHeader, PageActionButton } from './PageHeader';
import { SystemBreadcrumb } from './SystemNavigation';
import { ClientField } from './CompanyClientInformation';
import CompanySharePointSettings from './CompanySharePointSettings';

export default function OrganizationSetupIntegration({ company, onBack, onOpenCard, embedded = false }: { company: Company; onBack?: () => void; onOpenCard?: () => void; embedded?: boolean }) {
  const [setup, setSetup] = useState(() => {
    const saved = loadMigrationSetup(company.id);
    const link = loadOrganizationSourceLinks().find(item => item.organizationId === company.id);
    return { ...saved, source: saved.source || link?.source || '', portfolio: saved.portfolio || link?.environment || '' };
  });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = setup.results.at(-1);
  const save = (value: typeof setup) => { saveMigrationSetup(company.id, value); setSetup(value); };
  const upload = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true); setError('');
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Maximum file size is 50 MB.');
      const raw: unknown = JSON.parse(await file.text());
      const result = validateMigrationPackage(raw, company.id, setup.asOf, file.name);
      save({ ...setup, status: result.errors.length ? 'Validation failed' : 'Validated — awaiting import', results: [...setup.results, result] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to validate file.'); }
    finally { setBusy(false); }
  };
  return <div className={embedded ? 'flex min-w-0 flex-col gap-6 font-montserrat text-[12px] text-[#10233A]' : 'flex min-h-screen flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px] font-montserrat text-[12px] text-[#10233A]'}>
    {!embedded && <><PageHeader title="Setup & integration" actions={<><PageActionButton onClick={onBack}>Back</PageActionButton>{onOpenCard && <PageActionButton onClick={onOpenCard}>Organization settings</PageActionButton>}</>} /><SystemBreadcrumb items={['Companies', company.name, 'Manage company', 'Setup & integration']} /></>}
    <section className="rounded-lg border border-[#D3E1EC] p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ClientField field={{ key: 'sourceSystem', label: 'Source system', type: 'select', value: setup.source, options: ['Rivilė', 'Other ERP', 'File'], strictOptions: true }} onChange={source => setSetup(current => ({ ...current, source }))} />
        <label className="space-y-2"><span className="block font-semibold">Portfolio / DB ID</span><input value={setup.portfolio} onChange={event => setSetup(current => ({ ...current, portfolio: event.target.value }))} className="h-[42px] w-full rounded-lg border border-[#D3E1EC] px-3 outline-none focus:border-[#007EA7]" /></label>
        <label className="space-y-2"><span className="block font-semibold">Migration date</span><input type="date" value={setup.asOf} onChange={event => setSetup(current => ({ ...current, asOf: event.target.value }))} className="h-[42px] w-full rounded-lg border border-[#D3E1EC] px-3 outline-none focus:border-[#007EA7]" /></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4"><p>Initial setup / Migration: <strong>{setup.status}</strong></p><PageActionButton disabled={!setup.source || !setup.portfolio.trim() || !setup.asOf} onClick={() => { try { save({ ...setup, status: setup.status === 'Not started' ? 'In progress' : setup.status }); setOpen(true); setError(''); } catch { setError('Unable to save setup.'); } }}>{setup.status === 'Not started' ? 'Start initial setup' : 'Continue initial setup'}</PageActionButton></div>
      <div className="mt-5 grid gap-4 border-t border-[#D3E1EC] pt-4 md:grid-cols-2"><div><p className="font-semibold">Last result / error</p><p className="mt-2 text-[#7288A3]">{latest ? latest.errors.length ? latest.errors[0] : 'Package validation passed. Import has not been executed.' : 'No migration run yet.'}</p>{latest && <p className="mt-1 text-[#7288A3]">{latest.at.slice(0, 10)} · {latest.fileName}</p>}</div><div><p className="font-semibold">ERP synchronization status</p><p className="mt-2 text-[#7288A3]">Not configured</p><p className="mt-1 text-[#7288A3]">Confirmed FH payments and settlements require an ERP connector to update debt balances. No results have been transmitted.</p></div></div>
    </section>
    <CompanySharePointSettings key={company.id} company={company} />
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {open && <section className="flex flex-col gap-5 rounded-lg border border-[#D3E1EC] p-5">
      <h3 className="text-[16px] font-semibold">Initial setup / Migration</h3>
      <p className="text-[#7288A3]">Phase I includes the datasets below. Closed multi-year history does not need to be migrated in full.</p>
      <table className="w-full text-left"><thead><tr><th className="px-3 py-2 font-medium">Dataset</th><th className="px-3 py-2 font-medium">Validated records</th></tr></thead><tbody>{MIGRATION_SCOPE.map((item, index) => <tr key={item.key} className={index % 2 === 0 ? 'bg-[#F8FDFF]' : ''}><td className="h-10 px-3">{item.label}</td><td className="px-3">{latest?.counts[item.key] ?? '—'}</td></tr>)}</tbody></table>
      <label className="cursor-pointer self-start rounded-md border-2 border-[#D3E1EC] px-3 py-2 font-semibold text-[#007EA7]">{busy ? 'Validating…' : 'Upload migration package'}<input aria-label="Upload migration package" type="file" accept=".json,application/json" disabled={busy} className="hidden" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <p className="text-[#7288A3]">JSON packages are validated only. Posting data into FH accounting modules and sending confirmed results to ERP requires configured import mappings and an ERP connector.</p>
      <details className="rounded-lg bg-[#F8FDFF] p-3"><summary className="cursor-pointer font-semibold">Package format</summary><p className="mt-3">Provide organizationId, asOf, data and controlTotals. Every dataset must be an array. Records require id; financial records require currency and amount (balance for receivables/payables), counterpartyId and, for partial payments, documentId. Control totals are grouped by dataset and currency.</p><pre className="mt-3 overflow-auto text-[11px]">{JSON.stringify({ organizationId: company.id, asOf: setup.asOf, data: Object.fromEntries(MIGRATION_SCOPE.map(item => [item.key, []])), controlTotals: { receivables: {}, payables: {}, partialPayments: {}, advances: {}, openingBalances: {} } }, null, 2)}</pre></details>
      {latest && <><h4 className="text-[14px] font-semibold">Validation errors ({latest.errors.length})</h4>{latest.errors.length ? <ul className="list-disc space-y-1 pl-5 text-red-600">{latest.errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : <p className="text-[#087A55]">No validation errors.</p>}<h4 className="text-[14px] font-semibold">Control totals</h4><div className="overflow-auto"><table className="w-full text-left"><thead><tr>{['Dataset', 'Currency', 'Source total', 'Package total', 'Result'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{latest.checks.map((check, index) => <tr key={index} className="odd:bg-[#F8FDFF]"><td className="p-3">{check.category}</td><td>{check.currency}</td><td>{check.expected}</td><td>{check.actual}</td><td className={check.passed ? 'text-[#087A55]' : 'text-red-600'}>{check.passed ? 'Matched' : 'Mismatch'}</td></tr>)}</tbody></table></div></>}
      {setup.results.length > 0 && <details><summary className="cursor-pointer font-semibold">Validation history ({setup.results.length})</summary>{[...setup.results].reverse().map(result => <p key={result.id} className="mt-2">{result.at.slice(0, 10)} · {result.fileName} · {result.errors.length ? result.errors.length + ' errors' : 'Validated'}</p>)}</details>}
    </section>}
  </div>;
}
