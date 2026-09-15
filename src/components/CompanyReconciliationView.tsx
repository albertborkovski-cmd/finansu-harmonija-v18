import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eye, Link2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { PageActionButton, PageHeader } from './PageHeader';
import CompanyBreadcrumb from './CompanyBreadcrumb';
import type { ColConfig } from './ColumnSettingsPanel';
import ReconciliationTable, { type ReconciliationTableRow } from './ReconciliationTable';
import { ReconciliationConfirmationDialog, ReconciliationDialog, ReconciliationRulesDialog } from './ReconciliationDialogs';
import ReconciliationMatchDialog from './ReconciliationMatchDialog';
import { applyReconciliation, parseReconciliationState, DEFAULT_RECONCILIATION_RULES, reverseReconciliation, suggestReconciliation, type ReconciliationBatch, type ReconciliationItem, type ReconciliationProposal, type ReconciliationState, type ReconciliationSuggestions } from '../lib/reconciliation';
import { getCurrentUserName } from '../lib/currentUser';
import { createReconciliationExamples, getReconciliationItemStatus } from '../lib/reconciliationExamples';
import RelatedObjectPreview from './RelatedObjectPreview';

const number = (minor: number) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
const column = (key: string, label: string, width: number, visible = true): ColConfig => ({ key, label, width, visible });
const OPEN_COLUMNS = [
  column('documentNumber', 'Document', 150), column('counterparty', 'Counterparty', 145),
  column('currency', 'Currency', 88), column('original', 'Amount', 105),
  column('settled', 'Settled', 115), column('remaining', 'Balance', 115),
  column('status', 'Status', 155), column('kind', 'Type', 110, false),
  column('side', 'Side', 120, false), column('dueDate', 'Due date', 120, false),
  column('reference', 'Reference', 200, false), column('documentDate', 'Document date', 130, false),
  column('reason', 'Matching result', 320, false),
];
const PROPOSAL_COLUMNS = [column('counterparty', 'Counterparty', 160), column('funding', 'Payment / credit', 150), column('invoices', 'Invoice(s)', 160), column('currency', 'Currency', 95), column('amount', 'Match amount', 135), column('confidence', 'Confidence', 145), column('rule', 'Rule', 175, false), column('reason', 'Reason', 310, false)];
const HISTORY_COLUMNS = [column('at', 'Confirmed at', 180), column('actor', 'User', 180), column('documents', 'Documents', 250), column('amounts', 'Reconciled amount', 180), column('status', 'Status', 105), column('reversedAt', 'Reversed at', 180, false)];
const EMPTY_SUGGESTIONS: ReconciliationSuggestions = { proposals: [], unmatched: [] };
type Tab = 'All items' | 'Open items' | 'Suggestions' | 'History';
const STATUS_ORDER = ['Reconciled', 'Not reconciled', 'Suggested', 'Partially reconciled', 'Needs review', 'Reversed'] as const;
const STATUS_COLORS: Record<string, string> = {
  Reconciled: '#16A085', 'Partially reconciled': '#E3A008', Suggested: '#007EA7',
  'Needs review': '#E76F2E', 'Not reconciled': '#8AA1B7', Reversed: '#8B6BB1',
};
function StatusLabel({ status }: { status: string }) {
  return <span className="inline-flex max-w-full items-center gap-2 align-middle">
    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] ?? '#8AA1B7' }} />
    <span className="truncate">{status}</span>
  </span>;
}
function suggestionsFor(state: ReconciliationState, rules = DEFAULT_RECONCILIATION_RULES) {
  return suggestReconciliation(state.items.filter((item) => item.remainingMinor > 0), rules);
}

function loadTestState(companyId: string, raw: string | null): ReconciliationState {
  if (!raw) return createReconciliationExamples(companyId);
  return parseReconciliationState(raw, companyId);
}
function batchAmounts(batch: ReconciliationBatch, items: Map<string, ReconciliationItem>) {
  const totals = new Map<string, number>();
  for (const allocation of batch.allocations) {
    const currency = items.get(allocation.invoiceId)?.currency ?? 'EUR';
    totals.set(currency, (totals.get(currency) ?? 0) + allocation.amountMinor);
  }
  return [...totals].map(([currency, amount]) => number(amount) + ' ' + currency).join(' · ');
}

export default function CompanyReconciliationView({ companyId, companyName, initialRecordId, onRelatedObjectBack }: { companyId: string; companyName: string; initialRecordId?: string; onRelatedObjectBack?: () => void }) {
  const [relatedObjectClosed, setRelatedObjectClosed] = useState(false);
  const storageKey = 'finansu-harmonija:v15:reconciliation-examples-v2:' + companyId;
  const [initial] = useState(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(storageKey); return { raw, state: loadTestState(companyId, raw), error: '' }; }
    catch (error) { return { raw, state: createReconciliationExamples(companyId), error: error instanceof Error ? error.message : 'Test storage could not be read.' }; }
  });
  const [state, setState] = useState(initial.state);
  const baseline = useRef(initial.raw);
  const storageBlocked = useRef(Boolean(initial.error));
  const mutationLock = useRef(false);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('All items');
  const [rules, setRules] = useState(DEFAULT_RECONCILIATION_RULES);
  const [suggestions, setSuggestions] = useState<ReconciliationSuggestions>(() => suggestionsFor(initial.state));
  const [generation, setGeneration] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [manualItem, setManualItem] = useState<ReconciliationItem | null>(null);
  const [confirmation, setConfirmation] = useState<ReconciliationProposal[] | null>(null);
  const [batchReview, setBatchReview] = useState<ReconciliationBatch | null>(null);
  const [undoBatch, setUndoBatch] = useState<ReconciliationBatch | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const itemMap = useMemo(() => new Map(state.items.map((item) => [item.id, item])), [state.items]);
  const openItems = state.items.filter((item) => item.remainingMinor > 0);
  const refreshSuggestions = (next: ReconciliationState) => { setSuggestions(suggestionsFor(next, rules)); setConfirmation(null); setGeneration((value) => value + 1); };
  const refresh = () => {
    try { const raw = localStorage.getItem(storageKey); baseline.current = raw; const next = loadTestState(companyId, raw); storageBlocked.current = false; setState(next); refreshSuggestions(next); setError(''); setNotice('Test data refreshed. Suggestions reflect the current open balances.'); }
    catch (cause) { storageBlocked.current = true; setError(cause instanceof Error ? cause.message : 'Could not load test data.'); }
  };
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      baseline.current = event.newValue;
      setResetOpen(false); setConfirmation(null); setManualItem(null); setUndoBatch(null); setBatchReview(null);
      try {
        const next = loadTestState(companyId, event.newValue);
        setState(next); storageBlocked.current = false;
        setSuggestions(suggestionsFor(next, rules)); setConfirmation(null); setManualItem(null); setUndoBatch(null); setBatchReview(null);
        setGeneration((value) => value + 1); setNotice('Test data changed in another tab. Review fresh proposals before confirming.');
      } catch { storageBlocked.current = true; setSuggestions(EMPTY_SUGGESTIONS); setError('Test data changed in another tab and could not be loaded. Refresh or reset the demo.'); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [companyId, storageKey, rules]);
  const saveTestState = (next: ReconciliationState, resetting = false) => {
    if (storageBlocked.current && !resetting) throw new Error('Stored test data could not be loaded. Reset the demo before confirming new matches.');
    if (localStorage.getItem(storageKey) !== baseline.current) throw new Error('Test balances changed in another tab. Refresh and run Auto match again. Nothing was applied.');
    const raw = JSON.stringify(next); localStorage.setItem(storageKey, raw); baseline.current = raw; storageBlocked.current = false; setState(next);
  };
  const mutate = (action: () => void) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setError('');
    try { action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation could not be saved. Nothing was applied.'); }
    finally { mutationLock.current = false; setBusy(false); }
  };
  const runMatching = (ids: string[]) => {
    const selected = new Set(ids);
    const scopedItems = state.items.filter((item) => selected.has(item.id) && item.remainingMinor > 0);
    const next = suggestReconciliation(scopedItems, rules);
    setSuggestions(next); setGeneration((value) => value + 1); setError('');
    setNotice('Checked ' + scopedItems.length + ' filtered or selected open items. ' + next.proposals.length + ' proposal(s) found; ' + next.unmatched.length + ' item(s) require a manual check. High-confidence proposals are preselected; no balances have changed.');
    setTab(next.proposals.length ? 'Suggestions' : 'Open items');
  };
  const applySelected = () => {
    if (!confirmation?.length) return;
    mutate(() => {
      const next = applyReconciliation(state, confirmation, { id: crypto.randomUUID(), at: new Date().toISOString(), actor: getCurrentUserName() || 'Test user' });
      saveTestState(next); refreshSuggestions(next); setTab('History');
      setNotice(confirmation.length + ' test proposal(s) confirmed. Remaining balances were updated in this demo only. You can reverse the batch below.');
    });
  };
  const reconcileSelectedItems = (proposals: ReconciliationProposal[]) => {
    if (!proposals.length) return;
    mutate(() => {
      const next = applyReconciliation(state, proposals, { id: crypto.randomUUID(), at: new Date().toISOString(), actor: getCurrentUserName() || 'Test user' });
      saveTestState(next); refreshSuggestions(next); setManualItem(null);
      setNotice('Selected records reconciled. Open balances and history were updated in this test dataset only.');
    });
  };
  const openItemDetails = (item: ReconciliationItem) => {
    setError('');
    if (item.remainingMinor === 0) {
      const latestBatch = [...state.batches].reverse().find((batch) => !batch.reversedAt && batch.allocations.some((allocation) => allocation.invoiceId === item.id || allocation.fundingId === item.id));
      if (latestBatch) { setBatchReview(latestBatch); return; }
    }
    setManualItem(item);
  };
  const allRows: ReconciliationTableRow[] = state.items.map((item) => {
    const proposal = suggestions.proposals.find((entry) => entry.fundingId === item.id || entry.allocations.some((allocation) => allocation.invoiceId === item.id));
    const status = getReconciliationItemStatus(item, state, suggestions);
    const reason = proposal?.reason ?? suggestions.unmatched.find((entry) => entry.itemId === item.id)?.reason ?? (status === 'Reconciled' ? 'The full amount is settled. Open the record to see its reconciliation history.' : 'Review the record to select a matching item manually.');
    return {
      id: item.id, selectable: item.remainingMinor > 0,
      values: {
        counterparty: item.counterpartyName, documentNumber: item.documentNumber, kind: item.kind,
        side: item.side, dueDate: item.dueDate || '—', documentDate: item.documentDate,
        currency: item.currency, original: item.originalMinor, settled: item.originalMinor - item.remainingMinor,
        remaining: item.remainingMinor, status, reference: item.reference || '—', reason,
      },
      display: {
        original: number(item.originalMinor), settled: number(item.originalMinor - item.remainingMinor),
        remaining: number(item.remainingMinor),
        status: proposal && (status === 'Suggested' || status === 'Needs review')
          ? <button type="button" className="max-w-full text-left" title="Review suggested reconciliation" onClick={() => { setError(''); setConfirmation([proposal]); }}><StatusLabel status={status} /></button>
          : <StatusLabel status={status} />,
        documentNumber: <button type="button" className="text-[#007EA7]" onClick={() => openItemDetails(item)}>{item.documentNumber}</button>,
      },
      actions: item.remainingMinor > 0
        ? <button type="button" aria-label={'Match ' + item.documentNumber} title="Choose records to reconcile" className="inline-flex h-7 items-center gap-1 rounded border border-[#D3E1EC] bg-white px-2 text-[12px] font-medium text-[#7288A3] hover:border-[#A1B6C6] active:border-[#007EA7] active:bg-[#007EA7] active:text-white" onClick={() => openItemDetails(item)}><Link2 size={13} />Match</button>
        : <button type="button" aria-label={'Review ' + item.documentNumber} title="View reconciliation history" className="text-[#7288A3] hover:text-[#007EA7]" onClick={() => openItemDetails(item)}><Eye size={16} /></button>,
    };
  });
  // Put one representative of each state first in the example overview.
  // User-selected sorting still takes precedence in the table.
  const representatives = STATUS_ORDER.flatMap((status) => {
    const row = allRows.find((entry) => entry.values.status === status);
    return row ? [row] : [];
  });
  const representativeIds = new Set(representatives.map((row) => row.id));
  const exampleRows = [...representatives, ...allRows.filter((row) => !representativeIds.has(row.id))];
  const openRows = allRows.filter((row) => itemMap.get(row.id)!.remainingMinor > 0);
  const proposalRows: ReconciliationTableRow[] = suggestions.proposals.map((proposal) => {
    const funding = itemMap.get(proposal.fundingId)!;
    const amount = proposal.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    return { id: proposal.id, values: { counterparty: funding.counterpartyName, funding: funding.documentNumber, invoices: proposal.allocations.map((entry) => itemMap.get(entry.invoiceId)?.documentNumber).join(', '), currency: funding.currency, amount, confidence: proposal.confidence, rule: proposal.rule, reason: proposal.reason }, display: { amount: number(amount), confidence: <span className={'inline-flex items-center gap-1.5 ' + (proposal.confidence === 'High' ? 'text-[#007EA7]' : 'text-[#9A6500]')}><span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (proposal.confidence === 'High' ? 'bg-[#0DB89A]' : 'bg-[#E3A008]')} />{proposal.confidence}</span> }, actions: <button type="button" aria-label={'Review proposal for ' + funding.documentNumber} title="Review proposal" className="text-[#7288A3] hover:text-[#007EA7]" onClick={() => { setError(''); setConfirmation([proposal]); }}><Eye size={16} /></button> };
  });
  const historyRows: ReconciliationTableRow[] = [...state.batches].reverse().map((batch) => ({ id: batch.id, values: { at: batch.at.replace('T', ' ').slice(0, 19) + ' UTC', actor: batch.actor, documents: [...new Set(batch.allocations.flatMap((allocation) => [itemMap.get(allocation.fundingId)?.documentNumber, itemMap.get(allocation.invoiceId)?.documentNumber]))].join(', '), amounts: batchAmounts(batch, itemMap), status: batch.reversedAt ? 'Reversed' : 'Applied', reversedAt: batch.reversedAt?.replace('T', ' ').slice(0, 19) ?? '—' }, actions: <><button type="button" aria-label={'Review batch ' + batch.id} title="View batch" className="text-[#7288A3] hover:text-[#007EA7]" onClick={() => setBatchReview(batch)}><Eye size={16} /></button>{!batch.reversedAt && <button type="button" aria-label={'Reverse batch ' + batch.id} title="Reverse test reconciliation" className="text-[#7288A3] hover:text-[#007EA7]" onClick={() => { setError(''); setUndoBatch(batch); }}><RotateCcw size={16} /></button>}</> }));
  const tabCounts: Record<Tab, number> = {
    'All items': state.items.length, 'Open items': openItems.length,
    Suggestions: suggestions.proposals.length, History: state.batches.length,
  };
  const itemTab = tab === 'All items' || tab === 'Open items';
  const tableRows = tab === 'All items' ? exampleRows : tab === 'Open items' ? openRows : tab === 'Suggestions' ? proposalRows : historyRows;

  if (initialRecordId && !relatedObjectClosed) {
    const item = itemMap.get(initialRecordId);
    const batch = state.batches.find(record => record.id === initialRecordId);
    const fields = item ? [
      { label: 'Document', value: item.documentNumber },
      { label: 'Counterparty', value: item.counterpartyName },
      { label: 'Type', value: item.kind },
      { label: 'Side', value: item.side },
      { label: 'Document date', value: item.documentDate },
      { label: 'Due date', value: item.dueDate },
      { label: 'Currency', value: item.currency },
      { label: 'Amount', value: number(item.originalMinor) },
      { label: 'Settled', value: number(item.originalMinor - item.remainingMinor) },
      { label: 'Balance', value: number(item.remainingMinor) },
      { label: 'Status', value: getReconciliationItemStatus(item, state, suggestions) },
      { label: 'Reference', value: item.reference },
    ] : batch ? [
      { label: 'ID', value: batch.id },
      { label: 'Confirmed at', value: batch.at.replace('T', ' ') },
      { label: 'User', value: batch.actor },
      { label: 'Status', value: batch.reversedAt ? 'Reversed' : 'Applied' },
      { label: 'Reconciled amount', value: batchAmounts(batch, itemMap) },
      { label: 'Reversed at', value: batch.reversedAt },
      { label: 'Allocations', value: batch.allocations.map(allocation => `${itemMap.get(allocation.fundingId)?.documentNumber ?? allocation.fundingId} → ${itemMap.get(allocation.invoiceId)?.documentNumber ?? allocation.invoiceId}: ${number(allocation.amountMinor)} ${itemMap.get(allocation.invoiceId)?.currency ?? ''}`).join('\n') },
    ] : [];
    return <RelatedObjectPreview companyName={companyName} section="Reconciliation" title={item ? `Reconciliation · ${item.documentNumber}` : 'Reconciliation'} fields={fields}
      unavailable={!item && !batch} onBack={onRelatedObjectBack ?? (() => setRelatedObjectClosed(true))} />;
  }

  return <div className="relative flex min-h-full min-w-0 flex-col gap-3 bg-white px-4 py-10 font-montserrat text-[#10233A] sm:px-8 lg:px-[56px]">
    <PageHeader title="Reconciliation" actions={<>
      <PageActionButton icon={<SlidersHorizontal size={15} />} onClick={() => setRulesOpen(true)}>Matching rules</PageActionButton>
      <PageActionButton onClick={() => { setError(''); setResetOpen(true); }}>Reset examples</PageActionButton>
    </>} />
    <CompanyBreadcrumb companyName={companyName} items={['Reconciliation']} />
    <div className="flex items-start gap-2 rounded-lg border border-[#D3E1EC] bg-[#F6FBFD] px-3 py-2 text-[12px] leading-[18px]">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#007EA7]" />
      <div><strong className="font-semibold">Test mode · Reconciled, open and suggested examples</strong>
        <p className="text-[#7288A3]">Compare amounts, settled amounts and balances. Suggestions do not change balances until confirmed. Real accounting data is not affected.</p>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" aria-label="Reconciliation status counts">
      {STATUS_ORDER.map((status) => <div key={status} className="inline-flex items-center gap-1.5"><StatusLabel status={status} /><span className="tabular-nums text-[#7288A3]">{allRows.filter((row) => row.values.status === status).length}</span></div>)}
    </div>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    <div className="h-[18px] min-w-0 truncate text-[12px] leading-[18px] text-[#7288A3]" role="status" title={notice}>{notice}</div>
    <div role="tablist" aria-label="Reconciliation stages" className="flex gap-6 border-b border-[#E5EDF9]">
      {(['All items', 'Open items', 'Suggestions', 'History'] as Tab[]).map((name) => <button type="button" role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)} className={'border-b-2 pb-2 text-[14px] font-medium ' + (tab === name ? 'border-[#007EA7] text-[#007EA7]' : 'border-transparent text-[#10233A]')}>{name} <span className="ml-1 text-[12px] tabular-nums text-[#7288A3]">{tabCounts[name]}</span></button>)}
    </div>
    <ReconciliationTable
      key={companyId + ':' + tab + ':' + generation}
      scope={'reconciliation-examples-layout-v4:' + companyId + ':' + (itemTab ? 'items' : tab)}
      rows={tableRows}
      defaultColumns={itemTab ? OPEN_COLUMNS : tab === 'Suggestions' ? PROPOSAL_COLUMNS : HISTORY_COLUMNS}
      filterKeys={itemTab ? ['counterparty', 'kind', 'side', 'currency', 'status', 'dueDate'] : tab === 'Suggestions' ? ['counterparty', 'currency', 'confidence', 'rule'] : ['actor', 'status']}
      selectable={itemTab || tab === 'Suggestions'}
      initiallySelected={tab === 'Suggestions' ? suggestions.proposals.filter((proposal) => proposal.confidence === 'High').map((proposal) => proposal.id) : []}
      actionLabel={itemTab ? 'Auto match' : tab === 'Suggestions' ? 'Apply selected' : undefined}
      selectedOnlyAction={tab === 'Suggestions'}
      onAction={itemTab ? runMatching : (ids) => { setError(''); setConfirmation(suggestions.proposals.filter((proposal) => ids.includes(proposal.id))); }}
      onRefresh={refresh}
      emptyMessage={tab === 'Suggestions' ? 'No proposals. Open items → Auto match, or review an item to match manually.' : tab === 'History' ? 'No test reconciliation history.' : 'No records match the current filters.'}
    />
    {suggestions.unmatched.length > 0 && tab === 'Open items' && <details className="rounded-lg border border-[#D3E1EC] p-3 text-[12px]"><summary className="cursor-pointer font-medium">Unmatched items · {suggestions.unmatched.length}</summary><ul className="mt-3 space-y-2">{suggestions.unmatched.map((entry) => <li key={entry.itemId}><button type="button" className="mr-2 text-[#007EA7]" onClick={() => setManualItem(itemMap.get(entry.itemId) ?? null)}>{itemMap.get(entry.itemId)?.documentNumber ?? entry.itemId}</button>{entry.reason}</li>)}</ul></details>}
    {rulesOpen && <ReconciliationRulesDialog rules={rules} onSave={(next) => { setRules(next); setRulesOpen(false); setNotice('Matching rules updated for the next run. Existing test reconciliations are unchanged.'); }} onClose={() => setRulesOpen(false)} />}
    {manualItem && <ReconciliationMatchDialog item={manualItem} items={state.items} onClose={() => { setManualItem(null); setError(''); }} onConfirm={reconcileSelectedItems} error={error} busy={busy} />}
    {confirmation && <ReconciliationConfirmationDialog state={state} proposals={confirmation} onConfirm={applySelected} onClose={() => { setConfirmation(null); setError(''); }} error={error} busy={busy} />}
    {batchReview && <ReconciliationDialog title="Test reconciliation history" onClose={() => setBatchReview(null)}><div className="space-y-4 text-[13px]"><p>{batchReview.at.replace('T', ' ')} · {batchReview.actor}</p><p>{batchReview.reversedAt ? 'Reversed ' + batchReview.reversedAt : 'Applied'} · {batchAmounts(batchReview, itemMap)}</p>{batchReview.allocations.map((allocation, index) => <div key={index} className="rounded-lg bg-[#F6FBFD] p-3"><p>{itemMap.get(allocation.fundingId)?.documentNumber} → {itemMap.get(allocation.invoiceId)?.documentNumber}</p><p className="mt-1 font-semibold">{number(allocation.amountMinor)} {itemMap.get(allocation.invoiceId)?.currency}</p></div>)}<p className="text-[#7288A3]">Local test history only. No accounting journal or ERP posting.</p></div></ReconciliationDialog>}
    {undoBatch && <ReconciliationDialog title="Reverse test reconciliation" onClose={() => setUndoBatch(null)}><div className="space-y-4 text-[13px]"><p>Restore {batchAmounts(undoBatch, itemMap)} to the affected invoice and payment / credit balances? Other reconciliations stay unchanged. This batch remains in history as Reversed.</p>{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex justify-end gap-2"><PageActionButton onClick={() => setUndoBatch(null)}>Cancel</PageActionButton><PageActionButton disabled={busy} onClick={() => mutate(() => { const next = reverseReconciliation(state, undoBatch.id, new Date().toISOString()); saveTestState(next); setUndoBatch(null); refreshSuggestions(next); setNotice('Test reconciliation reversed. Its history was retained and the allocated balances were restored.'); })}>Reverse test reconciliation</PageActionButton></div></div></ReconciliationDialog>}
    {resetOpen && <ReconciliationDialog title="Reset reconciliation examples" onClose={() => setResetOpen(false)}><div className="space-y-4 text-[13px]"><p>Restore the prepared reconciliation examples and their sample history for {companyName}? This replaces only this example set. Real company data and the earlier test dataset are not affected.</p>{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex justify-end gap-2"><PageActionButton onClick={() => setResetOpen(false)}>Cancel</PageActionButton><PageActionButton disabled={busy} onClick={() => mutate(() => { const next = createReconciliationExamples(companyId); saveTestState(next, true); refreshSuggestions(next); setTab('All items'); setResetOpen(false); setNotice('Examples restored: reconciled, partially reconciled, suggested, needs review, open and reversed.'); })}>Reset examples</PageActionButton></div></div></ReconciliationDialog>}
  </div>;
}
