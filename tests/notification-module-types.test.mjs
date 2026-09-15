import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function transpile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { getNotificationModuleLabel } = await import(moduleUrl(transpile('../src/lib/notificationPresentation.ts')));

const row = overrides => ({ id: 'notification-1', type: 'System', ...overrides });
const related = (type, organizationId = 'company-1') => ({ id: 'object-1', organizationId, type, label: 'Source record' });
const legacyTaskId = (values = ['company-1', 'task-1', 'user@example.com', '2026-09-15', 'on_due_date']) =>
  `task-reminder:${values.map(encodeURIComponent).join(':')}`;

test('notification raw type aliases use the system menu names', () => {
  const expected = new Map([
    ['Email', 'Chats'], ['Chat', 'Chats'], ['Task', 'Tasks'],
    ['Invoice', 'Invoices'], ['Billing', 'Invoices'], ['Document', 'Documents'],
    ['Debt', 'Debts'], ['Bank operation', 'Bank'], ['Transaction', 'Bank'], ['Payment', 'Bank'],
    ['Counterparty', 'Counterparties'], ['Reconciliation', 'Reconciliation'], ['System', 'Settings'],
  ]);
  for (const [type, label] of expected) {
    assert.equal(getNotificationModuleLabel(row({ type })), label, type);
    assert.equal(getNotificationModuleLabel(row({ type: ` \t${type.toUpperCase()}\n ` })), label, `normalized ${type}`);
  }
});

test('canonical menu labels remain stable and General ledger stays distinct from GL journal', () => {
  for (const type of ['Chats', 'Tasks', 'Invoices', 'Documents', 'Debts', 'Bank', 'Counterparties', 'Reconciliation', 'Settings', 'GL journal', 'General ledger', 'Notifications & Tasks']) {
    assert.equal(getNotificationModuleLabel(row({ type })), type, type);
  }
  for (const type of ['GL journal', 'GL Journal', 'gl-journal', 'gl_journal', '  GL JOURNAL  ']) {
    assert.equal(getNotificationModuleLabel(row({ type })), 'GL journal', type);
  }
  assert.notEqual(getNotificationModuleLabel(row({ type: 'General ledger' })), 'GL journal');
});

test('explicit primary task provenance takes priority over chat provenance and linked business records', () => {
  for (const type of ['Document', 'Invoice', 'Bank operation', 'Debt', 'Chat', 'Counterparty', 'Reconciliation']) {
    assert.equal(getNotificationModuleLabel(row({
      type: 'Email', organizationId: 'company-1', sourceTaskId: ' task-1 ', sourceChatId: 'chat-1',
      relatedObject: related(type),
    })), 'Tasks', type);
  }
  assert.equal(getNotificationModuleLabel(row({ sourceTaskId: 'task-1' })), 'Tasks');
  assert.equal(getNotificationModuleLabel(row({ sourceTaskId: 'task-1', organizationId: '', relatedObject: related('Invoice') })), 'Tasks');
});

test('valid legacy reminders are Tasks even when the stored type is System and an Invoice is linked', () => {
  for (const reminder of ['on_due_date', '1_day_before', '3_days_before', '7_days_before']) {
    assert.equal(getNotificationModuleLabel(row({
      id: legacyTaskId(['company-1', 'task-1', 'user@example.com', '2026-09-15', reminder]),
      organizationId: 'company-1', sourceTaskId: '  ', relatedObject: related('Invoice'),
    })), 'Tasks', reminder);
  }
  const values = ['company:1/ä', 'task:2/% č', 'user@example.com', '2026-09-15', 'on_due_date'];
  assert.equal(getNotificationModuleLabel(row({ id: legacyTaskId(values), organizationId: values[0] })), 'Tasks');
});

test('invalid or differently scoped legacy reminder IDs do not imply Tasks', () => {
  const invalidIds = [
    'task-reminder:company-1:task-1', `${legacyTaskId()}:extra`,
    'task-reminder:company-1:%ZZ:user@example.com:2026-09-15:on_due_date',
    legacyTaskId(['company-1', '', 'user@example.com', '2026-09-15', 'on_due_date']),
    legacyTaskId(['company-1', 'task-1', 'user@example.com', '2026-02-30', 'on_due_date']),
    legacyTaskId(['company-1', 'task-1', 'user@example.com', '2026-09-15', 'none']),
  ];
  for (const id of invalidIds) {
    assert.equal(getNotificationModuleLabel(row({ id, organizationId: 'company-1', type: 'Invoice' })), 'Invoices', id);
  }
  assert.equal(getNotificationModuleLabel(row({ id: legacyTaskId(), organizationId: 'another-company' })), 'Settings');
  assert.equal(getNotificationModuleLabel(row({ id: legacyTaskId() })), 'Settings');
});

test('primary chat provenance and legacy chat signal IDs take priority over raw and linked types', () => {
  for (const provenance of [{ sourceChatId: ' chat-1 ' }, { id: 'chat-message:company-1:chat-1:message-1:user' }]) {
    assert.equal(getNotificationModuleLabel(row({
      ...provenance, type: 'Billing', organizationId: 'company-1', relatedObject: related('Invoice'),
    })), 'Chats');
  }
  assert.equal(getNotificationModuleLabel(row({ sourceChatId: 'chat-1' })), 'Chats');
  assert.equal(getNotificationModuleLabel(row({ id: 'chat-message:legacy', sourceTaskId: 'task-1' })), 'Tasks');
});

test('blank source metadata allows the same-organization linked module to determine the label', () => {
  const expected = new Map([
    ['Document', 'Documents'], ['Invoice', 'Invoices'], ['Bank operation', 'Bank'], ['Debt', 'Debts'],
    ['Chat', 'Chats'], ['Counterparty', 'Counterparties'], ['Reconciliation', 'Reconciliation'],
  ]);
  for (const [type, label] of expected) {
    assert.equal(getNotificationModuleLabel(row({
      type: 'System', organizationId: 'company-1', sourceTaskId: ' \t ', sourceChatId: '\n ', relatedObject: related(type),
    })), label, type);
  }
});

test('related objects cannot override the raw fallback outside a nonblank matching organization', () => {
  for (const [organizationId, objectOrganizationId] of [
    ['company-1', 'company-2'], [undefined, 'company-1'], ['', ''], ['   ', '   '], ['company-1', undefined],
  ]) {
    const relatedObject = { ...related('Invoice'), organizationId: objectOrganizationId };
    assert.equal(getNotificationModuleLabel(row({ type: 'Email', organizationId, relatedObject })), 'Chats');
    assert.equal(getNotificationModuleLabel(row({ type: 'System', organizationId, relatedObject })), 'Settings');
  }
});

test('unknown raw types use Notifications & Tasks without guessing a business module', () => {
  for (const type of ['Custom type', 'invoice-like unknown', 'Unrecognized bank alert', '  A future module  ']) {
    assert.equal(getNotificationModuleLabel(row({ type })), 'Notifications & Tasks', type);
  }
});

test('empty or missing raw types display a dash unless source evidence provides a module', () => {
  for (const type of ['', ' \t\n ', undefined]) {
    assert.equal(getNotificationModuleLabel(row({ type })), '—');
    assert.equal(getNotificationModuleLabel(row({ type, sourceTaskId: 'task-1' })), 'Tasks');
    assert.equal(getNotificationModuleLabel(row({ type, sourceChatId: 'chat-1' })), 'Chats');
    assert.equal(getNotificationModuleLabel(row({ type, organizationId: 'company-1', relatedObject: related('Invoice') })), 'Invoices');
  }
});

test('label presentation never mutates stored types, source identities, linked records, or reading state', () => {
  const examples = [
    row({ type: 'Email', sourceChatId: 'chat-1' }),
    row({ id: legacyTaskId(), organizationId: 'company-1', relatedObject: related('Invoice') }),
    row({ type: 'Billing', organizationId: 'company-1', relatedObject: related('Document') }),
    row({ type: '  custom event  ' }),
  ];
  for (const example of examples) {
    const notification = Object.freeze({
      ...example,
      relatedObject: example.relatedObject ? Object.freeze(example.relatedObject) : undefined,
      readAtByEmail: Object.freeze({ 'reader@example.com': '2026-09-15T09:00:00Z' }),
      recipientEmails: Object.freeze(['reader@example.com']),
    });
    const before = JSON.stringify(notification);
    assert.equal(typeof getNotificationModuleLabel(notification), 'string');
    assert.equal(JSON.stringify(notification), before);
  }
});
