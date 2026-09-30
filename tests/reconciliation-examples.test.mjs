import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function transpile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}

const toModuleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const engineUrl = toModuleUrl(transpile('../src/lib/reconciliation.ts'));
const engine = await import(engineUrl);
const manual = await import(toModuleUrl(transpile('../src/lib/manualReconciliation.ts').replace("from './reconciliation'", `from '${engineUrl}'`)));
const examplesSource = transpile('../src/lib/reconciliationExamples.ts').replace("from './reconciliation'", `from '${engineUrl}'`);
const { augmentReconciliationExamples, createReconciliationExamples, getReconciliationItemStatus } = await import(toModuleUrl(examplesSource));
const companyId = 'example-company';
const noSuggestions = { proposals: [], unmatched: [] };
const id = suffix => `${companyId}:demo-examples:${suffix}`;
const row = (state, suffix) => state.items.find(item => item.id === id(suffix));
const expandedId = suffix => `${companyId}:demo-expanded-v1:${suffix}`;
const expandedRow = (state, suffix) => state.items.find(item => item.id === expandedId(suffix));
const isExpanded = item => item.id.startsWith(expandedId(''));
const choiceId = suffix => `${companyId}:demo-expanded-v2:${suffix}`;
const choiceRow = (state, suffix) => state.items.find(item => item.id === choiceId(suffix));
const isChoice = item => item.id.startsWith(choiceId(''));
const depositId = suffix => `${companyId}:demo-expanded-v3:${suffix}`;
const isDepositExpansion = item => item.id.startsWith(depositId(''));
const accountingId = suffix => `${companyId}:demo-expanded-v4:${suffix}`;
const isAccountingExpansion = item => item.id.startsWith(accountingId(''));
const isCashExpansion = item => item.id.startsWith(`${companyId}:demo-cash-v1:`);
const isMissingDocumentExpansion = item => item.id.startsWith(`${companyId}:demo-missing-v1:`);
const choiceGroups = ['sales-eur', 'purchases-eur', 'sales-usd', 'purchases-usd'];
const legacyState = () => {
  const state = createReconciliationExamples(companyId);
  return { ...state, items: state.items.filter(item => !isExpanded(item) && !isChoice(item) && !isDepositExpansion(item) && !isAccountingExpansion(item)), batches: state.batches.filter(batch => !isExpanded(batch) && !isChoice(batch) && !isDepositExpansion(batch)) };
};

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('showcase is deterministic and preserves every original open-item fixture', () => {
  const state = createReconciliationExamples(companyId);
  assert.deepEqual(state, createReconciliationExamples(companyId));
  assert.equal(state.items.length, 425);
  assert.equal(state.items.filter(item => !isChoice(item) && !isDepositExpansion(item) && !isAccountingExpansion(item) && !isCashExpansion(item) && !isMissingDocumentExpansion(item)).length, 175);
  assert.equal(state.items.filter(isCashExpansion).length, 4);
  assert.equal(state.items.filter(isMissingDocumentExpansion).length, 3);
  assert.equal(state.batches.length, 13);
  assert.deepEqual(state.items.slice(0, 22), engine.createDemoReconciliationState(companyId).items);
  assert.equal(new Set(state.items.map(item => item.id)).size, state.items.length);
  assert.ok(state.batches.every(batch => batch.actor === 'Demo accountant'));
});

test('examples use real validated balances for full, partial, credit and reversed allocations', () => {
  const state = createReconciliationExamples(companyId);
  assert.equal(row(state, 'settled:invoice').remainingMinor, 0);
  assert.equal(row(state, 'settled:funding').remainingMinor, 0);
  assert.equal(row(state, 'partial:invoice').remainingMinor, 55000);
  assert.equal(row(state, 'partial:funding').remainingMinor, 30000);
  assert.equal(row(state, 'credited:invoice').remainingMinor, 0);
  assert.equal(row(state, 'credited:funding').kind, 'Credit note');
  assert.equal(row(state, 'credited:funding').remainingMinor, 0);
  assert.equal(row(state, 'reversed:invoice').remainingMinor, 36000);
  assert.equal(row(state, 'reversed:funding').remainingMinor, 36000);
  assert.equal(state.batches.filter(batch => batch.reversedAt).length, 2);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(state), companyId), state);
});

test('all seven current statuses are visible without applying or fabricating new data', () => {
  const state = createReconciliationExamples(companyId);
  const suggestions = engine.suggestReconciliation(state.items);
  const statuses = new Set(state.items.map(item => getReconciliationItemStatus(item, state, suggestions)));
  assert.deepEqual([...statuses].sort(), ['Reconciled', 'Partially reconciled', 'Suggested', 'Needs review', 'Not reconciled', 'Reversed', 'Missing document'].sort());
  assert.ok(state.items.filter(isMissingDocumentExpansion).every(item => getReconciliationItemStatus(item, state, suggestions) === 'Missing document'));
  const expected = [
    ['settled:invoice', 'Reconciled'],
    ['partial:invoice', 'Partially reconciled'],
    ['partial:funding', 'Partially reconciled'],
    ['reversed:invoice', 'Reversed'],
    ['credited:funding', 'Reconciled'],
  ];
  for (const [suffix, status] of expected) assert.equal(getReconciliationItemStatus(row(state, suffix), state, suggestions), status);
  assert.equal(getReconciliationItemStatus(state.items.find(item => item.id.endsWith(':payment-ambiguous')), state, suggestions), 'Needs review');
  assert.equal(getReconciliationItemStatus(state.items.find(item => item.id.endsWith(':invoice-unmatched')), state, suggestions), 'Not reconciled');
});

test('seeded active reconciliation can be reversed once while retaining its history', () => {
  const state = createReconciliationExamples(companyId);
  const undone = engine.reverseReconciliation(state, id('settled:batch'), '2026-09-14T12:00:00.000Z');
  assert.equal(row(undone, 'settled:invoice').remainingMinor, 125000);
  assert.equal(getReconciliationItemStatus(row(undone, 'settled:invoice'), undone, noSuggestions), 'Reversed');
  assert.equal(state.items.find(item => item.id === id('settled:invoice')).remainingMinor, 0);
  assert.equal(undone.batches.length, state.batches.length);
  assert.throws(() => engine.reverseReconciliation(undone, id('settled:batch'), '2026-09-14T13:00:00.000Z'), /already been reversed/);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(undone), companyId), undone);
});

test('a new confirmed reconciliation supersedes a prior reversal', () => {
  const state = createReconciliationExamples(companyId);
  const suggestions = engine.suggestReconciliation(state.items);
  const proposal = suggestions.proposals.find(entry => entry.fundingId === id('reversed:funding'));
  assert.ok(proposal);
  const applied = engine.applyReconciliation(state, [proposal], { id: id('reapply:batch'), at: '2026-09-14T12:00:00.000Z', actor: 'Test reviewer' });
  assert.equal(getReconciliationItemStatus(row(applied, 'reversed:invoice'), applied, engine.suggestReconciliation(applied.items)), 'Reconciled');
  assert.equal(applied.batches.length, state.batches.length + 1);
  assert.equal(applied.batches.filter(batch => batch.reversedAt).length, 2);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(applied), companyId), applied);
});

test('company-scoped fixtures and histories cannot be confused between organizations', () => {
  const first = createReconciliationExamples(companyId);
  const second = createReconciliationExamples('other-company');
  const ids = new Set(first.items.map(item => item.id));
  const batches = new Set(first.batches.map(batch => batch.id));
  assert.ok(second.items.every(item => !ids.has(item.id) && item.organizationId === 'other-company'));
  assert.ok(second.batches.every(batch => !batches.has(batch.id)));
  assert.throws(() => engine.parseReconciliationState(JSON.stringify(first), 'other-company'), /different organization/);
  assert.throws(() => createReconciliationExamples(''), /Organization ID is required/);
});

test('generic unmatched wording is not accidentally classified as ambiguity', () => {
  const state = createReconciliationExamples(companyId);
  const item = state.items.find(entry => entry.id.endsWith(':invoice-unmatched'));
  assert.equal(getReconciliationItemStatus(item, state, { proposals: [], unmatched: [{ itemId: item.id, reason: 'No unambiguous compatible funding was found.' }] }), 'Not reconciled');
  assert.equal(getReconciliationItemStatus(item, state, { proposals: [], unmatched: [{ itemId: item.id, reason: 'Competing funding records would over-allocate an invoice.' }] }), 'Needs review');
});

test('expanded ledger provides varied sales, purchases, bank lines, credits and advances', () => {
  const state = createReconciliationExamples(companyId);
  const expanded = state.items.filter(isExpanded);
  assert.equal(expanded.length, 145);
  assert.ok(expanded.filter(item => item.kind === 'Invoice' && item.side === 'Receivable').length >= 30);
  assert.ok(expanded.filter(item => item.kind === 'Invoice' && item.side === 'Payable').length >= 25);
  assert.ok(expanded.filter(item => item.kind === 'Payment').length >= 50);
  assert.ok(expanded.filter(item => item.kind === 'Credit note').length >= 5);
  assert.equal(expanded.filter(item => item.kind === 'Advance').length, 4);
  assert.deepEqual(new Set(expanded.map(item => item.currency)), new Set(['EUR', 'USD']));
  assert.ok(new Set(expanded.map(item => item.counterpartyId)).size >= 50);
  assert.ok(new Set(expanded.map(item => item.documentDate)).size >= 40);
  assert.ok(new Set(expanded.map(item => item.originalMinor)).size >= 70);
  assert.ok(expanded.every(item => Number.isSafeInteger(item.originalMinor) && item.originalMinor > 0));
});

test('new matching scenarios include safe splits, credits, partials, excess funds and intentional blockers', () => {
  const state = createReconciliationExamples(companyId);
  const suggestions = engine.suggestReconciliation(state.items);
  const proposalFor = suffix => suggestions.proposals.find(proposal => proposal.fundingId === expandedId(suffix));
  const reasonFor = suffix => suggestions.unmatched.find(entry => entry.itemId === expandedId(suffix))?.reason;
  assert.equal(proposalFor('exact-1:payment').confidence, 'High');
  assert.equal(proposalFor('unique-1:payment').rule, 'Unique amount');
  for (let number = 1; number <= 6; number += 1) {
    const proposal = proposalFor(`multi-${number}:payment`);
    assert.equal(proposal.allocations.length, 3);
    assert.equal(proposal.confidence, 'Review required');
    const funded = proposal.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    assert.ok(funded <= expandedRow(state, `multi-${number}:payment`).remainingMinor);
  }
  assert.equal(proposalFor('partial-2:payment').allocations[0].amountMinor, 34998);
  assert.equal(proposalFor('overpayment-1:payment').allocations[0].amountMinor, 89999);
  assert.equal(proposalFor('advance-2:advance').allocations[0].amountMinor, 980000);
  assert.ok(proposalFor('credit-and-bank-1:credit'));
  assert.ok(proposalFor('credit-and-bank-1:payment'));
  assert.match(reasonFor('ambiguous-amount-1:payment'), /Ambiguous amount/);
  assert.match(reasonFor('duplicate-reference-1:payment'), /Ambiguous reference/);
  assert.match(reasonFor('competing-1:payment-1'), /Competing/);
  assert.match(reasonFor('competing-1:payment-2'), /Competing/);
  assert.match(reasonFor('currency-mismatch-1:payment'), /different organization, counterparty, currency or side/);
  assert.match(reasonFor('bank-only-1:payment'), /No compatible invoice/);
});

test('all expanded historical balances are backed exactly by active engine allocations and can be reversed', () => {
  const state = createReconciliationExamples(companyId);
  const expanded = state.items.filter(isExpanded);
  const activeAmounts = new Map();
  for (const batch of state.batches.filter(batch => isExpanded(batch) && !batch.reversedAt)) {
    for (const allocation of batch.allocations) {
      for (const itemId of [allocation.invoiceId, allocation.fundingId]) {
        activeAmounts.set(itemId, (activeAmounts.get(itemId) ?? 0) + allocation.amountMinor);
      }
    }
  }
  for (const item of expanded) assert.equal(item.originalMinor - item.remainingMinor, activeAmounts.get(item.id) ?? 0, item.id);
  assert.equal(expandedRow(state, 'history-training:invoice').remainingMinor, 303750);
  assert.equal(expandedRow(state, 'history-training:payment').remainingMinor, 25000);
  assert.equal(expandedRow(state, 'history-overpayment:payment').remainingMinor, 10120);
  assert.equal(expandedRow(state, 'history-installments:invoice').remainingMinor, 0);
  assert.equal(expandedRow(state, 'history-reversed:invoice').remainingMinor, 66210);
  let reversed = state;
  for (const batch of state.batches.filter(batch => isExpanded(batch) && !batch.reversedAt)) {
    reversed = engine.reverseReconciliation(reversed, batch.id, '2026-09-16T15:00:00.000Z');
  }
  assert.ok(reversed.items.filter(isExpanded).every(item => item.remainingMinor === item.originalMinor));
  assert.deepEqual(reversed.items.filter(item => !isExpanded(item)), state.items.filter(item => !isExpanded(item)));
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(reversed), companyId), reversed);
});

test('expanded suggestions are valid together and applying/reversing does not change the original state', () => {
  const state = deepFreeze(createReconciliationExamples(companyId));
  const suggestions = engine.suggestReconciliation(state.items);
  const applied = engine.applyReconciliation(state, suggestions.proposals, { id: 'user-selected-all', at: '2026-09-16T12:00:00.000Z', actor: 'Test reviewer' });
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(applied), companyId), applied);
  const reversed = engine.reverseReconciliation(applied, 'user-selected-all', '2026-09-16T13:00:00.000Z');
  assert.deepEqual(reversed.items, state.items);
  assert.equal(reversed.batches.length, state.batches.length + 1);
});

test('augmentation adds only new fixtures without restoring deleted baseline rows or overwriting user history', () => {
  const old = legacyState();
  const deletedIds = new Set([`${companyId}:demo:invoice-unmatched`, `${companyId}:demo:payment-unmatched`]);
  const withoutDeleted = { ...old, items: old.items.filter(item => !deletedIds.has(item.id)) };
  const proposal = engine.suggestReconciliation(withoutDeleted.items).proposals.find(entry => entry.fundingId === `${companyId}:demo:payment-exact`);
  const userApplied = engine.applyReconciliation(withoutDeleted, [proposal], { id: 'user-before-upgrade', at: '2026-09-15T12:00:00.000Z', actor: 'User accountant' });
  const userEdited = engine.reverseReconciliation(userApplied, id('settled:batch'), '2026-09-15T13:00:00.000Z');
  const input = deepFreeze(engine.parseReconciliationState(JSON.stringify(userEdited), companyId));
  const augmented = augmentReconciliationExamples(input);
  assert.equal(augmented.items.length, input.items.length + 145 + 224 + 8 + 11);
  assert.equal(augmented.batches.length, input.batches.length + 9);
  assert.deepEqual(augmented.items.slice(0, input.items.length), input.items);
  assert.deepEqual(augmented.batches.slice(0, input.batches.length), input.batches);
  assert.ok(augmented.items.slice(0, input.items.length).every((item, index) => item === input.items[index]));
  assert.ok(augmented.batches.slice(0, input.batches.length).every((batch, index) => batch === input.batches[index]));
  assert.ok(augmented.items.every(item => !deletedIds.has(item.id)));
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(augmented), companyId), augmented);
  assert.strictEqual(augmentReconciliationExamples(augmented), augmented);
});

test('augmentation does not recreate deleted expansion items, reset reconciliations or duplicate history on reload', () => {
  const state = createReconciliationExamples(companyId);
  const proposal = engine.suggestReconciliation(state.items).proposals.find(entry => entry.fundingId === expandedId('exact-1:payment'));
  const applied = engine.applyReconciliation(state, [proposal], { id: 'user-expanded-apply', at: '2026-09-16T12:00:00.000Z', actor: 'User accountant' });
  const reversed = engine.reverseReconciliation(applied, expandedId('history-rent:batch'), '2026-09-16T13:00:00.000Z');
  const removedIds = new Set([expandedId('exact-2:invoice'), expandedId('exact-2:payment')]);
  const edited = { ...reversed, items: reversed.items.filter(item => !removedIds.has(item.id)) };
  const parsed = deepFreeze(engine.parseReconciliationState(JSON.stringify(edited), companyId));
  assert.strictEqual(augmentReconciliationExamples(parsed), parsed);
  assert.equal(parsed.items.find(item => item.id === expandedId('exact-1:invoice')).remainingMinor, 0);
  assert.equal(parsed.items.find(item => item.id === expandedId('history-rent:invoice')).remainingMinor, 186340);
  assert.ok(parsed.items.every(item => !removedIds.has(item.id)));
  const onlyOneExpansion = { ...legacyState(), items: [expandedRow(state, 'unpaid-1:invoice')], batches: [] };
  const withLaterExpansion = augmentReconciliationExamples(onlyOneExpansion);
  assert.equal(withLaterExpansion.items.length, 1 + 224 + 8 + 11 + 4 + 3);
  assert.deepEqual(withLaterExpansion.items.filter(isExpanded), onlyOneExpansion.items);
  assert.strictEqual(augmentReconciliationExamples(withLaterExpansion), withLaterExpansion);
});

test('augmentation never recreates the original showcase even when a parsed legacy state is empty', () => {
  const empty = engine.parseReconciliationState(JSON.stringify({ version: 1, organizationId: companyId, items: [], batches: [] }), companyId);
  const augmented = augmentReconciliationExamples(empty);
  assert.equal(augmented.items.length, 145 + 224 + 8 + 11 + 4 + 3);
  assert.equal(augmented.batches.length, 9);
  assert.ok(augmented.items.every(item => isExpanded(item) || isChoice(item) || isDepositExpansion(item) || isAccountingExpansion(item) || isCashExpansion(item) || isMissingDocumentExpansion(item)));
  assert.ok(augmented.batches.every(isExpanded));
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(augmented), companyId), augmented);
});

test('v2 provides four dense open ledgers with sales, purchases, EUR and USD choices', () => {
  const state = createReconciliationExamples(companyId);
  const added = state.items.filter(isChoice);
  assert.equal(added.length, 224);
  assert.equal(new Set(added.map(item => item.counterpartyId)).size, 4);
  assert.equal(new Set(added.map(item => item.documentNumber)).size, 224);
  assert.ok(new Set(added.map(item => item.originalMinor)).size >= 150);
  assert.ok(new Set(added.map(item => item.documentDate)).size >= 40);
  assert.ok(added.every(item => item.originalMinor === item.remainingMinor && item.remainingMinor > 0));
  for (const key of choiceGroups) {
    const group = added.filter(item => item.counterpartyId === choiceId(`counterparty:${key}`));
    assert.equal(group.length, 56, key);
    assert.equal(group.filter(item => item.kind === 'Invoice').length, 25, key);
    assert.equal(group.filter(item => item.kind === 'Payment').length, 25, key);
    assert.equal(group.filter(item => item.kind === 'Credit note').length, 3, key);
    assert.equal(group.filter(item => item.kind === 'Advance').length, 3, key);
    assert.ok(group.every(item => item.side === (key.startsWith('sales') ? 'Receivable' : 'Payable')), key);
    assert.ok(group.every(item => item.currency === (key.endsWith('eur') ? 'EUR' : 'USD')), key);
  }
});

test('v2 exposes opposite GL entries across counterparties, with 33 or 25 choices under the default counterparty filter', () => {
  const state = deepFreeze(createReconciliationExamples(companyId));
  const otherCompany = createReconciliationExamples('other-company');
  const mixedItems = [...state.items, ...otherCompany.items];
  for (const source of state.items.filter(isChoice)) {
    const allCandidates = manual.getManualReconciliationCandidates(mixedItems, source.id);
    assert.ok(allCandidates.some(item => item.counterpartyId !== source.counterpartyId));
    assert.ok(allCandidates.every(item => item.organizationId === source.organizationId
      && item.currency === source.currency
      && engine.getReconciliationEntrySide(item) !== engine.getReconciliationEntrySide(source)));
    const candidates = allCandidates.filter(item => item.counterpartyId === source.counterpartyId);
    assert.equal(candidates.length, source.kind === 'Invoice' ? 33 : 25, source.documentNumber);
    assert.ok(candidates.every(item => item.organizationId === source.organizationId
      && item.counterpartyId === source.counterpartyId
      && item.currency === source.currency
      && item.side === source.side
      && (item.kind === 'Invoice') !== (source.kind === 'Invoice')
      && item.remainingMinor > 0), source.documentNumber);
    if (source.kind === 'Invoice') {
      assert.equal(candidates.filter(item => item.kind === 'Payment' || item.kind === 'Advance').length, 28);
      assert.equal(candidates.filter(item => item.kind === 'Credit note').length, 3);
      assert.equal(candidates.filter(item => item.kind === 'Deposit').length, 2);
    }
  }
});

test('all eight large source records actually allocate the first 20 choices and apply/reverse safely', () => {
  const input = deepFreeze(createReconciliationExamples(companyId));
  for (const key of choiceGroups) {
    for (const kind of ['invoice', 'payment']) {
      const source = choiceRow(input, `${key}:${kind}-100`);
      const candidates = manual.getManualReconciliationCandidates(input.items, source.id).filter(item => item.counterpartyId === source.counterpartyId);
      const selected = candidates.slice(0, 20);
      const preview = manual.buildManualReconciliation(input.items, source.id, selected.map(item => item.id));
      assert.equal(preview.allocations.length, 20, source.documentNumber);
      assert.ok(preview.allocations.every(allocation => allocation.amountMinor > 0), source.documentNumber);
      assert.ok(preview.sourceRemainingMinor > 0, source.documentNumber);
      assert.equal(preview.totalMinor, selected.reduce((sum, item) => sum + item.remainingMinor, 0));
      assert.equal(preview.proposals.length, kind === 'invoice' ? 20 : 1);
      const batchId = `user-v2-${key}-${kind}-20`;
      const applied = engine.applyReconciliation(input, preview.proposals, { id: batchId, at: '2026-09-16T12:00:00.000Z', actor: 'Test reviewer' });
      const affected = new Set([source.id, ...selected.map(item => item.id)]);
      assert.equal(applied.batches.at(-1).allocations.length, 20);
      assert.equal(applied.items.find(item => item.id === source.id).remainingMinor, preview.sourceRemainingMinor);
      assert.ok(applied.items.filter(item => selected.some(candidate => candidate.id === item.id)).every(item => item.remainingMinor === 0));
      assert.deepEqual(applied.items.filter(item => !affected.has(item.id)), input.items.filter(item => !affected.has(item.id)));
      assert.deepEqual(applied.batches.slice(0, input.batches.length), input.batches);
      assert.deepEqual(engine.parseReconciliationState(JSON.stringify(applied), companyId), applied);
      const reversed = engine.reverseReconciliation(applied, batchId, '2026-09-16T13:00:00.000Z');
      assert.deepEqual(reversed.items, input.items);
      assert.deepEqual(engine.parseReconciliationState(JSON.stringify(reversed), companyId), reversed);
    }
  }
});

test('large invoice balances cover all 32 ordinary funding rows including credits, advances and deposits', () => {
  const state = createReconciliationExamples(companyId);
  for (const key of choiceGroups) {
    for (const kind of ['invoice', 'payment']) {
      const source = choiceRow(state, `${key}:${kind}-100`);
      const oppositeLargeId = choiceId(`${key}:${kind === 'invoice' ? 'payment' : 'invoice'}-100`);
      const candidates = manual.getManualReconciliationCandidates(state.items, source.id).filter(item => item.id !== oppositeLargeId && item.counterpartyId === source.counterpartyId);
      assert.equal(candidates.length, kind === 'invoice' ? 32 : 24);
      const preview = manual.buildManualReconciliation(state.items, source.id, candidates.map(item => item.id));
      assert.ok(preview.allocations.every(allocation => allocation.amountMinor > 0 && allocation.remainingMinor === 0));
      assert.ok(preview.sourceRemainingMinor > 0);
      const batchId = `user-v2-${key}-${kind}-all`;
      const applied = engine.applyReconciliation(state, preview.proposals, { id: batchId, at: '2026-09-16T12:00:00.000Z', actor: 'Test reviewer' });
      assert.equal(applied.batches.at(-1).allocations.length, candidates.length);
      assert.deepEqual(engine.reverseReconciliation(applied, batchId, '2026-09-16T13:00:00.000Z').items, state.items);
    }
  }
});

test('already-expanded v1 state receives later choices and deposits without restoring deleted rows or changing edits', () => {
  const current = createReconciliationExamples(companyId);
  const removed = new Set([expandedId('exact-2:invoice'), expandedId('exact-2:payment')]);
  const v1 = { ...current, items: current.items.filter(item => !isChoice(item) && !isDepositExpansion(item) && !removed.has(item.id)) };
  const proposal = engine.suggestReconciliation(v1.items).proposals.find(entry => entry.fundingId === expandedId('exact-1:payment'));
  const applied = engine.applyReconciliation(v1, [proposal], { id: 'user-v1-before-v2', at: '2026-09-15T12:00:00.000Z', actor: 'User accountant' });
  const reversed = engine.reverseReconciliation(applied, expandedId('history-rent:batch'), '2026-09-15T13:00:00.000Z');
  const input = deepFreeze(engine.parseReconciliationState(JSON.stringify(reversed), companyId));
  const upgraded = augmentReconciliationExamples(input);
  assert.equal(upgraded.items.length, input.items.length + 224 + 8);
  assert.equal(upgraded.batches.length, input.batches.length);
  assert.deepEqual(upgraded.items.filter(item => !isChoice(item) && !isDepositExpansion(item)), input.items);
  assert.deepEqual(upgraded.batches, input.batches);
  assert.ok(upgraded.items.slice(0, input.items.length).every((item, index) => item === input.items[index]));
  assert.ok(upgraded.items.every(item => !removed.has(item.id)));
  assert.equal(expandedRow(upgraded, 'exact-1:invoice').remainingMinor, 0);
  assert.equal(expandedRow(upgraded, 'history-rent:invoice').remainingMinor, 186340);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(upgraded), companyId), upgraded);
  assert.strictEqual(augmentReconciliationExamples(upgraded), upgraded);
  const reloaded = deepFreeze(engine.parseReconciliationState(JSON.stringify(upgraded), companyId));
  assert.strictEqual(augmentReconciliationExamples(reloaded), reloaded);
});

test('v2 reload does not reset new manual matches or recreate deleted v2 choices', () => {
  const state = createReconciliationExamples(companyId);
  const source = choiceRow(state, 'sales-eur:invoice-100');
  const candidates = manual.getManualReconciliationCandidates(state.items, source.id);
  const selected = candidates.slice(0, 20);
  const preview = manual.buildManualReconciliation(state.items, source.id, selected.map(item => item.id));
  const applied = engine.applyReconciliation(state, preview.proposals, { id: 'user-v2-20-before-reload', at: '2026-09-16T12:00:00.000Z', actor: 'User accountant' });
  const removed = new Set([choiceId('purchases-usd:invoice-024'), choiceId('purchases-usd:payment-024')]);
  const edited = { ...applied, items: applied.items.filter(item => !removed.has(item.id)) };
  const reloaded = deepFreeze(engine.parseReconciliationState(JSON.stringify(edited), companyId));
  assert.strictEqual(augmentReconciliationExamples(reloaded), reloaded);
  assert.equal(choiceRow(reloaded, 'sales-eur:invoice-100').remainingMinor, preview.sourceRemainingMinor);
  assert.ok(reloaded.items.every(item => !removed.has(item.id)));
  assert.equal(reloaded.batches.at(-1).allocations.length, 20);
  const oneSurvivor = {
    ...state,
    items: state.items.filter(item => !isChoice(item) || item.id === source.id),
  };
  assert.strictEqual(augmentReconciliationExamples(oneSurvivor), oneSurvivor);
});

test('v3 adds eight manual-only contract deposits with 25 invoice choices each', () => {
  const state = createReconciliationExamples(companyId);
  const deposits = state.items.filter(isDepositExpansion);
  assert.equal(deposits.length, 8);
  assert.equal(new Set(deposits.map(item => item.documentNumber)).size, 8);
  const suggestions = engine.suggestReconciliation(state.items);
  for (const key of choiceGroups) {
    const group = deposits.filter(item => item.counterpartyId === choiceId(`counterparty:${key}`));
    assert.equal(group.length, 2);
    for (const source of group) {
      assert.equal(source.kind, 'Deposit');
      assert.equal(source.originalMinor, source.remainingMinor);
      assert.match(source.reference, /Contract LT-2026/);
      const candidates = manual.getManualReconciliationCandidates(state.items, source.id).filter(item => item.counterpartyId === source.counterpartyId);
      assert.equal(candidates.length, 25, source.documentNumber);
      assert.ok(candidates.every(item => item.kind === 'Invoice' && item.counterpartyId === source.counterpartyId && item.currency === source.currency && item.side === source.side));
      assert.equal(suggestions.proposals.some(proposal => proposal.fundingId === source.id), false);
      assert.match(suggestions.unmatched.find(entry => entry.itemId === source.id).reason, /manual allocation/);
    }
    const large = group.find(item => item.id.endsWith('deposit-002'));
    const selected = manual.getManualReconciliationCandidates(state.items, large.id).filter(item => item.counterpartyId === large.counterpartyId).slice(0, 24);
    const preview = manual.buildManualReconciliation(state.items, large.id, selected.map(item => item.id));
    assert.equal(preview.allocations.length, 24);
    assert.ok(preview.allocations.every(allocation => allocation.amountMinor > 0 && allocation.remainingMinor === 0));
    assert.ok(preview.sourceRemainingMinor > 0);
    const batchId = `user-deposit-${key}`;
    const applied = engine.applyReconciliation(state, preview.proposals, { id: batchId, at: '2026-09-26T12:00:00.000Z', actor: 'User accountant' });
    assert.deepEqual(engine.parseReconciliationState(JSON.stringify(applied), companyId), applied);
    assert.deepEqual(engine.reverseReconciliation(applied, batchId, '2026-09-26T13:00:00.000Z').items, state.items);
  }
});

test('v2 migration appends deposits once while preserving deleted rows, user edits and full history', () => {
  const current = createReconciliationExamples(companyId);
  const removed = new Set([choiceId('purchases-usd:invoice-024'), choiceId('purchases-usd:payment-024')]);
  const v2 = { ...current, items: current.items.filter(item => !isDepositExpansion(item) && !removed.has(item.id)) };
  const source = choiceRow(v2, 'sales-eur:invoice-100');
  const candidates = manual.getManualReconciliationCandidates(v2.items, source.id).slice(0, 20);
  const preview = manual.buildManualReconciliation(v2.items, source.id, candidates.map(item => item.id));
  const applied = engine.applyReconciliation(v2, preview.proposals, { id: 'user-v2-before-deposits', at: '2026-09-16T12:00:00.000Z', actor: 'User accountant' });
  const input = deepFreeze(engine.parseReconciliationState(JSON.stringify(applied), companyId));
  const upgraded = augmentReconciliationExamples(input);
  assert.equal(upgraded.items.length, input.items.length + 8);
  assert.deepEqual(upgraded.items.slice(0, input.items.length), input.items);
  assert.ok(upgraded.items.slice(0, input.items.length).every((item, index) => item === input.items[index]));
  assert.deepEqual(upgraded.batches, input.batches);
  assert.ok(upgraded.items.every(item => !removed.has(item.id)));
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(upgraded), companyId), upgraded);
  assert.strictEqual(augmentReconciliationExamples(upgraded), upgraded);
  const withoutDeposit = { ...upgraded, items: upgraded.items.filter(item => item.id !== depositId('sales-eur:deposit-001')) };
  assert.strictEqual(augmentReconciliationExamples(withoutDeposit), withoutDeposit);
});

test('partially reconciled deposit balances and reversals survive augmentation and reload', () => {
  const input = createReconciliationExamples(companyId);
  const sourceId = depositId('sales-eur:deposit-001');
  const candidateId = choiceId('sales-eur:invoice-001');
  const preview = manual.buildManualReconciliation(input.items, sourceId, [candidateId], { [candidateId]: 12517 });
  const applied = engine.applyReconciliation(input, preview.proposals, { id: 'user-deposit-partial', at: '2026-09-26T12:00:00.000Z', actor: 'User accountant' });
  const parsed = engine.parseReconciliationState(JSON.stringify(applied), companyId);
  assert.strictEqual(augmentReconciliationExamples(parsed), parsed);
  assert.equal(parsed.items.find(item => item.id === sourceId).remainingMinor, 62483);
  const reversed = engine.reverseReconciliation(parsed, 'user-deposit-partial', '2026-09-26T13:00:00.000Z');
  assert.strictEqual(augmentReconciliationExamples(reversed), reversed);
  assert.deepEqual(reversed.items, input.items);
  assert.equal(reversed.batches.at(-1).reversedAt, '2026-09-26T13:00:00.000Z');
});

test('v4 provides tax, social insurance, payroll, bank and unidentified payments without client debt proposals', () => {
  const state = deepFreeze(createReconciliationExamples(companyId));
  const added = state.items.filter(isAccountingExpansion);
  assert.equal(added.length, 11);
  assert.equal(added.filter(item => !engine.hasReconciliationClient(item)).length, 10);
  assert.ok(added.every(item => item.kind === 'Payment' && item.side === 'Payable' && item.originalMinor === item.remainingMinor));
  assert.deepEqual(new Set(added.map(item => engine.getReconciliationRoute(item).category)), new Set(['Tax authority', 'Social insurance', 'Payroll', 'Bank fees', 'Unidentified payment']));
  assert.equal(added.filter(item => engine.getReconciliationRoute(item).kind === 'accounting').length, 9);
  const identified = added.find(item => engine.hasReconciliationClient(item));
  assert.equal(engine.getReconciliationRoute(identified).category, 'Bank fees');
  const proposals = engine.suggestReconciliation(state.items).proposals;
  assert.ok(proposals.every(proposal => !proposal.fundingId.startsWith(accountingId(''))));
  for (const item of added) assert.deepEqual(manual.getManualReconciliationCandidates(state.items, item.id), []);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(state), companyId), state);
});

test('v4 upgrade is additive and preserves existing matching balances, reversals and deleted rows', () => {
  const current = createReconciliationExamples(companyId);
  const removed = new Set([expandedId('exact-2:invoice'), expandedId('exact-2:payment')]);
  const v3 = { ...current, items: current.items.filter(item => !isAccountingExpansion(item) && !removed.has(item.id)) };
  const proposal = engine.suggestReconciliation(v3.items).proposals.find(entry => entry.fundingId === expandedId('exact-1:payment'));
  const applied = engine.applyReconciliation(v3, [proposal], { id: 'user-v3-before-v4', at: '2026-09-15T12:00:00Z', actor: 'User accountant' });
  const input = deepFreeze(engine.reverseReconciliation(applied, expandedId('history-rent:batch'), '2026-09-15T13:00:00Z'));
  const upgraded = augmentReconciliationExamples(input);
  assert.equal(upgraded.items.length, input.items.length + 11);
  assert.deepEqual(upgraded.items.slice(0, input.items.length), input.items);
  assert.ok(upgraded.items.slice(0, input.items.length).every((item, index) => item === input.items[index]));
  assert.deepEqual(upgraded.batches, input.batches);
  assert.ok(upgraded.items.every(item => !removed.has(item.id)));
  assert.strictEqual(augmentReconciliationExamples(upgraded), upgraded);
  const edited = engine.assignReconciliationGlAccount(upgraded, accountingId('vmi-vat'), '4484', ['4484'], { id: 'user-gl-1', at: '2026-09-16T10:00:00Z', actor: 'User accountant', note: '' });
  const parsed = deepFreeze(engine.parseReconciliationState(JSON.stringify(edited), companyId));
  assert.strictEqual(augmentReconciliationExamples(parsed), parsed);
  assert.equal(parsed.items.find(item => item.id === accountingId('vmi-vat')).glAccountCode, '4484');
  assert.deepEqual(parsed.glAssignments, edited.glAssignments);
  const withoutOneFixture = { ...parsed, items: parsed.items.filter(item => item.id !== accountingId('salary')) };
  assert.strictEqual(augmentReconciliationExamples(withoutOneFixture), withoutOneFixture);
});
