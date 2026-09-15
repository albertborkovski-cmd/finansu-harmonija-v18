import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/companySubstitutions.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { selectCompanySubstitutions } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const organizationId = 'company-1';
const today = '2026-09-14';
const users = [
  { id: 'accountant-1', fullName: 'First Accountant' },
  { id: 'accountant-2', fullName: 'Second Accountant' },
];

function record(id, patch = {}) {
  return {
    id,
    organizationId,
    userId: 'accountant-1',
    from: '2026-09-01',
    to: '2026-09-30',
    createdAt: '2026-08-25T08:00:00.000Z',
    ...patch,
  };
}

test('includes active and scheduled periods with inclusive From and To dates', () => {
  const rows = [
    record('future', { from: '2026-10-01', to: '2026-10-31' }),
    record('starts-today', { from: today }),
    record('ends-today', { to: today }),
    record('today-only', { from: today, to: today, userId: 'accountant-2' }),
    record('active'),
    record('expired', { to: '2026-09-13' }),
    record('other-company', { organizationId: 'company-2' }),
  ];
  assert.deepEqual(selectCompanySubstitutions(organizationId, rows, users, today).map(entry => entry.id), [
    'ends-today', 'active', 'today-only', 'starts-today', 'future',
  ]);
});

test('rejects malformed, impossible, non-ISO and reversed date ranges', () => {
  const rows = [
    record('invalid-month', { from: '2026-13-01' }),
    record('invalid-day', { to: '2026-09-31' }),
    record('non-leap-day', { from: '2026-02-29' }),
    record('unpadded', { from: '2026-9-01' }),
    record('date-time', { from: '2026-09-01T00:00:00Z' }),
    record('missing-date', { from: undefined }),
    record('reversed', { from: '2026-10-01', to: '2026-09-30' }),
    record('blank-id', { id: ' ' }),
    record('wrong-user-type', { userId: 123 }),
    null,
    record('valid-leap-day', { from: '2028-02-29', to: '2028-03-01' }),
  ];
  assert.deepEqual(selectCompanySubstitutions(organizationId, rows, users, today).map(entry => entry.id), ['valid-leap-day']);
});

test('only includes users supplied as eligible by the caller', () => {
  const rows = [
    record('valid'),
    record('missing', { userId: 'missing-user' }),
    record('deleted', { userId: 'deleted-user' }),
    record('disabled', { userId: 'disabled-user' }),
    record('other-role', { userId: 'non-accountant' }),
  ];
  assert.deepEqual(selectCompanySubstitutions(organizationId, rows, users, today), [{
    id: 'valid', userId: 'accountant-1', label: 'First Accountant', from: '2026-09-01', to: '2026-09-30',
  }]);
  assert.deepEqual(selectCompanySubstitutions(organizationId, rows, [], today), []);
});

test('deduplicates exact ranges but preserves distinct periods for the same user', () => {
  const first = record('original');
  const rows = [
    first,
    { ...first },
    record('same-range-different-record'),
    record('overlap', { from: '2026-09-10', to: '2026-09-20' }),
    record('future-interval', { from: '2026-11-01', to: '2026-11-03' }),
  ];
  assert.deepEqual(selectCompanySubstitutions(organizationId, rows, users, today).map(entry => entry.id), [
    'original', 'overlap', 'future-interval',
  ]);
});

test('sorts active first, then From, To and stable user identity', () => {
  const rows = [
    record('future-late', { from: '2026-12-01', to: '2026-12-31' }),
    record('same-dates-second-user', { userId: 'accountant-2' }),
    record('shorter-active', { to: '2026-09-15' }),
    record('future-early', { from: '2026-10-01', to: '2026-10-31' }),
    record('same-dates-first-user'),
  ];
  assert.deepEqual(selectCompanySubstitutions(organizationId, rows, users, today).map(entry => entry.id), [
    'shorter-active', 'same-dates-first-user', 'same-dates-second-user', 'future-early', 'future-late',
  ]);
});

test('keeps the first user record and trims names without deduplicating by label', () => {
  const directory = [
    { id: 'accountant-1', fullName: '  Shared Name  ', username: 'fallback' },
    { id: 'accountant-1', fullName: 'Must not replace the first record' },
    { id: 'accountant-2', fullName: 'Shared Name' },
    { id: 'username-only', fullName: '  ', username: '  username  ' },
    { id: 'unnamed', fullName: '', username: ' ' },
  ];
  const entries = selectCompanySubstitutions(organizationId, [
    record('one'),
    record('two', { userId: 'accountant-2' }),
    record('three', { userId: 'username-only' }),
    record('four', { userId: 'unnamed' }),
  ], directory, today);
  assert.equal(entries.length, 4);
  assert.deepEqual(Object.fromEntries(entries.map(entry => [entry.userId, entry.label])), {
    'accountant-1': 'Shared Name',
    'accountant-2': 'Shared Name',
    'username-only': 'username',
    unnamed: 'Unnamed user',
  });
});

test('does not mutate caller records or users', () => {
  const rows = Object.freeze([
    Object.freeze(record('future', { from: '2026-10-01', to: '2026-10-31' })),
    Object.freeze(record('active')),
  ]);
  const directory = Object.freeze(users.map(user => Object.freeze({ ...user })));
  const original = JSON.stringify({ rows, directory });
  const entries = selectCompanySubstitutions(organizationId, rows, directory, today);
  assert.equal(entries[0].id, 'active');
  assert.equal(JSON.stringify({ rows, directory }), original);
  assert.notEqual(entries[0], rows[1]);
});

test('invalid current dates produce no entries', () => {
  for (const invalidToday of ['', '2026-02-30', '2026-9-14', 'not-a-date']) {
    assert.deepEqual(selectCompanySubstitutions(organizationId, [record('active')], users, invalidToday), []);
  }
});
