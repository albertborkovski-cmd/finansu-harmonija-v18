import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Eye, Link2, Pencil, RotateCcw, SlidersHorizontal } from 'lucide-react';
import ReconciliationDocumentPreview from './ReconciliationDocumentPreview';
import { reconciliationDocumentAmounts, reconciliationEntryCount, reconciliationPartners, reconciliationSuggestionAmounts } from '../lib/reconciliationPresentation';
import { prepareReconciliationCorrection, replaceReconciliation } from '../lib/reconciliationCorrection';
import { PageActionButton, PageHeader } from './PageHeader';
import CompanyBreadcrumb from './CompanyBreadcrumb';
import type { ColConfig } from './ColumnSettingsPanel';
import ReconciliationTable, { type ReconciliationTableRow } from './ReconciliationTable';
import { ReconciliationConfirmationDialog, ReconciliationDialog, ReconciliationRulesDialog } from './ReconciliationDialogs';
import ReconciliationMatchDialog from './ReconciliationMatchDialog';
import ReconciliationGlAccountDialog from './ReconciliationGlAccountDialog';
import GeneralLedgerAccountSelect from './GeneralLedgerAccountSelect';
import { loadCompanyGeneralLedgerAccountHierarchy } from './GeneralLedgerView';
import { suggestPreviousGlAccount } from '../lib/reconciliationGlSuggestions';
import { applyReconciliation, assignReconciliationGlAccount, getReconciliationRoute, hasReconciliationClient, isClientReconciliationItem, parseReconciliationState, DEFAULT_RECONCILIATION_RULES, reverseReconciliation, suggestReconciliation, type ReconciliationBatch, type ReconciliationItem, type ReconciliationProposal, type ReconciliationState, type ReconciliationSuggestions } from '../lib/reconciliation';
import { getCurrentUserName } from '../lib/currentUser';
import { augmentReconciliationExamples, createReconciliationExamples, getReconciliationItemStatus } from '../lib/reconciliationExamples';
import RelatedObjectPreview from './RelatedObjectPreview';

const number = (minor: number) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
const column = (key: string, label: string, width: number, visible = true): ColConfig => ({ key, label, width, visible });
const OPEN_COLUMNS = [
  column('documentNumber', 'Document No.', 150), column('counterparty', 'Counterparty', 200),
  column('kind', 'Type', 160), column('documentDate', 'Date', 120),
  column('dueDate', 'Payment date', 120), column('overdueDays', 'Overdue days', 110),
  column('currency', 'Currency', 88), column('debit', 'Debit in currency', 140),
  column('credit', 'Credit in currency', 140), column('remaining', 'Balance in currency', 150),
  column('original', 'Amount', 105, false), column('settled', 'Settled', 115, false),
  column('amount', 'Proposed amount', 140, false),
  column('status', 'Status', 155, false), column('side', 'Side', 120, false),
  column('reference', 'Reference', 200, false),
  column('reason', 'Matching result', 320, false),
  column('clientAssignment', 'Counterparty assignment', 150, false),
  column('category', 'Operation category', 165, false), column('glAccount', 'GL account', 170, false),
];
const ACCOUNTING_COLUMNS = [
  column('documentNumber', 'Document No.', 155),
  column('counterparty', 'Counterparty', 175), column('category', 'Operation category', 160),
  column('documentDate', 'Date', 115), column('currency', 'Currency', 88),
  column('original', 'Amount', 120), column('glAccount', 'GL account', 210),
  column('status', 'Status', 150), column('reference', 'Reference', 260, false),
  column('clientAssignment', 'Counterparty assignment', 150, false), column('reason', 'Reason', 320, false),
];
const PROPOSAL_COLUMNS = [column('counterparty', 'Counterparty', 160), column('funding', 'Payment / credit', 150), column('invoices', 'Invoice(s)', 160), column('currency', 'Currency', 95), column('amount', 'Match amount', 135), column('confidence', 'Confidence', 145), column('rule', 'Rule', 175, false), column('reason', 'Reason', 310, false)];
const HISTORY_COLUMNS = [column('at', 'Confirmed at', 180), column('actor', 'User', 180), column('documents', 'Documents', 250), column('amounts', 'Reconciled amount', 180), column('status', 'Status', 105), column('reversedAt', 'Reversed at', 180, false)];
const EMPTY_SUGGESTIONS: ReconciliationSuggestions = { proposals: [], unmatched: [] };
const ROW_ICON_BUTTON = 'flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]';
type Tab = 'All items' | 'Reconciled' | 'Suggestions' | 'Open items' | 'Accounting operations' | 'Advances & deposits' | 'History';
const STAGE_TABS: Tab[] = ['All items', 'Reconciled', 'Suggestions', 'Open items', 'Accounting operations', 'Advances & deposits', 'History'];
const ACCOUNTING_FILTERS = ['All operations', 'Without counterparty', 'Unidentified', 'Needs GL account', 'GL assigned'] as const;
type AccountingFilter = typeof ACCOUNTING_FILTERS[number];
const STATUS_ORDER = ['Reconciled', 'Not reconciled', 'Suggested', 'Partially reconciled', 'Needs review', 'Reversed'] as const;
const STATUS_COLORS: Record<string, string> = {
  Reconciled: '#16A085', 'Partially reconciled': '#E3A008', Suggested: '#007EA7',
  'Needs review': '#E76F2E', 'Not reconciled': '#8AA1B7', Reversed: '#8B6BB1',
  'GL assigned': '#16A085', 'Needs GL account': '#E3A008', Unidentified: '#E3A008',
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
  return augmentReconciliationExamples(parseReconciliationState(raw, companyId));
}
function batchAmounts(batch: ReconciliationBatch, items: Map<string, ReconciliationItem>) {
  const totals = new Map<string, number>();
  for (const allocation of batch.allocations) {
    const currency = items.get(allocation.invoiceId)?.currency ?? 'EUR';
    totals.set(currency, (totals.get(currency) ?? 0) + allocation.amountMinor);
  }
  return [...totals].map(([currency, amount]) => number(amount) + ' ' + currency).join(' · ');
}

export default function CompanyReconciliationView({ companyId, companyName, generalLedgerName, canEditGlAccounts = false, initialRecordId, onRelatedObjectBack }: { companyId: string; companyName: string; generalLedgerName?: string; canEditGlAccounts?: boolean; initialRecordId?: string; onRelatedObjectBack?: () => void }) {
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
  const [previewItem, setPreviewItem] = useState<ReconciliationItem | null>(null);
  const [accountingFilter, setAccountingFilter] = useState<AccountingFilter>('All operations');
  const [accountingItem, setAccountingItem] = useState<ReconciliationItem | null>(null);
  const [glAccounts, setGlAccounts] = useState(() => loadCompanyGeneralLedgerAccountHierarchy(companyId, generalLedgerName));
  const [rules, setRules] = useState(DEFAULT_RECONCILIATION_RULES);
  const [suggestions, setSuggestions] = useState<ReconciliationSuggestions>(() => suggestionsFor(initial.state));
  const [generation, setGeneration] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [manualItem, setManualItem] = useState<ReconciliationItem | null>(null);
  const [editingMatch, setEditingMatch] = useState<{ item: ReconciliationItem; items: ReconciliationItem[]; amounts: Record<string, number>; base: ReconciliationState; proposalId?: string } | null>(null);
  const [detailItem, setDetailItem] = useState<ReconciliationItem | null>(null);
  const [confirmation, setConfirmation] = useState<ReconciliationProposal[] | null>(null);
  const [batchReview, setBatchReview] = useState<ReconciliationBatch | null>(null);
  const [undoBatch, setUndoBatch] = useState<ReconciliationBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const itemMap = useMemo(() => new Map(state.items.map((item) => [item.id, item])), [state.items]);
  const clientUnmatched = suggestions.unmatched.filter(entry => {
    const item = itemMap.get(entry.itemId);
    return item && isClientReconciliationItem(item);
  });
  useEffect(() => {
    const refreshAccounts = () => setGlAccounts(loadCompanyGeneralLedgerAccountHierarchy(companyId, generalLedgerName));
    refreshAccounts();
    window.addEventListener('organization-reference-updated', refreshAccounts);
    window.addEventListener('storage', refreshAccounts);
    return () => {
      window.removeEventListener('organization-reference-updated', refreshAccounts);
      window.removeEventListener('storage', refreshAccounts);
    };
  }, [companyId, generalLedgerName]);
  const refreshSuggestions = (next: ReconciliationState) => { setSuggestions(suggestionsFor(next, rules)); setConfirmation(null); setGeneration((value) => value + 1); };
  const refresh = () => {
    setEditingMatch(null);
    try {
      const raw = localStorage.getItem(storageKey);
      const next = loadTestState(companyId, raw);
      baseline.current = raw; storageBlocked.current = false;
      setState(next); setSuggestions(suggestionsFor(next, rules)); setConfirmation(null);
      setError(''); setNotice('');
    }
    catch (cause) { storageBlocked.current = true; setError(cause instanceof Error ? cause.message : 'Could not load test data.'); }
  };
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setEditingMatch(null);
      baseline.current = event.newValue;
      setConfirmation(null); setManualItem(null); setAccountingItem(null); setUndoBatch(null); setBatchReview(null);
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
    const scopedItems = state.items.filter((item) => selected.has(item.id) && item.remainingMinor > 0 && isClientReconciliationItem(item));
    const next = suggestReconciliation(scopedItems, rules);
    setSuggestions(next); setGeneration((value) => value + 1); setError('');
    setNotice('Checked ' + scopedItems.length + ' filtered or selected open items. ' + next.proposals.length + ' proposal(s) found; ' + next.unmatched.length + ' item(s) require a manual check. High-confidence proposals are preselected; no balances have changed.');
    setTab(next.proposals.length ? 'Suggestions' : 'Open items');
  };
  const applySelected = () => {
    if (!confirmation?.length) return;
    mutate(() => {
      const next = applyReconciliation(state, confirmation, { id: crypto.randomUUID(), at: new Date().toISOString(), actor: getCurrentUserName() || 'Test user' });
      saveTestState(next); refreshSuggestions(next); setTab('Reconciled');
      setNotice(confirmation.length + ' test proposal(s) confirmed. Remaining balances were updated in this demo only. Use History to review or reverse the batch.');
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
    if (isClientReconciliationItem(item)) setDetailItem(item);
    else setAccountingItem(item);
  };
  const editSuggestion = (proposal: ReconciliationProposal) => {
    if (!canEditGlAccounts) return;
    const item = itemMap.get(proposal.fundingId);
    if (!item) return;
    setError('');
    setEditingMatch({ item, items: state.items, amounts: Object.fromEntries(proposal.allocations.map(a => [a.invoiceId, a.amountMinor])), base: state, proposalId: proposal.id });
  };
  const editReconciled = (item: ReconciliationItem) => {
    if (!canEditGlAccounts) return;
    setError('');
    try {
      const draft = prepareReconciliationCorrection(state, item.id, { id: crypto.randomUUID(), at: new Date().toISOString(), actor: getCurrentUserName() || 'Test user' });
      setDetailItem(null);
      setEditingMatch({ item: draft.state.items.find(row => row.id === item.id)!, items: draft.state.items, amounts: draft.amounts, base: state });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open reconciliation for editing.'); }
  };
  const saveEditedMatch = (proposals: ReconciliationProposal[]) => {
    if (!editingMatch || !canEditGlAccounts) return;
    mutate(() => {
      if (state !== editingMatch.base || localStorage.getItem(storageKey) !== baseline.current) throw new Error('Balances changed. Close and reopen the editor before saving.');
      if (editingMatch.proposalId) {
        // Validate the edited proposal without applying or persisting any balances.
        applyReconciliation(state, proposals, { id: crypto.randomUUID(), at: new Date().toISOString(), actor: getCurrentUserName() || 'Test user' });
        setSuggestions(previous => ({ ...previous, proposals: [...previous.proposals.filter(p => p.id !== editingMatch.proposalId), ...proposals] }));
        setGeneration(value => value + 1);
        setNotice('Suggestion updated. Balances stay unchanged until you apply it.');
      } else {
        const next = replaceReconciliation(state, editingMatch.item.id, proposals, { id: 'correction:' + crypto.randomUUID(), at: new Date().toISOString(), actor: getCurrentUserName() || 'Test user' });
        saveTestState(next); refreshSuggestions(next);
        setNotice('Reconciliation corrected. Previous links remain in History; unrelated allocations were kept.');
      }
      setEditingMatch(null);
    });
  };
  const saveGlAccount = (code: string, note: string, targetItem: ReconciliationItem | null = accountingItem) => {
    if (!targetItem || code === targetItem.glAccountCode) return;
    if (!canEditGlAccounts) { setError('Your current role does not allow GL account changes.'); return; }
    mutate(() => {
      const activeAccounts = loadCompanyGeneralLedgerAccountHierarchy(companyId, generalLedgerName);
      const next = assignReconciliationGlAccount(state, targetItem.id, code, activeAccounts.map(account => account.code), {
        id: crypto.randomUUID(), at: new Date().toISOString(), actor: getCurrentUserName() || 'Test user', note,
      });
      saveTestState(next);
      setGlAccounts(activeAccounts); setAccountingItem(null); setNotice('');
    });
  };
  const allRows: ReconciliationTableRow[] = state.items.map((item) => {
    const route = getReconciliationRoute(item);
    const clientAssigned = hasReconciliationClient(item);
    const accountingOperation = route.kind !== 'client';
    const account = glAccounts.find(entry => entry.code === item.glAccountCode);
    const glAccountLabel = item.glAccountCode ? item.glAccountCode + (account ? ' · ' + account.name : ' (inactive or unavailable)') : '—';
    const proposal = suggestions.proposals.find((entry) => entry.fundingId === item.id || entry.allocations.some((allocation) => allocation.invoiceId === item.id));
    const status = accountingOperation ? (item.glAccountCode ? 'GL assigned' : route.kind === 'unidentified' ? 'Unidentified' : 'Needs GL account') : getReconciliationItemStatus(item, state, suggestions);
    const amounts = reconciliationDocumentAmounts(item);
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const overdueDays = item.remainingMinor > 0 && item.dueDate ? Math.max(0, Math.floor((todayUtc - Date.parse(item.dueDate + 'T00:00:00Z')) / 86400000)) : 0;
    const kind = item.kind === 'Invoice' ? (item.side === 'Receivable' ? 'Sales invoice' : 'Purchase invoice') : item.kind === 'Payment' ? (item.side === 'Receivable' ? 'Bank receipt' : 'Bank payment') : item.kind;
    const reason = accountingOperation ? route.reason : proposal?.reason ?? suggestions.unmatched.find((entry) => entry.itemId === item.id)?.reason ?? (status === 'Reconciled' ? 'The full amount is settled. Open the record to see its reconciliation history.' : 'Review the record to select a matching item manually.');
    return {
      id: item.id, selectable: item.remainingMinor > 0 && !accountingOperation,
      values: {
        counterparty: clientAssigned ? item.counterpartyName : '—', documentNumber: item.documentNumber, kind,
        clientAssignment: clientAssigned ? 'Counterparty assigned' : 'No counterparty assigned',
        category: route.category, glAccount: glAccountLabel,
        overdueDays, debit: accountingOperation ? '—' : amounts.debitMinor, credit: accountingOperation ? '—' : amounts.creditMinor,
        side: item.side, dueDate: item.dueDate || '—', documentDate: item.documentDate,
        currency: item.currency, original: item.originalMinor, settled: amounts.settledMinor, amount: '—',
        remaining: accountingOperation ? '—' : amounts.balanceMinor, status, reference: item.reference || '—', reason,
      },
      display: {
        counterparty: <span className="inline-flex max-w-full items-center gap-2" title={clientAssigned ? 'Counterparty assigned · ' + item.counterpartyName : '—'}><span aria-hidden="true" className={'h-2 w-2 shrink-0 rounded-full ' + (clientAssigned ? 'bg-[#16A085]' : 'bg-[#E3A008]')} /><span className="truncate">{clientAssigned ? item.counterpartyName : '—'}</span></span>,
        glAccount: accountingOperation ? <GeneralLedgerAccountSelect value={item.glAccountCode ?? ''} companyId={companyId} generalLedgerName={generalLedgerName} compact borderless disabled={!canEditGlAccounts || busy} ariaLabel={`GL account for ${item.documentNumber}`} placeholder="Select GL account" onChange={code => saveGlAccount(code, '', item)} /> : '—',
        debit: accountingOperation ? <span title="Not applicable: accounting operation, not a counterparty debt settlement. See Amount and GL account." aria-label="Debit not applicable to debt settlement">—</span> : number(amounts.debitMinor), credit: accountingOperation ? <span title="Not applicable: accounting operation, not a counterparty debt settlement. See Amount and GL account." aria-label="Credit not applicable to debt settlement">—</span> : number(amounts.creditMinor),
        original: number(item.originalMinor), settled: number(amounts.settledMinor),
        remaining: accountingOperation ? <span title="Not applicable: this operation has no counterparty debt balance. See Amount and GL account." aria-label="Debt balance not applicable">—</span> : number(amounts.balanceMinor),
        status: proposal && (status === 'Suggested' || status === 'Needs review')
          ? <button type="button" className="max-w-full text-left" title="Review suggested reconciliation" onClick={() => { setError(''); setConfirmation([proposal]); }}><StatusLabel status={status} /></button>
          : <StatusLabel status={status} />,
        documentNumber: <button type="button" className="text-[#007EA7]" onClick={() => setPreviewItem(item)}>{item.documentNumber}</button>,
      },
      actions: accountingOperation
        ? <button type="button" aria-label={`Edit ${item.documentNumber}`} className="flex h-7 items-center justify-center gap-1.5 rounded border border-[#D3E1EC] bg-white px-2 text-[12px] font-medium leading-[18px] text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]" onClick={() => openItemDetails(item)}><Pencil size={14} />Edit</button>
        : <><button type="button" title="EDIT" aria-label={`Edit ${item.documentNumber}`} className={ROW_ICON_BUTTON} onClick={() => openItemDetails(item)}><Pencil size={14} /></button><button type="button" disabled={item.remainingMinor === 0} className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded border border-[#D3E1EC] bg-white px-2 text-[12px] font-medium leading-[18px] text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#D3E1EC] disabled:bg-[#F6F8FA] disabled:text-[#A1B6C6]" onClick={() => { setError(''); setManualItem(item); }}><Link2 size={14} />Reconcile</button></>,
    };
  });
  // Make the large choice-set examples immediately accessible, followed by
  // representatives of every state. User-selected sorting takes precedence.
  const choiceSetRows = ['sales-eur', 'purchases-eur', 'sales-usd', 'purchases-usd'].flatMap((key) =>
    ['invoice', 'payment'].flatMap((kind) => {
      const row = allRows.find((entry) => entry.id === `${companyId}:demo-expanded-v2:${key}:${kind}-100`);
      return row ? [row] : [];
    }));
  const representatives = STATUS_ORDER.flatMap((status) => {
    const row = allRows.find((entry) => entry.values.status === status);
    return row ? [row] : [];
  });
  const featuredRows = [...new Map([...choiceSetRows, ...representatives].map((row) => [row.id, row])).values()];
  const featuredIds = new Set(featuredRows.map((row) => row.id));
  const exampleRows = [...featuredRows, ...allRows.filter((row) => !featuredIds.has(row.id))];
  const openRows = exampleRows.filter((row) => itemMap.get(row.id)!.remainingMinor > 0 && isClientReconciliationItem(itemMap.get(row.id)!));
  const reconciledRows = exampleRows.filter((row) => itemMap.get(row.id)!.remainingMinor === 0 && isClientReconciliationItem(itemMap.get(row.id)!)).map(row => {
    const item = itemMap.get(row.id)!;
    const partners = reconciliationPartners(state, item.id);
    return { ...row, actions: <><button type="button" className={ROW_ICON_BUTTON} title="View document" aria-label={'View document ' + item.documentNumber} onClick={() => setPreviewItem(item)}><Eye size={14} /></button><button type="button" className={ROW_ICON_BUTTON + ' disabled:cursor-not-allowed disabled:opacity-40'} disabled={!canEditGlAccounts} title={canEditGlAccounts ? 'Edit reconciliation' : 'Companies edit access required'} aria-label={'Edit reconciliation ' + item.documentNumber} onClick={() => editReconciled(item)}><Pencil size={14} /></button></>, values: { ...row.values, matchedWith: partners.map(partner => partner.item.documentNumber).join(', ') }, display: { ...row.display,
      documentNumber: <div className="min-w-0"><button type="button" className="block max-w-full truncate text-left text-[12px] leading-[18px] text-[#007EA7]" onClick={() => setPreviewItem(item)}>{item.documentNumber}</button>{partners.length > 0 && <div className="flex min-w-0 items-center gap-1 text-[11px] leading-[14px] text-[#7288A3]"><span aria-hidden="true" className="shrink-0">↳</span><button type="button" className="min-w-0 truncate text-left hover:text-[#007EA7]" aria-label={`Reconciled with ${partners[0].item.documentNumber}`} title={`Reconciled with ${partners[0].item.documentNumber} · ${number(partners[0].amountMinor)} ${item.currency}`} onClick={() => setPreviewItem(partners[0].item)}>{partners[0].item.documentNumber}</button>{partners.length > 1 && <button type="button" className="shrink-0 text-[#007EA7]" aria-label={`View all ${partners.length} reconciled documents for ${item.documentNumber}`} title={partners.map(partner => `${partner.item.documentNumber} · ${number(partner.amountMinor)} ${item.currency}`).join('\n')} onClick={() => setPreviewItem(item)}>+{partners.length - 1}</button>}</div>}</div>,
    } };
  });
  const accountingRows = allRows.filter(row => !isClientReconciliationItem(itemMap.get(row.id)!));
  const filteredAccountingRows = accountingRows.filter(row => {
    const item = itemMap.get(row.id)!;
    if (accountingFilter === 'Without counterparty') return !hasReconciliationClient(item);
    if (accountingFilter === 'Unidentified') return getReconciliationRoute(item).kind === 'unidentified' && !item.glAccountCode;
    if (accountingFilter === 'Needs GL account') return !item.glAccountCode;
    if (accountingFilter === 'GL assigned') return Boolean(item.glAccountCode);
    return true;
  });
  const documentWithType = (item: ReconciliationItem) => {
    const type = item.kind === 'Invoice' ? (item.side === 'Receivable' ? 'Sales invoice' : 'Purchase invoice')
      : item.kind === 'Payment' ? (item.side === 'Receivable' ? 'Bank receipt' : 'Bank payment')
      : item.kind === 'Credit note' ? (item.side === 'Receivable' ? 'Sales credit note' : 'Purchase credit note') : item.kind;
    return <div className="min-w-0 leading-4"><div className="truncate" title={item.documentNumber}>{item.documentNumber}</div><div className="truncate text-[11px] leading-[14px] text-[#7288A3]" title={type}>{type}</div></div>;
  };
  const proposalRows: ReconciliationTableRow[] = suggestions.proposals.map((proposal) => {
    const funding = itemMap.get(proposal.fundingId)!;
    const amount = proposal.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    const invoices = proposal.allocations.map(entry => itemMap.get(entry.invoiceId)).filter((item): item is ReconciliationItem => Boolean(item));
    return { id: proposal.id, values: { counterparty: funding.counterpartyName, funding: funding.documentNumber, invoices: proposal.allocations.map((entry) => itemMap.get(entry.invoiceId)?.documentNumber).join(', '), currency: funding.currency, amount, confidence: proposal.confidence, rule: proposal.rule, reason: proposal.reason }, display: { funding: documentWithType(funding), invoices: <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1">{invoices[0] ? documentWithType(invoices[0]) : '—'}</div>{invoices.length > 1 && <button type="button" className="shrink-0 text-[11px] font-medium text-[#007EA7]" aria-label={`View ${invoices.length - 1} more documents`} title={invoices.slice(1).map(item => item.documentNumber).join(', ')} onClick={() => { setError(''); setConfirmation([proposal]); }}>+{invoices.length - 1}</button>}</div>, amount: number(amount), confidence: <span className={'inline-flex items-center gap-1.5 ' + (proposal.confidence === 'High' ? 'text-[#007EA7]' : 'text-[#9A6500]')}><span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (proposal.confidence === 'High' ? 'bg-[#0DB89A]' : 'bg-[#E3A008]')} />{proposal.confidence}</span> }, actions: <><button type="button" aria-label={'Review proposal for ' + funding.documentNumber} title="Review proposal" className={ROW_ICON_BUTTON} onClick={() => { setError(''); setConfirmation([proposal]); }}><Eye size={14} /></button><button type="button" aria-label={'Edit suggestion ' + funding.documentNumber} title={canEditGlAccounts ? 'Edit suggestion' : 'Companies edit access required'} className={ROW_ICON_BUTTON + ' disabled:cursor-not-allowed disabled:opacity-40'} disabled={!canEditGlAccounts} onClick={() => editSuggestion(proposal)}><Pencil size={14} /></button></> };
  });
  const historyRows: ReconciliationTableRow[] = [...state.batches].reverse().map((batch) => ({ id: batch.id, values: { at: batch.at.replace('T', ' ').slice(0, 19) + ' UTC', actor: batch.actor, documents: [...new Set(batch.allocations.flatMap((allocation) => [itemMap.get(allocation.fundingId)?.documentNumber, itemMap.get(allocation.invoiceId)?.documentNumber]))].join(', '), amounts: batchAmounts(batch, itemMap), status: batch.reversedAt ? 'Reversed' : 'Applied', reversedAt: batch.reversedAt?.replace('T', ' ').slice(0, 19) ?? '—' }, actions: <><button type="button" aria-label={'Review batch ' + batch.id} title="View batch" className="text-[#7288A3] hover:text-[#007EA7]" onClick={() => setBatchReview(batch)}><Eye size={16} /></button>{!batch.reversedAt && <button type="button" aria-label={'Reverse batch ' + batch.id} title="Reverse test reconciliation" className="text-[#7288A3] hover:text-[#007EA7]" onClick={() => { setError(''); setUndoBatch(batch); }}><RotateCcw size={16} /></button>}</> }));
  const suggestionSummaryRows: ReconciliationTableRow[] = suggestions.proposals.map(proposal => {
    const funding = itemMap.get(proposal.fundingId)!;
    const amounts = reconciliationSuggestionAmounts(funding, proposal);
    const fundingRow = allRows.find(row => row.id === funding.id)!;
    const balanceHint = `Current amounts of ${funding.documentNumber}. Proposed allocation: ${number(amounts.amount)} ${funding.currency}. Not applied to balances.`;
    const invoices = proposal.allocations.map(allocation => itemMap.get(allocation.invoiceId)?.documentNumber).join(', ');
    return { id: 'suggestion:' + proposal.id, selectable: false, values: { ...fundingRow.values, ...amounts, documentNumber: funding.documentNumber + ' → ' + invoices, kind: 'Reconciliation suggestion', status: 'Suggested', reason: proposal.reason + ' ' + balanceHint }, display: { ...fundingRow.display, documentNumber: <button type="button" className="text-[#007EA7]" title={balanceHint} onClick={() => setConfirmation([proposal])}>{funding.documentNumber} → {invoices}</button>, debit: <span title={balanceHint}>{number(amounts.debit)}</span>, credit: <span title={balanceHint}>{number(amounts.credit)}</span>, remaining: <span title={balanceHint}>{number(amounts.remaining)}</span>, amount: number(amounts.amount), status: <StatusLabel status="Suggested" /> }, actions: <button type="button" className={ROW_ICON_BUTTON} aria-label={'View suggestion ' + funding.documentNumber} onClick={() => setConfirmation([proposal])}><Eye size={14} /></button> };
  });
  const allEntryRows = [...exampleRows, ...suggestionSummaryRows];
  const prepaymentRows = allRows.filter(row => {
    const item = itemMap.get(row.id);
    return item?.kind === 'Advance' || item?.kind === 'Deposit';
  }).map(row => {
    const item = itemMap.get(row.id)!;
    return { ...row, actions: <>
      <button type="button" className={ROW_ICON_BUTTON} title="View document" aria-label={'View document ' + item.documentNumber} onClick={() => setPreviewItem(item)}><Eye size={14} /></button>
      <button type="button" disabled={item.remainingMinor === 0} className="flex h-7 shrink-0 items-center gap-1.5 rounded border border-[#D3E1EC] bg-white px-2 text-[12px] font-medium text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:bg-[#F6F8FA] disabled:text-[#A1B6C6]" onClick={() => { setError(''); setManualItem(item); }}><Link2 size={14} />Reconcile</button>
    </> };
  });
  const tabCounts: Record<Tab, number> = {
    'All items': reconciliationEntryCount(reconciledRows.length, openRows.length, accountingRows.length, proposalRows.length), Reconciled: reconciledRows.length, 'Open items': openRows.length,
    Suggestions: suggestions.proposals.length, 'Accounting operations': accountingRows.length, 'Advances & deposits': prepaymentRows.length, History: state.batches.length,
  };
  const itemTab = tab === 'All items' || tab === 'Open items' || tab === 'Reconciled' || tab === 'Advances & deposits';
  const canMatch = tab === 'All items' || tab === 'Open items';
  const outstanding = state.items.filter(item => item.remainingMinor > 0 && isClientReconciliationItem(item));
  const overviewGroups = [
    { label: 'Purchases', items: outstanding.filter(item => (item.kind === 'Invoice' || item.kind === 'Credit note') && item.side === 'Payable') },
    { label: 'Sales', items: outstanding.filter(item => (item.kind === 'Invoice' || item.kind === 'Credit note') && item.side === 'Receivable') },
    { label: 'Bank receipts', items: outstanding.filter(item => item.kind === 'Payment' && item.side === 'Receivable') },
    { label: 'Bank payments', items: outstanding.filter(item => item.kind === 'Payment' && item.side === 'Payable') },
    { label: 'Advances & deposits', items: outstanding.filter(item => item.kind === 'Advance' || item.kind === 'Deposit') },
  ];
  const tableRows = tab === 'All items' ? allEntryRows : tab === 'Reconciled' ? reconciledRows : tab === 'Open items' ? openRows : tab === 'Suggestions' ? proposalRows : tab === 'Accounting operations' ? filteredAccountingRows : tab === 'Advances & deposits' ? prepaymentRows : historyRows;

  if (initialRecordId && !relatedObjectClosed) {
    const item = itemMap.get(initialRecordId);
    const batch = state.batches.find(record => record.id === initialRecordId);
    const fields = item ? [
      { label: 'Document', value: item.documentNumber },
      { label: 'Counterparty', value: item.counterpartyName?.trim() || '—' },
      { label: 'Payee', value: item.payeeName?.trim() || item.counterpartyName?.trim() || '—' },
      { label: 'Operation category', value: getReconciliationRoute(item).category },
      { label: 'GL account', value: item.glAccountCode || '—' },
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
    </>} />
    <CompanyBreadcrumb companyName={companyName} items={['Reconciliation']} />
    <details aria-label="Reconciliation overview" className="group/overview rounded-lg border border-[#D3E1EC] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2 hover:bg-[#F8FDFF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007EA7] [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-[13px] font-semibold">Remaining to reconcile <span className="ml-2 text-[#007EA7]">{outstanding.length} records</span></span>
          <span className="text-[11px] text-[#7288A3]">Current open balances · amounts shown separately by currency</span>
        </div>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-[#7288A3] transition-transform group-open/overview:rotate-180" />
      </summary>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 lg:grid-cols-5">
        {overviewGroups.map(group => {
          const totals = new Map<string, number>();
          group.items.forEach(item => totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.remainingMinor));
          return <div key={group.label} className="min-w-0">
            <div className="text-[12px] text-[#7288A3]">{group.label}</div>
            <div className="mt-0.5 text-[18px] font-semibold leading-6 tabular-nums">{group.items.length}<span className="ml-1.5 text-[11px] font-normal text-[#7288A3]">open</span></div>
            <div className="text-[11px] leading-4 tabular-nums text-[#7288A3]">{totals.size ? [...totals].map(([currency, amount]) => <div key={currency}>{number(amount)} {currency}</div>) : '—'}</div>
          </div>;
        })}
      </div>
    </details>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    <div className={notice ? 'min-w-0 text-[12px] leading-[18px] text-[#7288A3]' : 'sr-only'} role="status">{notice}</div>
    <div role="tablist" aria-label="Reconciliation stages" className="mt-2 flex h-10 shrink-0 gap-6 overflow-x-auto border-b border-[#E5EDF9] scrollbar-hide">
      {STAGE_TABS.map((name) => <button type="button" role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)} className={'flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-2 text-[14px] font-medium transition-colors ' + (tab === name ? 'border-[#007EA7] text-[#007EA7]' : 'border-transparent text-[#10233A] hover:text-[#007EA7]')}>{name} <span className="text-[12px] tabular-nums text-[#7288A3]">{tabCounts[name]}</span></button>)}
    </div>
    <ReconciliationTable
      topFilters={tab === 'Accounting operations' ? <div role="group" aria-label="Accounting operation filters" className="flex flex-wrap gap-1">
        {ACCOUNTING_FILTERS.map(filter => <button key={filter} type="button" aria-pressed={accountingFilter === filter} onClick={() => setAccountingFilter(filter)} className={'h-7 rounded px-3 text-[12px] font-medium ' + (accountingFilter === filter ? 'bg-[#007EA7] text-white' : 'bg-[#E5EDF9] text-[#7288A3] hover:bg-[#DCE7F6]')}>{filter}</button>)}
      </div> : undefined}
      key={companyId + ':' + tab + ':' + generation}
      scope={'reconciliation-examples-layout-v5:' + companyId + ':' + (itemTab ? 'items' : tab)}
      rows={tableRows}
      defaultColumns={tab === 'Advances & deposits' ? OPEN_COLUMNS.map(column => column.key === 'kind' ? { ...column, label: 'Operation type' } : column) : itemTab ? OPEN_COLUMNS : tab === 'Suggestions' ? PROPOSAL_COLUMNS : tab === 'Accounting operations' ? ACCOUNTING_COLUMNS : HISTORY_COLUMNS}
      selectable={canMatch || tab === 'Suggestions'}
      initiallySelected={tab === 'Suggestions' ? suggestions.proposals.filter((proposal) => proposal.confidence === 'High').map((proposal) => proposal.id) : []}
      actionLabel={canMatch ? 'Auto match' : tab === 'Suggestions' ? 'Apply selected' : undefined}
      selectedOnlyAction={tab === 'Suggestions'}
      onAction={canMatch ? runMatching : (ids) => { setError(''); setConfirmation(suggestions.proposals.filter((proposal) => ids.includes(proposal.id))); }}
      onRefresh={refresh}
      onClearFilters={() => setAccountingFilter('All operations')}
      emptyMessage={tab === 'Suggestions' ? 'No proposals. Open items → Auto match, or review an item to match manually.' : tab === 'History' ? 'No test reconciliation history.' : 'No records match the current filters.'}
    />
    {clientUnmatched.length > 0 && tab === 'Open items' && <details className="rounded-lg border border-[#D3E1EC] p-3 text-[12px]"><summary className="cursor-pointer font-medium">Unmatched items · {clientUnmatched.length}</summary><ul className="mt-3 space-y-2">{clientUnmatched.map((entry) => <li key={entry.itemId}><button type="button" className="mr-2 text-[#007EA7]" onClick={() => setManualItem(itemMap.get(entry.itemId) ?? null)}>{itemMap.get(entry.itemId)?.documentNumber ?? entry.itemId}</button>{entry.reason}</li>)}</ul></details>}
    {rulesOpen && <ReconciliationRulesDialog rules={rules} onSave={(next) => { setRules(next); setRulesOpen(false); setNotice('Matching rules updated for the next run. Existing test reconciliations are unchanged.'); }} onClose={() => setRulesOpen(false)} />}
    {previewItem && ((tab === 'Reconciled' || tab === 'Advances & deposits') ? <ReconciliationConfirmationDialog state={state} proposals={[]} appliedItem={itemMap.get(previewItem.id) ?? previewItem} onConfirm={() => {}} onClose={() => setPreviewItem(null)} /> : <ReconciliationDocumentPreview item={itemMap.get(previewItem.id) ?? previewItem} state={state} companyName={companyName} onClose={() => setPreviewItem(null)} onOpen={setPreviewItem} />)}
    {accountingItem && <ReconciliationGlAccountDialog item={accountingItem} category={getReconciliationRoute(accountingItem).category} reason={getReconciliationRoute(accountingItem).reason} accounts={glAccounts} history={(state.glAssignments ?? []).filter(entry => entry.itemId === accountingItem.id)} suggestedAccount={suggestPreviousGlAccount(state.items, accountingItem, state.glAssignments ?? [], glAccounts.map(account => account.code))} onSave={saveGlAccount} onClose={() => { setAccountingItem(null); setError(''); }} error={error} busy={busy} readOnly={!canEditGlAccounts} />}
    {manualItem && <ReconciliationMatchDialog item={manualItem} items={state.items} onClose={() => { setManualItem(null); setError(''); }} onConfirm={reconcileSelectedItems} error={error} busy={busy} />}
    {editingMatch && <ReconciliationMatchDialog key={editingMatch.proposalId ?? editingMatch.item.id} item={editingMatch.item} items={editingMatch.items} initialAmounts={editingMatch.amounts} title={editingMatch.proposalId ? 'Edit suggestion · Select records' : 'Edit reconciliation · Select records'} confirmLabel={editingMatch.proposalId ? 'Save suggestion' : 'Save changes'} description={editingMatch.proposalId ? 'Change the selected documents or amounts. Saving this suggestion does not reconcile it.' : 'Change the selected documents or amounts. Save changes replaces this document’s active links and preserves their history. Cancel leaves all balances unchanged.'} onClose={() => { setEditingMatch(null); setError(''); }} onConfirm={saveEditedMatch} error={error} busy={busy} />}
    {detailItem && <ReconciliationDialog title={'Reconciliation · ' + detailItem.documentNumber} onClose={() => setDetailItem(null)}>
      <dl className="grid grid-cols-2 gap-4 text-[12px]">{[['Counterparty', detailItem.counterpartyName], ['Type', detailItem.kind], ['Date', detailItem.documentDate], ['Payment date', detailItem.dueDate || '—'], ['Currency', detailItem.currency], ['Amount', number(detailItem.originalMinor)], ['Settled', number(detailItem.originalMinor - detailItem.remainingMinor)], ['Balance', number(detailItem.remainingMinor)]].map(([label, value]) => <div key={label}><dt className="text-[#7288A3]">{label}</dt><dd className="mt-1">{value}</dd></div>)}</dl>
      <h3 className="mt-6 mb-3 text-[14px] font-semibold">Reconciliation history</h3>
      {state.batches.filter(batch => batch.allocations.some(allocation => allocation.invoiceId === detailItem.id || allocation.fundingId === detailItem.id)).map(batch => <button key={batch.id} type="button" className="mb-2 block w-full rounded-lg bg-[#F8FDFF] p-3 text-left text-[12px] text-[#007EA7]" onClick={() => setBatchReview(batch)}>{batch.at.slice(0, 10)} · {batch.actor} · {batchAmounts(batch, itemMap)} · {batch.reversedAt ? 'Reversed' : 'Applied'}</button>)}
      {!state.batches.some(batch => batch.allocations.some(allocation => allocation.invoiceId === detailItem.id || allocation.fundingId === detailItem.id)) && <p className="text-[12px] text-[#7288A3]">No reconciliations yet.</p>}
      <div className="mt-6 flex justify-end gap-2"><PageActionButton onClick={() => setDetailItem(null)}>Close</PageActionButton><PageActionButton disabled={detailItem.remainingMinor === 0} onClick={() => { setManualItem(detailItem); setDetailItem(null); }}>Reconcile</PageActionButton></div>
    </ReconciliationDialog>}
    {confirmation && <ReconciliationConfirmationDialog state={state} proposals={confirmation} onConfirm={applySelected} onClose={() => { setConfirmation(null); setError(''); }} error={error} busy={busy} />}
    {batchReview && <ReconciliationDialog title="Test reconciliation history" onClose={() => setBatchReview(null)}><div className="space-y-4 text-[13px]"><p>{batchReview.at.replace('T', ' ')} · {batchReview.actor}</p><p>{batchReview.reversedAt ? 'Reversed ' + batchReview.reversedAt : 'Applied'} · {batchAmounts(batchReview, itemMap)}</p>{batchReview.allocations.map((allocation, index) => <div key={index} className="rounded-lg bg-[#F6FBFD] p-3"><p>{itemMap.get(allocation.fundingId)?.documentNumber} → {itemMap.get(allocation.invoiceId)?.documentNumber}</p><p className="mt-1 font-semibold">{number(allocation.amountMinor)} {itemMap.get(allocation.invoiceId)?.currency}</p></div>)}<p className="text-[#7288A3]">Local test history only. No accounting journal or ERP posting.</p></div></ReconciliationDialog>}
    {undoBatch && <ReconciliationDialog title="Reverse test reconciliation" onClose={() => setUndoBatch(null)}><div className="space-y-4 text-[13px]"><p>Restore {batchAmounts(undoBatch, itemMap)} to the affected invoice and payment / credit balances? Other reconciliations stay unchanged. This batch remains in history as Reversed.</p>{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex justify-end gap-2"><PageActionButton onClick={() => setUndoBatch(null)}>Cancel</PageActionButton><PageActionButton disabled={busy} onClick={() => mutate(() => { const next = reverseReconciliation(state, undoBatch.id, new Date().toISOString()); saveTestState(next); setUndoBatch(null); refreshSuggestions(next); setNotice('Test reconciliation reversed. Its history was retained and the allocated balances were restored.'); })}>Reverse test reconciliation</PageActionButton></div></div></ReconciliationDialog>}
  </div>;
}
