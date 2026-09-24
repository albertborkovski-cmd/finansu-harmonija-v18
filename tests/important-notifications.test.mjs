import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/notifications.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { isImportantNotification, getRelevantActionsForTab } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const alert = { id: 'error-1', category: 'notifications', status: 'Active', origin: 'system',
  severity: 'Critical', requiresAction: true, eventKind: 'process-error', outcome: 'failure',
  type: 'Bank', name: 'Bank synchronization failed', message: 'Authentication error' };

test('only active important process errors and exceptions needing attention qualify', () => {
  assert.equal(isImportantNotification(alert), true);
  assert.equal(isImportantNotification({ ...alert, severity: 'Warning', eventKind: 'process-exception' }), true);
  for (const patch of [
    { status: 'Inactive' }, { severity: 'Info' }, { severity: undefined },
    { requiresAction: false }, { requiresAction: undefined }, { origin: 'manual' },
    { eventKind: 'information' }, { eventKind: undefined }, { outcome: 'success' },
    { category: 'reminders' }, { sourceTaskId: 'task-1' }, { sourceChatId: 'chat-1' },
    { type: 'Audit' }, { type: 'Chat' }, { type: 'Tasks' }, { resolvedAt: '2026-09-24' },
  ]) assert.equal(isImportantNotification({ ...alert, ...patch }), false, JSON.stringify(patch));
});

test('personal read state does not resolve an active process error', () => {
  assert.equal(isImportantNotification({ ...alert, readAtByEmail: { 'user@example.com': '2026-09-24' } }), true);
});

test('routine successful events stay in View all but never qualify for the bell', () => {
  const session = { email: 'user@example.com', roleNames: [] };
  for (const name of ['Reconciliation completed', 'Export completed', 'Document uploaded', 'Bank synchronization completed', 'Declaration accepted', 'Payment approved']) {
    const row = { ...alert, name, message: 'Routine process event', outcome: undefined };
    assert.equal(isImportantNotification(row), false, name);
    assert.equal(getRelevantActionsForTab([row], session, 'notifications').length, 1, name);
  }
});

test('a failed process is not hidden merely because its details mention an earlier success', () => {
  assert.equal(isImportantNotification({ ...alert, message: 'Previous synchronization completed successfully; the current attempt failed.' }), true);
});
