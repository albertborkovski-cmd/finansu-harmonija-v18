import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/reconciliationGlSuggestions.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { suggestPreviousGlAccount } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function payment(id, patch = {}) {
  return {
    id,
    organizationId: 'company-1',
    counterpartyId: '',
    counterpartyName: '',
    payeeName: 'Known payee',
    kind: 'Payment',
    side: 'Payable',
    documentNumber: `PAY-${id}`,
    reference: '',
    documentDate: '2026-09-01',
    dueDate: '',
    currency: 'EUR',
    originalMinor: 10000,
    remainingMinor: 10000,
    ...patch,
  };
}

function audit(itemId, patch = {}) {
  return {
    id: `audit-${itemId}`,
    itemId,
    fromAccount: '',
    toAccount: '6123',
    at: '2026-09-01T09:00:00.000Z',
    actor: 'Accountant',
    note: 'Confirmed account assignment',
    ...patch,
  };
}

const activeCodes = ['6123', '4481'];
const target = payment('target');
const confirmed = (id = 'previous', patch = {}) => payment(id, { glAccountCode: '6123', ...patch });
const suggest = (items = [confirmed()], assignments = [audit('previous')], row = target, codes = activeCodes) =>
  suggestPreviousGlAccount(items, row, assignments, codes);

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('one explicit prior same-company payment assignment suggests its active account', () => {
  assert.equal(suggest(), '6123');
  assert.equal(suggest([target, confirmed(), payment('unassigned')]), '6123');
  assert.equal(suggest([confirmed(), confirmed('second')], [audit('previous'), audit('second')]), '6123');
});

test('normalizes payee case, whitespace, and Unicode composition', () => {
  const previous = confirmed('previous', { payeeName: '  SĄSKAITA\t  GRUPĖ  ' });
  const next = payment('target', { payeeName: 'sa\u0328skaita grupe\u0307' });
  assert.equal(suggest([previous], [audit('previous')], next), '6123');
});

test('uses counterparty name only when the payee name is missing or blank', () => {
  for (const payeeName of [undefined, '', ' \n ']) {
    const previous = confirmed('previous', { payeeName, counterpartyName: '  Shared NAME ' });
    const next = payment('target', { payeeName, counterpartyName: 'shared name' });
    assert.equal(suggest([previous], [audit('previous')], next), '6123');
  }
  assert.equal(suggest([confirmed('previous', { payeeName: 'Different', counterpartyName: 'Known payee' })]), undefined);
});

test('never guesses a payee from reference, category words, or an empty name', () => {
  const next = payment('target', { payeeName: '', reference: 'Known payee VMI tax VAT' });
  assert.equal(suggest([confirmed()], [audit('previous')], next), undefined);
  assert.equal(suggest([confirmed('previous', { payeeName: '', reference: 'VMI tax VAT' })], [audit('previous')], next), undefined);
  assert.equal(suggest([confirmed('previous', { payeeName: 'Known-payee' })]), undefined);
});

test('conflicting current accounts suppress a suggestion regardless of order', () => {
  const rows = [confirmed(), confirmed('second', { glAccountCode: '4481' })];
  const assignments = [audit('previous'), audit('second', { toAccount: '4481' })];
  assert.equal(suggest(rows, assignments), undefined);
  assert.equal(suggest([...rows].reverse(), [...assignments].reverse()), undefined);
});

test('inactive or unknown current accounts cannot become suggestions', () => {
  assert.equal(suggest(undefined, undefined, undefined, ['4481']), undefined);
  assert.equal(suggest(undefined, undefined, undefined, []), undefined);
  assert.equal(suggest([confirmed(), confirmed('inactive', { glAccountCode: '9999' })], [audit('previous'), audit('inactive', { toAccount: '9999' })]), undefined);
});

test('ignores unrelated payees, other organizations, and non-payment documents', () => {
  for (const patch of [
    { payeeName: 'Another payee' },
    { organizationId: 'company-2' },
    { kind: 'Invoice' },
    { kind: 'Credit note' },
    { kind: 'Advance' },
    { kind: 'Deposit' },
  ]) {
    const unrelated = confirmed('unrelated', { glAccountCode: '4481', ...patch });
    assert.equal(suggest([unrelated], [audit('unrelated', { toAccount: '4481' })]), undefined);
    assert.equal(suggest([confirmed(), unrelated], [audit('previous'), audit('unrelated', { toAccount: '4481' })]), '6123');
  }
});

test('an assigned or non-payment target cannot receive a suggestion, and target history is excluded', () => {
  assert.equal(suggest(undefined, undefined, payment('target', { glAccountCode: '6123' })), undefined);
  for (const kind of ['Invoice', 'Credit note', 'Advance', 'Deposit']) {
    assert.equal(suggest(undefined, undefined, payment('target', { kind })), undefined);
  }
  assert.equal(suggest([confirmed('target')], [audit('target')]), undefined);
  assert.equal(suggest([], [audit('previous')]), undefined);
});

test('requires audited provenance instead of trusting legacy GL values alone', () => {
  assert.equal(suggest([confirmed()], []), undefined);
  assert.equal(suggest([confirmed()], [audit('some-other-item')]), undefined);
  assert.equal(suggest([confirmed(), confirmed('legacy')], [audit('previous')]), undefined);
});

test('uses latest timestamp rather than array order and rejects stale current GL values', () => {
  const older = audit('previous');
  const latest = audit('previous', { id: 'latest', fromAccount: '6123', toAccount: '4481', at: '2026-09-02T09:00:00.000Z' });
  assert.equal(suggest([confirmed()], [older, latest]), undefined);
  assert.equal(suggest([confirmed()], [latest, older]), undefined);
  assert.equal(suggest([confirmed('previous', { glAccountCode: '4481' })], [latest, older]), '4481');
  assert.equal(suggest([confirmed()], [older, { ...latest, toAccount: 'inactive' }]), undefined);
});

test('allows an inactive former account when the latest current assignment is active', () => {
  const older = audit('previous', { toAccount: 'inactive' });
  const latest = audit('previous', { id: 'latest', fromAccount: 'inactive', at: '2026-09-02T09:00:00.000Z' });
  assert.equal(suggest([confirmed()], [older, latest]), '6123');
});

test('suppresses ambiguous equal-time history and duplicate item identities', () => {
  assert.equal(suggest([confirmed()], [audit('previous'), audit('previous', { id: 'other', toAccount: '4481' })]), undefined);
  const resolved = [audit('previous'), audit('previous', { id: 'other', toAccount: '4481' }), audit('previous', { id: 'latest', at: '2026-09-02T09:00:00.000Z' })];
  assert.equal(suggest([confirmed()], resolved), '6123');
  assert.equal(suggest([confirmed()], [...resolved].reverse()), '6123');
  assert.equal(suggest([confirmed(), confirmed()]), undefined);
  assert.equal(suggest([confirmed(), confirmed('previous', { organizationId: 'company-2' })]), undefined);
});

test('audit entries require valid IDs, actor, from/to text, and real timezone-bearing timestamps', () => {
  for (const patch of [
    { id: '' }, { actor: ' ' }, { fromAccount: undefined }, { fromAccount: 6123 },
    { toAccount: '' }, { toAccount: 6123 }, { note: 12 },
    { at: '' }, { at: '2026-09-02' }, { at: '2026-09-02T09:00:00' },
    { at: '2026-02-30T09:00:00.000Z' }, { at: '2026-09-02T25:00:00.000Z' },
    { at: '2026-09-02T09:00:00.000+25:00' },
  ]) {
    assert.equal(suggest([confirmed()], [audit('previous', patch)]), undefined, JSON.stringify(patch));
    assert.equal(suggest([confirmed()], [audit('previous'), audit('previous', { id: 'newer', at: '2026-09-02T09:00:00.000Z', ...patch })]), undefined, JSON.stringify(patch));
  }
  assert.equal(suggest([confirmed()], [audit('previous', { at: '2026-09-01T12:00:00+03:00' })]), '6123');
  assert.equal(suggest([confirmed()], [audit('previous', { note: undefined })]), '6123');
});

test('does not mutate or save any items, target, histories, or account codes', () => {
  const inputs = deepFreeze({ items: [confirmed(), target], target, assignments: [audit('previous')], activeCodes: [...activeCodes] });
  const before = JSON.stringify(inputs);
  assert.equal(suggestPreviousGlAccount(inputs.items, inputs.target, inputs.assignments, inputs.activeCodes), '6123');
  assert.equal(JSON.stringify(inputs), before);
  assert.equal(inputs.target.glAccountCode, undefined);
});
