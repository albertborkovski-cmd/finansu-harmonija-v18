import { useId, useState, type ReactNode } from 'react';
import type { ReconciliationGlAssignment, ReconciliationItem } from '../lib/reconciliation';
import { PageActionButton } from './PageHeader';
import { ReconciliationDialog } from './ReconciliationDialogs';
import SearchableSelect from './SearchableSelect';

interface Props {
  item: ReconciliationItem;
  category: string;
  reason: string;
  accounts: { code: string; name: string }[];
  history: ReconciliationGlAssignment[];
  suggestedAccount?: string;
  onSave: (code: string, note: string) => void;
  onClose: () => void;
  error?: string;
  busy?: boolean;
  readOnly?: boolean;
}

function Detail({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={`min-w-0 ${wide ? 'col-span-full' : ''}`}>
    <dt className="text-[12px] leading-[18px] text-[#7288A3]">{label}</dt>
    <dd className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-[18px] text-[#10233A] [overflow-wrap:anywhere]">{children}</dd>
  </div>;
}

function assignmentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ReconciliationGlAccountDialog(props: Props) {
  // A changed payment or saved account starts a fresh draft, without an effect
  // that could overwrite edits during unrelated parent updates.
  return <GlAccountDraft key={`${props.item.id}:${props.item.glAccountCode ?? ''}`} {...props} />;
}

function GlAccountDraft({ item, category, reason, accounts, history, suggestedAccount, onSave, onClose, error, busy = false, readOnly = false }: Props) {
  const [accountCode, setAccountCode] = useState(item.glAccountCode ?? '');
  const [note, setNote] = useState('');
  const noteId = useId();
  const currentAccount = item.glAccountCode ?? '';
  const accountMap = new Map(accounts.filter(account => account.code.trim()).map(account => [account.code, account]));
  const options = [...accountMap.values()].map(account => ({ value: account.code, label: `${account.code} — ${account.name}` }));
  const canSave = !readOnly && !busy && Boolean(accountCode.trim()) && accountMap.has(accountCode) && accountCode !== currentAccount;
  const previousAccount = suggestedAccount && suggestedAccount !== currentAccount && accountMap.has(suggestedAccount) ? suggestedAccount : '';
  const assignedClient = Boolean(item.counterpartyId.trim() && item.counterpartyName.trim());
  const assignments = history.filter(assignment => assignment.itemId === item.id).slice().sort((left, right) => {
    const leftTime = Date.parse(left.at);
    const rightTime = Date.parse(right.at);
    if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
    if (!Number.isFinite(rightTime)) return -1;
    return rightTime - leftTime;
  });
  const accountLabel = (code: string) => code ? `${code}${accountMap.get(code)?.name ? ` — ${accountMap.get(code)!.name}` : ''}` : 'Not assigned';
  const close = () => { if (!busy) onClose(); };
  const save = () => { if (canSave) onSave(accountCode, note.trim()); };

  return <ReconciliationDialog title={readOnly ? 'View GL account' : 'Edit GL account'} onClose={close}>
    <div className="flex min-w-0 flex-col gap-4" aria-busy={busy}>
      <p className="text-[12px] leading-[18px] text-[#7288A3]">This test assignment does not post to the GL journal or ERP.</p>
      {readOnly ? <p className="rounded-lg border border-[#D3E1EC] px-3 py-2 text-[12px] leading-[18px] text-[#7288A3]">Your current role has read-only access to Companies. GL account changes require edit access.</p> : null}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border border-[#D3E1EC] bg-white p-4 sm:grid-cols-3" aria-label="Payment details">
        <Detail label="Document No.">{item.documentNumber || '—'}</Detail>
        <Detail label="Date">{item.documentDate || '—'}</Detail>
        <Detail label="Payee / payer">{item.payeeName?.trim() || item.counterpartyName.trim() || '—'}</Detail>
        <Detail label="Counterparty"><span className={`inline-block max-w-full rounded px-2 py-1 text-[12px] font-medium ${assignedClient ? 'bg-[#EAF8F2] text-[#087A55]' : 'bg-[#FFF8E5] text-[#9A6700]'}`}>{assignedClient ? item.counterpartyName : 'No counterparty assigned'}</span></Detail>
        <Detail label="Amount"><span className="tabular-nums">{(item.originalMinor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></Detail>
        <Detail label="Currency">{item.currency || '—'}</Detail>
        <Detail label="Category">{category || '—'}</Detail>
        <Detail label="Current GL account">{accountLabel(currentAccount)}</Detail>
        <Detail label="Reference" wide>{item.reference || '—'}</Detail>
      </dl>
      {reason ? <p className="whitespace-pre-wrap break-words text-[12px] leading-[18px] text-[#7288A3] [overflow-wrap:anywhere]">{reason}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1.5 text-[12px] font-medium leading-[18px]">GL account <span aria-hidden="true" className="text-[#D92D20]">*</span></div>
          <SearchableSelect value={accountCode} options={options} onChange={setAccountCode} ariaLabel="GL account (required)" placeholder="Search account code or name" disabled={readOnly || busy || options.length === 0} className="h-[42px] rounded-lg border border-[#D3E1EC] bg-white px-[14px] pr-9 text-[14px] font-medium text-[#10233A]" emptyMessage="No matching active accounts" />
          <p className="mt-1.5 text-[12px] leading-[18px] text-[#7288A3]">{options.length ? 'Select an active account from the chart of accounts.' : 'No active GL accounts are available. An account is required to save.'}</p>
          {previousAccount ? <div className="mt-2 flex flex-wrap items-center gap-2"><PageActionButton disabled={readOnly || busy} onClick={() => { if (!readOnly && !busy) setAccountCode(previousAccount); }}>Use previous account</PageActionButton><span className="min-w-0 break-words text-[12px] leading-[18px] text-[#7288A3]">{accountLabel(previousAccount)}</span></div> : null}
        </div>
        <div className="min-w-0">
          <label htmlFor={noteId} className="mb-1.5 block text-[12px] font-medium leading-[18px]">Note <span className="font-normal text-[#7288A3]">(optional)</span></label>
          <textarea id={noteId} value={note} onChange={event => setNote(event.target.value)} disabled={readOnly || busy} rows={3} placeholder="Add a reason for this assignment" className="min-h-[84px] w-full resize-y rounded-lg border border-[#D3E1EC] bg-white px-[14px] py-2 text-[12px] leading-[18px] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7] focus:ring-1 focus:ring-[#007EA7]/20 disabled:cursor-not-allowed disabled:bg-[#F3F6F8]" />
        </div>
      </div>
      <section aria-label="GL assignment history" className="border-t border-[#E5EDF9] pt-3">
        <h3 className="text-[14px] font-semibold leading-5">Assignment history <span className="ml-1 text-[12px] font-normal text-[#7288A3]">({assignments.length})</span></h3>
        {assignments.length ? <ol tabIndex={0} aria-label="Previous GL assignments" className="mt-2 max-h-[180px] overflow-y-auto rounded-lg border border-[#D3E1EC] px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007EA7]">
          {assignments.map(assignment => <li key={assignment.id} className="border-b border-[#E5EDF9] py-2.5 text-[12px] leading-[18px] last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><span className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{assignment.fromAccount || 'Not assigned'} <span aria-label="changed to">→</span> {assignment.toAccount}</span><span className="min-w-0 break-words text-[#7288A3]"><time dateTime={assignment.at}>{assignmentDate(assignment.at)}</time> · {assignment.actor}</span></div>
            {assignment.note?.trim() ? <p className="mt-1 whitespace-pre-wrap break-words text-[#7288A3] [overflow-wrap:anywhere]">{assignment.note}</p> : null}
          </li>)}
        </ol> : <p className="mt-2 text-[12px] leading-[18px] text-[#7288A3]">No GL assignments yet.</p>}
      </section>
      {error ? <p role="alert" className="rounded-lg border border-[#F5C2C2] bg-[#FFF0F0] px-3 py-2 text-[12px] leading-[18px] text-[#D92D20]">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-[#E5EDF9] pt-4"><PageActionButton disabled={busy} onClick={close}>Cancel</PageActionButton><PageActionButton disabled={!canSave} onClick={save}>{busy ? 'Saving…' : 'Save GL account'}</PageActionButton></div>
    </div>
  </ReconciliationDialog>;
}
