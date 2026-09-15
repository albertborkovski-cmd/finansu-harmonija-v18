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
const notificationsUrl = moduleUrl(transpile('../src/lib/notifications.ts'));
const source = transpile('../src/lib/taskProvenance.ts')
  .replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl));
const { getTaskProvenance } = await import(moduleUrl(source));
const { SAMPLE_REMINDERS } = await import(notificationsUrl);

const unknown = () => ({
  id: 'legacy-task', name: 'Review invoice', type: 'Review', daysTillRemind: '3',
  message: 'Please check the invoice.', status: 'Active',
});
const notRecorded = { source: 'Not recorded', createdBy: 'Not recorded', legacy: true };
const demo = { source: 'Demo data', createdBy: 'System', legacy: false };

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('all unchanged built-in demo fixtures have known demo/system provenance', () => {
  for (const task of SAMPLE_REMINDERS) {
    assert.deepEqual(getTaskProvenance(task), demo);
    assert.deepEqual(getTaskProvenance(JSON.parse(JSON.stringify(task))), demo);
    assert.deepEqual(getTaskProvenance({ ...task, category: 'reminders' }), demo);
  }
});

test('demo recognition permits lifecycle and personal read-state changes', () => {
  for (const lifecycle of [
    { status: 'Active', taskStatus: 'Open', requiresAction: true },
    { status: 'Inactive', taskStatus: 'Completed', resolvedAt: '2026-09-15T09:00:00Z', requiresAction: false },
    { status: 'Inactive', taskStatus: 'Cancelled', resolvedAt: '2026-09-15T09:00:00Z' },
  ]) {
    assert.deepEqual(getTaskProvenance({
      ...SAMPLE_REMINDERS[0], ...lifecycle,
      readAtByEmail: { 'reader@example.com': '2026-09-15T09:00:00Z' },
    }), demo);
  }
});

test('unknown legacy records never receive fabricated Manual or viewer provenance', () => {
  assert.deepEqual(getTaskProvenance(unknown()), notRecorded);
  assert.deepEqual(getTaskProvenance({ ...unknown(), assignedToName: 'Current Viewer', assignedToEmail: 'viewer@example.com' }), notRecorded);
});

test('demo identity requires exact original id, name, type, days, and message', () => {
  for (const seed of SAMPLE_REMINDERS) {
    for (const field of ['id', 'name', 'type', 'daysTillRemind', 'message']) {
      for (const value of ['', `${seed[field]} `, `changed-${seed[field]}`]) {
        assert.deepEqual(getTaskProvenance({ ...seed, [field]: value }), notRecorded, `${field}: ${value}`);
      }
    }
  }
  assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], id: SAMPLE_REMINDERS[1].id }), notRecorded);
});

test('organization, creation, assignment, and other added content prevent demo misidentification', () => {
  const additions = {
    organizationId: 'company-1', organizationName: 'Company', createdAt: '2026-09-15T09:00:00Z',
    assignedToId: 'Internal users:user-1', assignedToName: 'User', assignedToEmail: 'user@example.com', assignedToAudience: 'Internal users',
    dueDate: '2026-09-30', reminder: 'none', relatedObject: { id: 'invoice-1', organizationId: 'company-1', type: 'Invoice', label: 'Invoice' },
    actionId: 'task-action', recipientEmails: ['user@example.com'], relevantRoles: ['Accountant'], customMetadata: {}, category: 'notifications',
  };
  for (const [field, value] of Object.entries(additions)) {
    assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], [field]: value }), notRecorded, field);
  }
  for (const field of ['organizationId', 'createdAt', 'assignedToId']) {
    for (const value of ['', ' ', null]) {
      assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], [field]: value }), notRecorded, `${field}: ${value}`);
    }
    assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], [field]: undefined }), demo);
  }
});

test('recorded source and creator always take precedence, even on matching demo content', () => {
  const recorded = { source: 'Imported', createdByName: 'Original Creator', createdByEmail: 'original@example.com' };
  const expected = { source: 'Imported', createdBy: 'Original Creator', createdByEmail: 'original@example.com', legacy: false };
  assert.deepEqual(getTaskProvenance({ ...unknown(), ...recorded }), expected);
  for (const seed of SAMPLE_REMINDERS) assert.deepEqual(getTaskProvenance({ ...seed, ...recorded }), expected);
});

test('partial recorded metadata is preserved independently without inventing missing history', () => {
  assert.deepEqual(getTaskProvenance({ ...unknown(), source: 'Manual' }), { ...notRecorded, source: 'Manual' });
  assert.deepEqual(getTaskProvenance({ ...unknown(), createdByName: 'Original Creator' }), { ...notRecorded, createdBy: 'Original Creator' });
  assert.deepEqual(getTaskProvenance({ ...unknown(), createdByEmail: 'original@example.com' }), {
    ...notRecorded, createdBy: 'original@example.com', createdByEmail: 'original@example.com',
  });
  assert.deepEqual(getTaskProvenance({ ...unknown(), source: 'Manual', createdByEmail: 'original@example.com' }), {
    source: 'Manual', createdBy: 'original@example.com', createdByEmail: 'original@example.com', legacy: false,
  });
});

test('known fixture fallback fills only missing provenance fields', () => {
  assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], source: 'Recorded import' }), { ...demo, source: 'Recorded import' });
  assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], createdByName: 'Recorded Creator' }), { ...demo, createdBy: 'Recorded Creator' });
  assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], createdByEmail: 'recorded@example.com' }), {
    ...demo, createdBy: 'recorded@example.com', createdByEmail: 'recorded@example.com',
  });
});

test('display trims source, name, and email, preserving the recorded spelling', () => {
  assert.deepEqual(getTaskProvenance({
    ...unknown(), source: '  Imported \t', createdByName: '  Alice Smith\n', createdByEmail: ' Alice@Example.com ',
  }), { source: 'Imported', createdBy: 'Alice Smith', createdByEmail: 'Alice@Example.com', legacy: false });
  assert.deepEqual(getTaskProvenance({
    ...unknown(), source: ' Manual ', createdByName: ' \t\n ', createdByEmail: ' Alice@Example.com ',
  }), { source: 'Manual', createdBy: 'Alice@Example.com', createdByEmail: 'Alice@Example.com', legacy: false });
});

test('whitespace-only or malformed provenance is absent, not an invented identity', () => {
  for (const value of ['', ' \t\n ', null, 7, {}]) {
    const fields = { source: value, createdByName: value, createdByEmail: value };
    assert.deepEqual(getTaskProvenance({ ...unknown(), ...fields }), notRecorded);
    assert.deepEqual(getTaskProvenance({ ...SAMPLE_REMINDERS[0], ...fields }), demo);
  }
});

test('provenance display never modifies the task, fixtures, or persisted metadata', () => {
  const tasks = freezeDeep([
    { ...SAMPLE_REMINDERS[0], readAtByEmail: { 'reader@example.com': '2026-09-15T09:00:00Z' } },
    { ...unknown(), source: ' Manual ', createdByName: ' Original ', createdByEmail: ' Original@Example.com ' },
    unknown(),
  ]);
  const before = JSON.stringify({ tasks, fixtures: SAMPLE_REMINDERS });
  for (const task of tasks) {
    const first = getTaskProvenance(task);
    first.source = 'Changed display result';
    assert.notEqual(getTaskProvenance(task).source, first.source);
  }
  assert.equal(JSON.stringify({ tasks, fixtures: SAMPLE_REMINDERS }), before);
});
