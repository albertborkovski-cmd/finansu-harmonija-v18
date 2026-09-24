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
const scheduleUrl = moduleUrl(transpile('../src/lib/taskSchedule.ts')
  .replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl)));
const creationSource = transpile('../src/lib/taskCreation.ts')
  .replace(/(['"])\.\/taskSchedule\1/g, JSON.stringify(scheduleUrl));
const { TASK_TYPES, validateTaskDraft, createTaskRecord, updateTaskRecord, assertTaskUnchanged } = await import(moduleUrl(creationSource));
const { TASK_REMINDER_OPTIONS } = await import(scheduleUrl);

const now = '2026-09-15T09:00:00.000Z';
const recordId = 'manual-task-1';
test('priority is independently validated and persisted without changing status or reminder', () => {
  const original = createTaskRecord(draft({ reminder: 'none' }), context(), recordId, now);
  assert.equal(original.priority, 'Normal');
  for (const priority of ['Low', 'Normal', 'High', 'Urgent']) {
    const updated = updateTaskRecord(original, draft({ priority, reminder: 'none' }), context());
    assert.equal(updated.priority, priority);
    assert.equal(updated.taskStatus, original.taskStatus);
    assert.equal(updated.reminder, original.reminder);
    assert.equal(createTaskRecord(draft({ priority }), context(), recordId, now).priority, priority);
  }
  assert.ok(validateTaskDraft(draft({ priority: 'invalid' }), context()).priority);
  assert.throws(() => createTaskRecord(draft({ priority: 'invalid' }), context(), recordId, now));
});

test('all supported related object kinds retain their canonical identity and organization when creating and editing', () => {
  for (const type of ['Document', 'Invoice', 'Bank operation', 'Reconciliation', 'Debt', 'Counterparty', 'Chat']) {
    const object = { id: `${type}:original-1`, recordId: 'original-1', organizationId: 'company-1', type, label: `${type} original` };
    const current = context({ relatedObjects: [object] });
    const selected = draft({ relatedObjectId: object.id });
    const created = createTaskRecord(selected, current, recordId, now);
    assert.deepEqual(created.relatedObject, object);
    assert.notEqual(created.relatedObject, object);
    assert.deepEqual(updateTaskRecord(created, selected, current).relatedObject, object);
    const otherOrganization = context({ relatedObjects: [{ ...object, organizationId: 'company-2' }] });
    assert.ok(validateTaskDraft(selected, otherOrganization).relatedObjectId);
    assert.throws(() => createTaskRecord(selected, otherOrganization, recordId, now));
  }
});

function context(patch = {}) {
  return {
    session: { email: 'creator@example.com', fullName: 'Task Creator' },
    organizations: [
      { id: 'company-1', name: 'First Organization' },
      { id: 'company-2', name: 'Second Organization' },
    ],
    assignees: [
      { id: 'internal:accountant-1', userId: 'accountant-1', name: 'First Accountant', email: 'first@example.com', audience: 'Internal users', organizationId: 'company-1' },
      { id: 'external:client-1', userId: 'client-1', name: 'First Client', email: 'client@example.com', audience: 'External users', organizationId: 'company-1' },
      { id: 'internal:accountant-2', userId: 'accountant-2', name: 'Second Accountant', email: 'second@example.com', audience: 'Internal users', organizationId: 'company-2' },
    ],
    relatedObjects: [
      { id: 'document-1', organizationId: 'company-1', type: 'Document', label: 'Delivery document' },
      { id: 'invoice-1', organizationId: 'company-1', type: 'Invoice', label: 'Invoice FH-1001' },
      { id: 'invoice-2', organizationId: 'company-2', type: 'Invoice', label: 'Invoice FH-2001' },
    ],
    ...patch,
  };
}

function draft(patch = {}) {
  return {
    name: 'Review the invoice',
    type: 'Review',
    organizationId: 'company-1',
    assignedToId: 'internal:accountant-1',
    dueDate: '2026-09-30',
    relatedObjectId: '',
    description: '',
    ...patch,
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('requires Name, Type, Organization, Assigned to, and Due date', () => {
  const required = ['name', 'type', 'organizationId', 'assignedToId', 'dueDate'];
  for (const field of required) {
    const invalid = draft({ [field]: '' });
    const errors = validateTaskDraft(invalid, context());
    assert.ok(errors[field], `${field} must be required`);
    assert.throws(() => createTaskRecord(invalid, context(), recordId, now));
  }
  const blank = draft(Object.fromEntries(required.map(field => [field, ''])));
  assert.deepEqual(Object.keys(validateTaskDraft(blank, context())).sort(), [...required].sort());
  assert.ok(validateTaskDraft(draft({ name: ' \t\n ' }), context()).name);
});

test('accepts every supported task type and rejects unknown or blank types', () => {
  assert.deepEqual([...TASK_TYPES], ['To-do', 'Request', 'Review', 'Approval']);
  for (const type of TASK_TYPES) {
    assert.deepEqual(validateTaskDraft(draft({ type }), context()), {});
    assert.equal(createTaskRecord(draft({ type }), context(), recordId, now).type, type);
  }
  for (const type of ['', ' ', 'System', 'Scheduled', 'Deadline', 'Recurring', 'Maintenance', 'review', 'Unknown']) {
    assert.ok(validateTaskDraft(draft({ type }), context()).type, type);
  }
});

test('requires a real, strictly formatted ISO calendar due date', () => {
  const invalidDates = [
    '', ' ', 'not-a-date', '2026-9-15', '2026-09-5', '15/09/2026',
    '2026-00-15', '2026-13-15', '2026-09-00', '2026-09-31',
    '2026-02-29', '2028-02-30', '1900-02-29',
    '2026-09-15T00:00:00Z', '2026-09-15 ', ' 2026-09-15',
  ];
  for (const dueDate of invalidDates) {
    const invalid = draft({ dueDate });
    assert.ok(validateTaskDraft(invalid, context()).dueDate, JSON.stringify(dueDate));
    assert.throws(() => createTaskRecord(invalid, context(), recordId, now));
  }
  for (const dueDate of ['2026-09-30', '2026-02-28', '2028-02-29', '2000-02-29', '2027-01-01']) {
    assert.deepEqual(validateTaskDraft(draft({ dueDate }), context()), {}, dueDate);
  }
});

test('Description and Related object may be empty without blocking creation', () => {
  const empty = draft({ description: '', relatedObjectId: '' });
  assert.deepEqual(validateTaskDraft(empty, context()), {});
  const created = createTaskRecord(empty, context(), recordId, now);
  assert.equal(created.message, '');
  assert.equal(created.relatedObject, undefined);
  assert.equal(createTaskRecord(draft({ description: ' \t\n ' }), context(), recordId, now).message, '');
});

test('reminder is optional and defaults to None without inferring legacy daysTillRemind', () => {
  for (const reminder of [undefined, 'none']) {
    const selected = draft({ reminder, daysTillRemind: '7' });
    assert.deepEqual(validateTaskDraft(selected, context()), {});
    const created = createTaskRecord(selected, context(), recordId, now);
    assert.equal(created.reminder, 'none');
    assert.equal(created.daysTillRemind, '');
  }
  assert.equal(createTaskRecord(draft(), context(), recordId, now).reminder, 'none');
});

test('creates and persists every supported reminder preset using the shared option list', () => {
  assert.deepEqual(TASK_REMINDER_OPTIONS, [
    { value: 'none', label: 'None' },
    { value: 'on_due_date', label: 'On due date' },
    { value: '1_day_before', label: '1 day before' },
    { value: '3_days_before', label: '3 days before' },
    { value: '7_days_before', label: '7 days before' },
  ]);
  for (const { value: reminder } of TASK_REMINDER_OPTIONS) {
    const selected = freezeDeep(draft({ reminder }));
    assert.deepEqual(validateTaskDraft(selected, context()), {});
    const created = createTaskRecord(selected, context(), recordId, now);
    assert.equal(created.reminder, reminder);
    assert.equal(JSON.parse(JSON.stringify(created)).reminder, reminder);
    assert.equal(created.dueDate, selected.dueDate);
  }
});

test('rejects supplied reminder values outside the finite preset list during create and edit', () => {
  const existing = createTaskRecord(draft({ reminder: '1_day_before' }), context(), recordId, now);
  for (const reminder of ['', ' ', 'None', 'on due date', '1', '14_days_before', 'none ', null, false, 1, {}, []]) {
    const selected = draft({ reminder });
    assert.deepEqual(validateTaskDraft(selected, context()), { reminder: 'Select a valid reminder.' }, JSON.stringify(reminder));
    assert.throws(() => createTaskRecord(selected, context(), recordId, now), /valid reminder/);
    assert.throws(() => updateTaskRecord(existing, selected, context()), /valid reminder/);
  }
  assert.equal(existing.reminder, '1_day_before');
});

test('editing may change or clear reminder while preserving legacy reminder days and lifecycle', () => {
  const existing = freezeDeep({
    ...createTaskRecord(draft({ reminder: '1_day_before' }), context(), recordId, now),
    daysTillRemind: '14', status: 'Inactive', taskStatus: 'Completed', resolvedAt: now,
  });
  for (const { value: reminder } of TASK_REMINDER_OPTIONS) {
    const edited = updateTaskRecord(existing, draft({ reminder }), context());
    assert.equal(edited.reminder, reminder);
    assert.equal(edited.daysTillRemind, '14');
    assert.equal(edited.status, 'Inactive');
    assert.equal(edited.taskStatus, 'Completed');
    assert.equal(edited.resolvedAt, now);
    assert.equal(edited.dueDate, existing.dueDate);
  }
  assert.equal(existing.reminder, '1_day_before');
});

test('editing with an omitted reminder defaults to None and does not migrate legacy reminder days', () => {
  const withReminder = createTaskRecord(draft({ reminder: '7_days_before' }), context(), recordId, now);
  const { reminder: _reminder, ...legacy } = { ...withReminder, daysTillRemind: '3' };
  for (const existing of [withReminder, legacy]) {
    const edited = updateTaskRecord(existing, draft(), context());
    assert.equal(edited.reminder, 'none');
    assert.equal(edited.daysTillRemind, existing.daysTillRemind);
  }
  assert.equal(Object.hasOwn(legacy, 'reminder'), false);
  assert.equal(withReminder.reminder, '7_days_before');
});

test('global creation permits only currently available organizations', () => {
  const secondOrganization = draft({ organizationId: 'company-2', assignedToId: 'internal:accountant-2', relatedObjectId: 'invoice-2' });
  assert.deepEqual(validateTaskDraft(secondOrganization, context()), {});
  const unavailable = context({ organizations: [{ id: 'company-1', name: 'First Organization' }] });
  assert.ok(validateTaskDraft(secondOrganization, unavailable).organizationId);
  assert.throws(() => createTaskRecord(secondOrganization, unavailable, recordId, now), /available organization/);
  assert.ok(validateTaskDraft(draft({ organizationId: 'missing-company' }), context()).organizationId);
  assert.ok(validateTaskDraft(draft(), context({ organizations: [] })).organizationId);
});

test('organization context strictly locks creation even when a crafted target is otherwise available', () => {
  const locked = context({ organizationContextId: 'company-1' });
  assert.deepEqual(validateTaskDraft(draft(), locked), {});
  const crafted = draft({
    organizationId: 'company-2', assignedToId: 'internal:accountant-2', relatedObjectId: 'invoice-2',
    organizationContextId: 'company-2',
  });
  const errors = validateTaskDraft(crafted, locked);
  assert.deepEqual(Object.keys(errors), ['organizationId']);
  assert.match(errors.organizationId, /cannot be changed/);
  assert.throws(() => createTaskRecord(crafted, locked, recordId, now), /cannot be changed/);
});

test('a locked organization must still be available at save time', () => {
  const revoked = context({ organizationContextId: 'company-1', organizations: [{ id: 'company-2', name: 'Second Organization' }] });
  assert.ok(validateTaskDraft(draft(), revoked).organizationId);
  assert.throws(() => createTaskRecord(draft(), revoked, recordId, now), /available organization/);
});

test('assignees must be in the current eligible set and belong to the selected organization', () => {
  for (const assignedToId of ['internal:accountant-1', 'external:client-1']) {
    assert.deepEqual(validateTaskDraft(draft({ assignedToId }), context()), {});
  }
  for (const assignedToId of ['missing-user', 'internal:accountant-2', 'accountant-1']) {
    const invalid = draft({ assignedToId });
    assert.ok(validateTaskDraft(invalid, context()).assignedToId, assignedToId);
    assert.throws(() => createTaskRecord(invalid, context(), recordId, now), /active user assigned/);
  }
});

test('a selected assignee that disappears or changes organizations before saving is rejected', () => {
  const original = context();
  assert.deepEqual(validateTaskDraft(draft(), original), {});
  const removed = { ...original, assignees: original.assignees.filter(user => user.id !== 'internal:accountant-1') };
  const moved = { ...original, assignees: original.assignees.map(user => user.id === 'internal:accountant-1' ? { ...user, organizationId: 'company-2' } : user) };
  for (const staleContext of [removed, moved, context({ assignees: [] })]) {
    assert.ok(validateTaskDraft(draft(), staleContext).assignedToId);
    assert.throws(() => createTaskRecord(draft(), staleContext, recordId, now), /active user assigned/);
  }
});

test('selected Document and Invoice objects must be available in the selected organization', () => {
  for (const relatedObjectId of ['document-1', 'invoice-1']) {
    const selected = draft({ relatedObjectId });
    const current = context();
    assert.deepEqual(validateTaskDraft(selected, current), {});
    assert.deepEqual(createTaskRecord(selected, current, recordId, now).relatedObject, current.relatedObjects.find(object => object.id === relatedObjectId));
  }
  for (const relatedObjectId of ['missing-object', 'invoice-2']) {
    const invalid = draft({ relatedObjectId });
    assert.ok(validateTaskDraft(invalid, context()).relatedObjectId, relatedObjectId);
    assert.throws(() => createTaskRecord(invalid, context(), recordId, now), /available object/);
  }
});

test('a selected related object that disappears or changes organizations before saving is rejected', () => {
  const selected = draft({ relatedObjectId: 'invoice-1' });
  const original = context();
  const removed = { ...original, relatedObjects: original.relatedObjects.filter(object => object.id !== 'invoice-1') };
  const moved = { ...original, relatedObjects: original.relatedObjects.map(object => object.id === 'invoice-1' ? { ...object, organizationId: 'company-2' } : object) };
  for (const staleContext of [removed, moved, context({ relatedObjects: [] })]) {
    assert.ok(validateTaskDraft(selected, staleContext).relatedObjectId);
    assert.throws(() => createTaskRecord(selected, staleContext, recordId, now), /available object/);
  }
});

test('trusted metadata comes from context and save parameters, not crafted draft properties', () => {
  const crafted = draft({
    name: '  Review the invoice  ', description: '  Check all tax amounts.  ', relatedObjectId: 'invoice-1',
    id: 'spoofed-id', source: 'Automatic', createdByEmail: 'spoofed@example.com', createdByName: 'Spoofed Creator', createdAt: '1900-01-01',
    organizationName: 'Spoofed Organization', assignedToName: 'Spoofed User', assignedToEmail: 'spoofed@example.com', assignedToAudience: 'External users',
    relatedObject: { id: 'invoice-2', organizationId: 'company-2', label: 'Spoofed object', type: 'Invoice' },
    status: 'Inactive', taskStatus: 'Completed', resolvedAt: now, requiresAction: false, daysTillRemind: '90',
  });
  const current = context();
  const created = createTaskRecord(crafted, current, recordId, now);
  assert.equal(created.id, recordId);
  assert.equal(created.name, 'Review the invoice');
  assert.equal(created.message, 'Check all tax amounts.');
  assert.equal(created.source, 'Manual');
  assert.equal(created.createdByEmail, current.session.email);
  assert.equal(created.createdByName, current.session.fullName);
  assert.equal(created.createdAt, now);
  assert.equal(created.organizationName, 'First Organization');
  assert.equal(created.assignedToName, 'First Accountant');
  assert.equal(created.assignedToEmail, 'first@example.com');
  assert.equal(created.assignedToAudience, 'Internal users');
  assert.deepEqual(created.relatedObject, current.relatedObjects.find(object => object.id === 'invoice-1'));
  assert.equal(created.status, 'Active');
  assert.equal(created.taskStatus, 'Open');
  assert.equal(created.resolvedAt, undefined);
  assert.equal(created.requiresAction, true);
  assert.equal(created.daysTillRemind, '');
});

test('creator identity requires a signed-in email and falls back to email when name is absent', () => {
  const emailOnly = context({ session: { email: 'creator@example.com', fullName: '' } });
  assert.equal(createTaskRecord(draft(), emailOnly, recordId, now).createdByName, 'creator@example.com');
  for (const email of ['', ' \t ']) {
    assert.throws(() => createTaskRecord(draft(), context({ session: { email, fullName: 'No Session' } }), recordId, now), /signed-in user/);
  }
});

test('record retains the complete task metadata through the existing JSON persistence format', () => {
  const selected = draft({ assignedToId: 'external:client-1', relatedObjectId: 'document-1', description: 'Please review.' });
  const saved = JSON.parse(JSON.stringify(createTaskRecord(selected, context(), recordId, now)));
  assert.deepEqual(saved, {
    id: recordId, name: 'Review the invoice', type: 'Review', message: 'Please review.',
    organizationId: 'company-1', organizationName: 'First Organization',
    assignedToId: 'external:client-1', assignedToName: 'First Client', assignedToEmail: 'client@example.com', assignedToAudience: 'External users',
    dueDate: '2026-09-30', reminder: 'none', priority: 'Normal', relatedObject: { id: 'document-1', organizationId: 'company-1', type: 'Document', label: 'Delivery document' },
    source: 'Manual', createdByEmail: 'creator@example.com', createdByName: 'Task Creator', createdAt: now,
    status: 'Active', taskStatus: 'Open', requiresAction: true, daysTillRemind: '',
  });
  assert.equal(Object.hasOwn(saved, 'category'), false);
});

test('validation and creation leave drafts and eligible context data unchanged', () => {
  const selected = freezeDeep(draft({ relatedObjectId: 'invoice-1', description: '  Review details.  ' }));
  const current = freezeDeep(context({ organizationContextId: 'company-1' }));
  const before = JSON.stringify({ selected, current });
  assert.deepEqual(validateTaskDraft(selected, current), {});
  const created = createTaskRecord(selected, current, recordId, now);
  assert.notEqual(created, selected);
  assert.equal(created.message, 'Review details.');
  assert.equal(JSON.stringify({ selected, current }), before);
});

test('editing permits reassignment and refreshes assignment metadata from the eligible user', () => {
  const existing = createTaskRecord(draft(), context(), recordId, now);
  const edited = updateTaskRecord(existing, draft({
    name: '  Request confirmation  ', type: 'Request', assignedToId: 'external:client-1',
    dueDate: '2026-10-15', description: '  Confirm the invoice details.  ',
    assignedToName: 'Forged assignee', assignedToEmail: 'forged@example.com', assignedToAudience: 'Internal users',
  }), context());
  assert.equal(edited.name, 'Request confirmation');
  assert.equal(edited.type, 'Request');
  assert.equal(edited.message, 'Confirm the invoice details.');
  assert.equal(edited.dueDate, '2026-10-15');
  assert.equal(edited.assignedToId, 'external:client-1');
  assert.equal(edited.assignedToName, 'First Client');
  assert.equal(edited.assignedToEmail, 'client@example.com');
  assert.equal(edited.assignedToAudience, 'External users');
  assert.equal(existing.assignedToId, 'internal:accountant-1');
});

test('editing replaces or clears the related object without retaining a stale link', () => {
  const current = context();
  const existing = createTaskRecord(draft({ relatedObjectId: 'document-1' }), current, recordId, now);
  const replacement = updateTaskRecord(existing, draft({ relatedObjectId: 'invoice-1' }), current);
  const target = current.relatedObjects.find(object => object.id === 'invoice-1');
  assert.deepEqual(replacement.relatedObject, target);
  assert.notEqual(replacement.relatedObject, target);
  assert.equal(existing.relatedObject.id, 'document-1');
  const cleared = updateTaskRecord(replacement, draft({ relatedObjectId: '', description: '' }), current);
  assert.equal(cleared.relatedObject, undefined);
  assert.equal(cleared.message, '');
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(cleared)), 'relatedObject'), false);
  assert.equal(replacement.relatedObject.id, 'invoice-1');
});

test('editing validates all five required fields and rejects invalid calendar dates', () => {
  const existing = createTaskRecord(draft(), context(), recordId, now);
  for (const field of ['name', 'type', 'organizationId', 'assignedToId', 'dueDate']) {
    assert.throws(() => updateTaskRecord(existing, draft({ [field]: '' }), context()), field);
  }
  for (const dueDate of ['2026-02-29', '2026-09-31', '2026-9-15', '2026-09-15T00:00:00Z']) {
    assert.throws(() => updateTaskRecord(existing, draft({ dueDate }), context()), /valid due date/);
  }
  assert.equal(updateTaskRecord(existing, draft({ dueDate: '2028-02-29' }), context()).dueDate, '2028-02-29');
});

test('editing a legacy type requires an explicit new type and never silently maps the old value', () => {
  for (const type of ['Scheduled', 'Deadline', 'Recurring', 'Maintenance']) {
    const existing = { ...createTaskRecord(draft(), context(), recordId, now), type };
    assert.throws(() => updateTaskRecord(existing, draft({ type }), context()), /Select a task type/);
    const edited = updateTaskRecord(existing, draft({ type: 'To-do' }), context());
    assert.equal(edited.type, 'To-do');
    assert.equal(existing.type, type);
  }
});

test('organization context locks updates against crafted cross-organization reassignment', () => {
  const existing = createTaskRecord(draft(), context(), recordId, now);
  const crafted = draft({
    organizationId: 'company-2', assignedToId: 'internal:accountant-2', relatedObjectId: 'invoice-2',
    organizationContextId: 'company-2',
  });
  assert.throws(() => updateTaskRecord(existing, crafted, context({ organizationContextId: 'company-1' })), /cannot be changed/);
  const allowed = updateTaskRecord(existing, crafted, context());
  assert.equal(allowed.organizationId, 'company-2');
  assert.equal(allowed.organizationName, 'Second Organization');
  assert.equal(allowed.assignedToId, 'internal:accountant-2');
  assert.equal(allowed.relatedObject.organizationId, 'company-2');
  assert.equal(existing.organizationId, 'company-1');
});

test('editing rejects unavailable organizations, stale assignees, and stale or cross-organization objects', () => {
  const current = context();
  const selected = draft({ relatedObjectId: 'invoice-1' });
  const existing = createTaskRecord(selected, current, recordId, now);
  const cases = [
    [selected, context({ organizations: [] })],
    [selected, context({ assignees: [] })],
    [selected, context({ relatedObjects: [] })],
    [draft({ assignedToId: 'internal:accountant-2' }), current],
    [draft({ relatedObjectId: 'invoice-2' }), current],
    [draft({ relatedObjectId: 'missing-object' }), current],
  ];
  for (const [changedDraft, changedContext] of cases) {
    assert.throws(() => updateTaskRecord(existing, changedDraft, changedContext));
  }
});

test('editing preserves immutable identity, provenance, lifecycle and all non-form metadata', () => {
  const editableKeys = new Set([
    'name', 'type', 'message', 'organizationId', 'organizationName', 'assignedToId',
    'assignedToName', 'assignedToEmail', 'assignedToAudience', 'dueDate', 'reminder', 'relatedObject',
  ]);
  for (const lifecycle of [
    { status: 'Active', taskStatus: 'Open', resolvedAt: undefined },
    { status: 'Inactive', taskStatus: 'Completed', resolvedAt: now },
    { status: 'Inactive', taskStatus: 'Cancelled', resolvedAt: now },
  ]) {
    const existing = freezeDeep({
      ...createTaskRecord(draft({ relatedObjectId: 'document-1' }), context(), recordId, now),
      ...lifecycle,
      source: 'Imported', createdByEmail: 'original@example.com', createdByName: 'Original Creator',
      createdAt: '2026-08-10T08:00:00.000Z', requiresAction: false, daysTillRemind: '7',
      actionId: 'original-action', relevantRoles: ['Accountant'], recipientEmails: ['first@example.com'],
      readAtByEmail: { 'first@example.com': now }, customMetadata: { label: 'Keep me' },
    });
    const changedDraft = freezeDeep(draft({
      type: 'Approval', assignedToId: 'external:client-1', relatedObjectId: 'invoice-1',
      id: 'forged-id', source: 'Forged', createdByEmail: 'forged@example.com', createdByName: 'Forged', createdAt: '1900-01-01',
      status: 'Active', taskStatus: 'Open', resolvedAt: undefined, requiresAction: true,
      daysTillRemind: '999', actionId: 'forged-action', relevantRoles: [], recipientEmails: [],
      readAtByEmail: {}, customMetadata: { label: 'Do not copy me' },
    }));
    const current = freezeDeep(context({ session: { email: 'editor@example.com', fullName: 'Different Editor' } }));
    const before = JSON.stringify({ existing, changedDraft, current });
    const edited = updateTaskRecord(existing, changedDraft, current);
    assert.notEqual(edited, existing);
    assert.equal(edited.type, 'Approval');
    assert.equal(edited.assignedToId, 'external:client-1');
    const preserved = value => Object.fromEntries(Object.entries(value).filter(([key]) => !editableKeys.has(key)));
    assert.deepEqual(preserved(edited), preserved(existing));
    assert.equal(JSON.stringify({ existing, changedDraft, current }), before);
  }
});

test('editing requires a signed-in context without replacing the original creator identity', () => {
  const existing = createTaskRecord(draft(), context(), recordId, now);
  for (const email of ['', ' \t ']) {
    assert.throws(() => updateTaskRecord(existing, draft(), context({ session: { email, fullName: 'No Session' } })), /signed-in user/);
  }
  const edited = updateTaskRecord(existing, draft(), context({ session: { email: 'editor@example.com', fullName: 'Different Editor' } }));
  assert.equal(edited.createdByEmail, existing.createdByEmail);
  assert.equal(edited.createdByName, existing.createdByName);
});

test('conflict guard rejects concurrent lifecycle and reassignment changes', () => {
  const original = createTaskRecord(draft(), context(), recordId, now);
  const changedRows = [
    { ...original, status: 'Inactive', taskStatus: 'Completed', resolvedAt: now },
    { ...original, status: 'Inactive', taskStatus: 'Cancelled', resolvedAt: now },
    { ...original, requiresAction: false },
    { ...original, assignedToId: 'external:client-1', assignedToName: 'First Client', assignedToEmail: 'client@example.com', assignedToAudience: 'External users' },
  ];
  for (const current of changedRows) {
    assert.throws(() => assertTaskUnchanged(current, original), /changed while the editor was open.*refresh the list/);
  }
});

test('conflict guard rejects concurrent task, object, provenance, and other metadata changes', () => {
  const original = createTaskRecord(draft({ relatedObjectId: 'document-1' }), context(), recordId, now);
  const changes = [
    { name: 'Someone renamed this task' },
    { type: 'Approval' },
    { dueDate: '2026-10-01' },
    { reminder: '3_days_before' },
    { message: 'New description' },
    { organizationId: 'company-2' },
    { relatedObject: undefined },
    { relatedObject: { ...original.relatedObject, label: 'Updated object label' } },
    { source: 'Imported' },
    { createdByEmail: 'corrected@example.com' },
    { createdAt: '2026-08-10T08:00:00.000Z' },
    { recipientEmails: ['someone@example.com'] },
    { customMetadata: { label: 'New metadata' } },
  ];
  for (const change of changes) {
    assert.throws(() => assertTaskUnchanged({ ...original, ...change }, original), /changed while the editor was open/);
  }
});

test('conflict guard allows personal read receipts to change, appear, or disappear', () => {
  const original = createTaskRecord(draft(), context(), recordId, now);
  const read = { ...original, readAtByEmail: { 'reader@example.com': now } };
  const anotherRead = { ...original, readAtByEmail: { 'reader@example.com': '2026-09-16T09:00:00.000Z', 'another@example.com': now } };
  assert.doesNotThrow(() => assertTaskUnchanged(read, original));
  assert.doesNotThrow(() => assertTaskUnchanged(original, read));
  assert.doesNotThrow(() => assertTaskUnchanged(anotherRead, read));
  assert.throws(() => assertTaskUnchanged({ ...anotherRead, taskStatus: 'Completed' }, read), /changed while the editor was open/);
});

test('conflict guard treats undefined as missing and ignores property order without ignoring metadata', () => {
  const original = {
    ...createTaskRecord(draft({ relatedObjectId: 'invoice-1' }), context(), recordId, now),
    resolvedAt: undefined,
    customMetadata: { first: 1, second: 2, omitted: undefined },
  };
  const current = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(original))).reverse());
  current.customMetadata = { second: 2, first: 1 };
  current.relatedObject = Object.fromEntries(Object.entries(current.relatedObject).reverse());
  assert.doesNotThrow(() => assertTaskUnchanged(current, original));
  assert.throws(() => assertTaskUnchanged({ ...current, resolvedAt: null }, original), /changed while the editor was open/);
  const nestedOriginal = { ...original, customMetadata: { readAtByEmail: { reader: now } } };
  const nestedChanged = { ...nestedOriginal, customMetadata: { readAtByEmail: {} } };
  assert.throws(() => assertTaskUnchanged(nestedChanged, nestedOriginal), /changed while the editor was open/);
});

test('conflict guard leaves current and original task records unchanged', () => {
  const original = freezeDeep({
    ...createTaskRecord(draft({ relatedObjectId: 'invoice-1' }), context(), recordId, now),
    relevantRoles: ['Accountant'], customMetadata: { nested: ['keep', { value: 1 }] },
  });
  const current = freezeDeep({ ...original, readAtByEmail: { 'reader@example.com': now } });
  const before = JSON.stringify({ original, current });
  assert.doesNotThrow(() => assertTaskUnchanged(current, original));
  assert.throws(() => assertTaskUnchanged(freezeDeep({ ...current, name: 'Changed' }), original));
  assert.equal(JSON.stringify({ original, current }), before);
});
