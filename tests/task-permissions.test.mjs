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
const accessUrl = moduleUrl(transpile('../src/lib/accessControl.ts'));
const notificationsUrl = moduleUrl(transpile('../src/lib/notifications.ts'));
const permissionsSource = transpile('../src/lib/taskPermissions.ts')
  .replace(/(['"])\.\/accessControl\1/g, JSON.stringify(accessUrl))
  .replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl));
const { getTaskActionVisibility, getTaskPermissions, transitionTask } = await import(moduleUrl(permissionsSource));
const { createFullViewAccess, createMenuAccessFromModules, canEditMenu } = await import(accessUrl);
const { getTaskStatus, getAttentionNotifications, getNotificationTabCounts, getOrganizationRequiredActions } = await import(notificationsUrl);

const now = '2026-09-15T09:00:00.000Z';
const denied = { edit: false, complete: false, cancel: false };

function session(email = 'creator@example.com', patch = {}) {
  const access = createFullViewAccess();
  return { email, fullName: 'Task User', roleNames: ['Accountant'], access, menuAccess: createMenuAccessFromModules(access), ...patch };
}

function task(patch = {}) {
  return {
    id: 'task-1', name: 'Review invoice', type: 'Review', message: 'Check the invoice.',
    status: 'Active', taskStatus: 'Open', requiresAction: true, daysTillRemind: '',
    organizationId: 'company-1', organizationName: 'First Organization',
    createdByEmail: 'creator@example.com', createdByName: 'Task Creator',
    assignedToEmail: 'assignee@example.com', assignedToName: 'Task Assignee', assignedToId: 'Internal users:assignee',
    source: 'Manual', createdAt: '2026-09-01T08:00:00.000Z', dueDate: '2026-09-30',
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

test('creator may edit and cancel while assignee may complete without generic edit permission', () => {
  const creator = session();
  const assignee = session('assignee@example.com');
  assert.equal(canEditMenu(creator, 'notifications'), false);
  assert.equal(canEditMenu(assignee, 'notifications'), false);
  assert.deepEqual(getTaskPermissions(task(), creator), { edit: true, complete: false, cancel: true });
  assert.deepEqual(getTaskPermissions(task(), assignee), { edit: false, complete: true, cancel: false });
  assert.deepEqual(getTaskPermissions(task({ assignedToEmail: creator.email }), creator), { edit: true, complete: true, cancel: true });
});

test('only exact existing Administrator and Administration roles receive the system override', () => {
  for (const role of ['Administrator', 'Administration', ' administrator ', ' AdMiNiStRaTiOn ']) {
    assert.deepEqual(getTaskPermissions(task(), session('admin@example.com', { roleNames: [role] })), { edit: true, complete: true, cancel: true });
  }
  for (const role of ['Admin', 'System administrator', 'Company Administrator', 'Superadministrator', 'Administrator assistant']) {
    assert.deepEqual(getTaskPermissions(task(), session('other@example.com', { roleNames: [role] })), denied, role);
  }
});

test('unrelated users gain no row actions from generic notifications edit permission', () => {
  const unrelated = session('unrelated@example.com');
  unrelated.access.notifications.edit = true;
  unrelated.menuAccess.notifications.edit = true;
  assert.equal(canEditMenu(unrelated, 'notifications'), true);
  assert.deepEqual(getTaskPermissions(task(), unrelated), denied);
  assert.throws(() => transitionTask(task(), unrelated, 'complete'), /permission/);
  assert.throws(() => transitionTask(task(), unrelated, 'cancel'), /permission/);
});

test('identity comparisons are exact, nonblank, and case/whitespace insensitive', () => {
  const item = task({ createdByEmail: ' CREATOR@EXAMPLE.COM ', assignedToEmail: ' ASSIGNEE@EXAMPLE.COM ' });
  assert.deepEqual(getTaskPermissions(item, session('  Creator@Example.Com  ')), { edit: true, complete: false, cancel: true });
  assert.deepEqual(getTaskPermissions(item, session(' Assignee@Example.Com ')), { edit: false, complete: true, cancel: false });
  assert.deepEqual(getTaskPermissions(item, session('creator+other@example.com')), denied);
  assert.deepEqual(getTaskPermissions(item, session('othercreator@example.com')), denied);
  for (const email of ['', ' \t ']) {
    assert.deepEqual(getTaskPermissions(task({ createdByEmail: email, assignedToEmail: email }), session(email)), denied);
    assert.deepEqual(getTaskPermissions(task(), session(email, { roleNames: ['Administrator'] })), denied);
  }
});

test('legacy display names and assignee IDs never substitute for missing email identities', () => {
  const viewer = session('legacy@example.com', { fullName: 'Legacy User' });
  const legacy = task({
    createdByEmail: undefined, createdByName: 'Legacy User',
    assignedToEmail: undefined, assignedToName: 'Legacy User', assignedToId: 'legacy@example.com',
  });
  assert.deepEqual(getTaskPermissions(legacy, viewer), denied);
  assert.deepEqual(getTaskPermissions(legacy, session('admin@example.com', { roleNames: ['Administrator'] })), { edit: true, complete: true, cancel: true });
});

test('notifications view permission is required even for creators, assignees and administrators', () => {
  for (const viewer of [session(), session('assignee@example.com'), session('admin@example.com', { roleNames: ['Administrator'] })]) {
    viewer.menuAccess.notifications = { view: false, edit: true };
    assert.deepEqual(getTaskPermissions(task(), viewer), denied);
    assert.throws(() => transitionTask(task(), viewer, 'complete'), /permission/);
    assert.throws(() => transitionTask(task(), viewer, 'cancel'), /permission/);
  }
  const noModuleView = session();
  delete noModuleView.menuAccess.notifications;
  noModuleView.access.notifications.view = false;
  assert.deepEqual(getTaskPermissions(task(), noModuleView), denied);
});

test('record role and recipient restrictions gate every action including admin overrides', () => {
  const creator = session();
  const assignee = session('assignee@example.com');
  const admin = session('admin@example.com', { roleNames: ['Administrator'] });
  for (const viewer of [creator, assignee, admin]) {
    assert.deepEqual(getTaskPermissions(task({ relevantRoles: ['Unrelated role'] }), viewer), denied);
    assert.deepEqual(getTaskPermissions(task({ recipientEmails: ['someone-else@example.com'] }), viewer), denied);
    assert.deepEqual(getTaskPermissions(task({ relevantRoles: viewer.roleNames, recipientEmails: ['someone-else@example.com'] }), viewer), denied);
  }
  const visible = task({ relevantRoles: [' ACCOUNTANT '], recipientEmails: [' CREATOR@EXAMPLE.COM '] });
  assert.deepEqual(getTaskPermissions(visible, session(' Creator@Example.Com ')), { edit: true, complete: false, cancel: true });
  assert.deepEqual(getTaskPermissions(task({ relevantRoles: [], recipientEmails: [] }), creator), { edit: true, complete: false, cancel: true });
});

test('terminal tasks remain editable by creator/admin but cannot be completed, cancelled, or reopened', () => {
  for (const terminal of [
    task({ status: 'Inactive', taskStatus: 'Completed', resolvedAt: now }),
    task({ status: 'Inactive', taskStatus: 'Cancelled', resolvedAt: now }),
    task({ taskStatus: undefined, status: 'Inactive' }),
    task({ taskStatus: 'Open', resolvedAt: now }),
  ]) {
    assert.deepEqual(getTaskPermissions(terminal, session()), { edit: true, complete: false, cancel: false });
    assert.deepEqual(getTaskPermissions(terminal, session('assignee@example.com')), denied);
    assert.deepEqual(getTaskPermissions(terminal, session('admin@example.com', { roleNames: ['Administrator'] })), { edit: true, complete: false, cancel: false });
    for (const action of ['complete', 'cancel']) {
      assert.throws(() => transitionTask(terminal, session('admin@example.com', { roleNames: ['Administrator'] }), action), /no longer Open/);
    }
  }
});

test('eligible action buttons remain visible for Completed and Cancelled tasks but are not enabled', () => {
  const viewers = [
    [session(), { edit: true, complete: false, cancel: true }],
    [session('assignee@example.com'), { edit: false, complete: true, cancel: false }],
    [session('admin@example.com', { roleNames: ['Administrator'] }), { edit: true, complete: true, cancel: true }],
    [session('admin@example.com', { roleNames: ['Administration'] }), { edit: true, complete: true, cancel: true }],
  ];
  for (const [viewer, expectedVisibility] of viewers) {
    for (const taskStatus of ['Open', 'Completed', 'Cancelled']) {
      const item = task({ taskStatus, status: taskStatus === 'Open' ? 'Active' : 'Inactive', resolvedAt: taskStatus === 'Open' ? undefined : now });
      assert.deepEqual(getTaskActionVisibility(item, viewer), expectedVisibility);
      assert.deepEqual(getTaskPermissions(item, viewer), {
        edit: expectedVisibility.edit,
        complete: expectedVisibility.complete && taskStatus === 'Open',
        cancel: expectedVisibility.cancel && taskStatus === 'Open',
      });
    }
  }
});

test('completing or cancelling preserves eligible action visibility and prevents repeated transitions', () => {
  const viewer = session('admin@example.com', { roleNames: ['Administrator'] });
  const original = task();
  const visibility = getTaskActionVisibility(original, viewer);
  for (const action of ['complete', 'cancel']) {
    const terminal = transitionTask(original, viewer, action, now);
    assert.deepEqual(getTaskActionVisibility(terminal, viewer), visibility);
    assert.deepEqual(getTaskPermissions(terminal, viewer), { edit: true, complete: false, cancel: false });
    assert.throws(() => transitionTask(terminal, viewer, 'complete'), /no longer Open/);
    assert.throws(() => transitionTask(terminal, viewer, 'cancel'), /no longer Open/);
  }
});

test('terminal lifecycle never exposes action buttons to unauthorized identities or restricted viewers', () => {
  for (const taskStatus of ['Completed', 'Cancelled']) {
    const terminal = task({ taskStatus, status: 'Inactive', resolvedAt: now });
    const unrelated = session('unrelated@example.com');
    unrelated.menuAccess.notifications.edit = true;
    unrelated.access.notifications.edit = true;
    assert.deepEqual(getTaskActionVisibility(terminal, unrelated), denied);
    assert.deepEqual(getTaskActionVisibility(terminal, session('other@example.com', { roleNames: ['Company Administrator'] })), denied);
    assert.deepEqual(getTaskActionVisibility(terminal, session(' ', { roleNames: ['Administrator'] })), denied);
    assert.deepEqual(getTaskActionVisibility({ ...terminal, createdByEmail: undefined, assignedToEmail: undefined }, session()), denied);
    for (const viewer of [session(), session('assignee@example.com'), session('admin@example.com', { roleNames: ['Administrator'] })]) {
      const noView = { ...viewer, menuAccess: { ...viewer.menuAccess, notifications: { view: false, edit: true } } };
      assert.deepEqual(getTaskActionVisibility(terminal, noView), denied);
      assert.deepEqual(getTaskActionVisibility({ ...terminal, relevantRoles: ['Unrelated role'] }, viewer), denied);
      assert.deepEqual(getTaskActionVisibility({ ...terminal, recipientEmails: ['someone-else@example.com'] }, viewer), denied);
    }
  }
});

test('legacy terminal state affects action enablement but not authorized button visibility', () => {
  const viewer = session('assignee@example.com');
  for (const terminal of [task({ taskStatus: undefined, status: 'Inactive' }), task({ taskStatus: 'Open', resolvedAt: now })]) {
    assert.deepEqual(getTaskActionVisibility(terminal, viewer), { edit: false, complete: true, cancel: false });
    assert.deepEqual(getTaskPermissions(terminal, viewer), denied);
  }
});

test('legacy active tasks support the authorized terminal transitions without fabricated creator identity', () => {
  const legacy = task({ taskStatus: undefined, createdByEmail: undefined });
  assert.deepEqual(getTaskPermissions(legacy, session('assignee@example.com')), { edit: false, complete: true, cancel: false });
  const completed = transitionTask(legacy, session('assignee@example.com'), 'complete', now);
  assert.equal(getTaskStatus(completed), 'Completed');
  assert.equal(completed.createdByEmail, undefined);
});

test('completion and cancellation set terminal state, resolution time, and no required action', () => {
  for (const [action, viewer, expected] of [
    ['complete', session('assignee@example.com'), 'Completed'],
    ['cancel', session(), 'Cancelled'],
    ['complete', session('admin@example.com', { roleNames: ['Administration'] }), 'Completed'],
    ['cancel', session('admin@example.com', { roleNames: ['Administrator'] }), 'Cancelled'],
  ]) {
    const original = task();
    const result = transitionTask(original, viewer, action, now);
    assert.equal(result.taskStatus, expected);
    assert.equal(result.status, 'Inactive');
    assert.equal(result.resolvedAt, now);
    assert.equal(result.requiresAction, false);
    assert.equal(original.taskStatus, 'Open');
    assert.equal(original.requiresAction, true);
  }
});

test('transitions recheck the current task and current session rather than relying on old permission results', () => {
  const original = task();
  const assignee = session('assignee@example.com');
  assert.equal(getTaskPermissions(original, assignee).complete, true);
  assert.throws(() => transitionTask({ ...original, assignedToEmail: 'another@example.com' }, assignee, 'complete'), /permission/);
  assert.throws(() => transitionTask({ ...original, recipientEmails: ['someone@example.com'] }, assignee, 'complete'), /permission/);
  const noView = { ...assignee, menuAccess: { ...assignee.menuAccess, notifications: { view: false, edit: false } } };
  assert.throws(() => transitionTask(original, noView, 'complete'), /permission/);
  const completed = transitionTask(original, assignee, 'complete', now);
  assert.throws(() => transitionTask(completed, assignee, 'complete'), /no longer Open/);
});

test('unsupported reopen and delete actions are rejected without mutating the task', () => {
  const original = task();
  const before = JSON.stringify(original);
  for (const action of ['reopen', 'delete', 'Open', '', undefined]) {
    assert.throws(() => transitionTask(original, session('admin@example.com', { roleNames: ['Administrator'] }), action), /Unsupported task action/);
  }
  assert.equal(JSON.stringify(original), before);
});

test('terminal transitions retain history records and other rows while reducing Open and required-action counts', () => {
  const rows = [task(), task({ id: 'other-open' }), task({ id: 'old-completed', status: 'Inactive', taskStatus: 'Completed', resolvedAt: now, requiresAction: false })];
  const viewer = session('assignee@example.com');
  const before = getAttentionNotifications([], rows, true);
  assert.equal(getNotificationTabCounts(before, viewer).reminders, 2);
  assert.equal(getOrganizationRequiredActions(before, 'company-1', viewer).length, 2);
  const afterRows = rows.map(row => row.id === 'task-1' ? transitionTask(row, viewer, 'complete', now) : row);
  const after = getAttentionNotifications([], afterRows, true);
  assert.equal(afterRows.length, rows.length);
  assert.deepEqual(afterRows.map(row => row.id), rows.map(row => row.id));
  assert.equal(afterRows[1], rows[1]);
  assert.equal(afterRows[2], rows[2]);
  assert.equal(after.some(row => row.id === 'task-1' && row.taskStatus === 'Completed'), true);
  assert.equal(getNotificationTabCounts(after, viewer).reminders, 1);
  assert.equal(getOrganizationRequiredActions(after, 'company-1', viewer).length, 1);
  assert.equal(rows[0].taskStatus, 'Open');
});

test('permission checks and transitions preserve immutable identity, content, provenance and other metadata', () => {
  const original = freezeDeep(task({
    relevantRoles: ['Accountant'], recipientEmails: ['assignee@example.com'],
    relatedObject: { id: 'invoice-1', organizationId: 'company-1', type: 'Invoice', label: 'Invoice 1' },
    readAtByEmail: { 'assignee@example.com': now }, actionId: 'task-action', customMetadata: { flag: true },
  }));
  const viewer = freezeDeep(session('assignee@example.com'));
  const before = JSON.stringify({ original, viewer });
  assert.deepEqual(getTaskActionVisibility(original, viewer), { edit: false, complete: true, cancel: false });
  assert.deepEqual(getTaskPermissions(original, viewer), { edit: false, complete: true, cancel: false });
  const result = transitionTask(original, viewer, 'complete', now);
  assert.notEqual(result, original);
  const mutable = new Set(['taskStatus', 'status', 'resolvedAt', 'requiresAction']);
  const unchanged = record => Object.fromEntries(Object.entries(record).filter(([key]) => !mutable.has(key)));
  assert.deepEqual(unchanged(result), unchanged(original));
  assert.equal(JSON.stringify({ original, viewer }), before);
});
