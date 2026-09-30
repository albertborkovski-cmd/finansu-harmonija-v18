import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const notificationsUrl = moduleUrl(transpile('../src/lib/notifications.ts'));
const replaceNotifications = source => source.replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl));
const { publishChatMessageNotification, markChatNotificationsRead } = await import(moduleUrl(replaceNotifications(transpile('../src/lib/chatNotifications.ts'))));
const { getAttentionNotifications, getRelevantActionsForTab, getNotificationTabCounts, SAMPLE_NOTIFICATIONS, setNotificationRead, isNotificationRead } = await import(notificationsUrl);
const { getNotificationActionLabel, isSystemNotification } = await import(moduleUrl(transpile('../src/lib/notificationPresentation.ts')));
const scheduleUrl = moduleUrl(replaceNotifications(transpile('../src/lib/taskSchedule.ts')));
const { getDashboardAttentionNotifications } = await import(moduleUrl(replaceNotifications(transpile('../src/lib/notificationAttention.ts'))
  .replace(/(['"])\.\/taskSchedule\1/g, JSON.stringify(scheduleUrl))));

const KEY = 'finansu-harmonija:v7:notifications';
const sourceKey = 'finansu-harmonija:v12:invoice-chat:thread-1';
const context = (patch = {}) => ({
  storageKey: 'thread-1', organizationId: 'org-1', companyName: 'First Organization',
  title: 'First Organization / Invoice question', subject: 'Invoice question',
  createdByEmail: 'sender@example.com', recipientEmail: 'recipient@example.com',
  participantType: 'MESO accountant', aiEnabled: false,
  ...patch,
});
const message = (patch = {}) => ({
  id: 'message-1', author: 'Original Sender', authorEmail: 'sender@example.com',
  authorType: 'Client', sentAt: '2026-09-15T08:30:00.000Z', date: '2026-09-15',
  text: 'Please review the attached invoice.', direction: 'written', ...patch,
});
const viewer = (email = 'recipient@example.com') => ({ email, roleNames: ['Accountant'] });

function setup(initial = [], extra = []) {
  const values = new Map(extra);
  if (initial !== undefined) values.set(KEY, typeof initial === 'string' ? initial : JSON.stringify(initial));
  const writes = [];
  const events = [];
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); values.set(key, value); },
  };
  globalThis.window = { localStorage: storage, dispatchEvent: event => events.push(event) };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  return { values, writes, events, storage, rows: () => JSON.parse(storage.getItem(KEY) ?? '[]') };
}

test('chat read receipts clear existing alerts but not later messages or another recipient', () => {
  const state = setup([], [[sourceKey, JSON.stringify([message(), message({ id: 'message-2', sentAt: '2026-09-15T09:00:00.000Z' })])],
    ['finansu-harmonija:v14:chat-read:recipient%40example.com:thread-1', 'message-1']]);
  publishChatMessageNotification(context(), message());
  publishChatMessageNotification(context(), message({ id: 'message-2', sentAt: '2026-09-15T09:00:00.000Z' }));
  const [first, second] = state.rows();
  assert.equal(isNotificationRead(first, 'recipient@example.com'), true);
  assert.equal(isNotificationRead(second, 'recipient@example.com'), false);
  assert.equal(isNotificationRead(first, 'someone@example.com'), false);
  const legacy = { ...first, sourceChatId: undefined, sourceMessageId: undefined };
  assert.equal(isNotificationRead(legacy, 'recipient@example.com'), false);
  state.storage.setItem('finansu-harmonija:v14:chat-read:recipient%40example.com:thread-1', 'message-2');
  assert.equal(isNotificationRead(legacy, 'recipient@example.com'), true);
  assert.equal(getDashboardAttentionNotifications([{ ...legacy, category: 'notifications' }], viewer()).length, 0);
});

test('persisted incoming chat emits a recipient-only immutable system signal with canonical Open chat target', () => {
  const originalContext = Object.freeze(context());
  const originalMessage = Object.freeze(message());
  const history = JSON.stringify([originalMessage]);
  const state = setup([], [[sourceKey, history]]);
  const before = JSON.stringify({ originalContext, originalMessage });
  assert.equal(publishChatMessageNotification(originalContext, originalMessage), true);
  const [row] = state.rows();
  assert.deepEqual(row.recipientEmails, ['recipient@example.com']);
  assert.equal(row.sourceChatId, 'thread-1');
  assert.equal(row.sourceMessageId, 'message-1');
  assert.equal(row.createdAt, originalMessage.sentAt);
  assert.equal(row.origin, 'system');
  assert.equal(row.type, 'Chat');
  assert.equal(row.requiresAction, true);
  assert.deepEqual(row.relatedObject, { id: 'chat:thread-1', recordId: 'thread-1', type: 'Chat', organizationId: 'org-1', label: 'Invoice question' });
  assert.equal(getNotificationActionLabel(row), 'Open chat');
  assert.equal(isSystemNotification({ ...row, origin: 'manual' }), true);
  const records = getAttentionNotifications([row], [], true);
  assert.equal(getRelevantActionsForTab(records, viewer(), 'notifications').length, 1);
  assert.equal(getRelevantActionsForTab(records, viewer('sender@example.com'), 'notifications').length, 0);
  assert.equal(getRelevantActionsForTab(records, viewer('third@example.com'), 'notifications').length, 0);
  assert.deepEqual(state.writes, [KEY]);
  assert.equal(state.events[0].type, 'finansu-harmonija:persistent-state-changed');
  assert.deepEqual(state.events[0].detail, { storageKey: KEY });
  assert.equal(state.values.get(sourceKey), history);
  assert.equal(JSON.stringify({ originalContext, originalMessage }), before);
});

test('reply recipient is the original creator regardless of UI direction', () => {
  const state = setup();
  assert.equal(publishChatMessageNotification(context(), message({ authorEmail: ' RECIPIENT@EXAMPLE.COM ', direction: 'outgoing', recipientEmail: ' SENDER@EXAMPLE.COM ' }), state.storage), true);
  assert.deepEqual(state.rows()[0].recipientEmails, ['sender@example.com']);
});

test('channel email is labeled as an email but still opens the actual chat, and attachments are supported', () => {
  const state = setup();
  assert.equal(publishChatMessageNotification(context(), message({ channel: 'email', text: '', attachments: [{ name: 'invoice.pdf' }] }), state.storage), true);
  const [row] = state.rows();
  assert.equal(row.name, 'New email message');
  assert.equal(row.type, 'Email');
  assert.match(row.message, /^New email from Original Sender: invoice\.pdf$/);
  assert.equal(getNotificationActionLabel(row), 'Open chat');
});

test('deduplication is stable after reload and preserves reading history without another write or event', () => {
  const state = setup();
  assert.equal(publishChatMessageNotification(context(), message(), state.storage), true);
  const read = setNotificationRead(state.rows()[0], 'recipient@example.com', true, '2026-09-15T09:00:00.000Z');
  state.values.set(KEY, JSON.stringify([read]));
  const original = state.values.get(KEY);
  assert.equal(publishChatMessageNotification(context(), message({ text: 'A retry must not replace the delivered record.' }), state.storage), false);
  assert.equal(publishChatMessageNotification(context(), message(), { ...state.storage }), false);
  assert.equal(state.values.get(KEY), original);
  assert.deepEqual(state.writes, [KEY]);
  assert.equal(state.events.length, 1);
});

test('notification is a compact normalized snippet while the full body stays in source history', () => {
  const entry = message({ text: `First line.\n\n${'Original email body. '.repeat(40)}` });
  const history = JSON.stringify([entry]);
  const state = setup([], [[sourceKey, history]]);
  publishChatMessageNotification(context(), entry, state.storage);
  const prefix = 'New chat message from Original Sender: ';
  const snippet = state.rows()[0].message.slice(prefix.length);
  assert.equal(snippet.length, 160);
  assert.ok(snippet.endsWith('…'));
  assert.equal(snippet.includes('\n'), false);
  assert.equal(state.values.get(sourceKey), history);
  assert.equal(state.rows()[0].message.includes(entry.text), false);
});

test('event IDs isolate organization, thread, message and recipient and safely encode delimiters', () => {
  const state = setup();
  const inputs = [
    [context(), message()],
    [context({ organizationId: 'org-2' }), message()],
    [context({ storageKey: 'thread-2' }), message()],
    [context(), message({ id: 'message-2' })],
    [context({ recipientEmail: 'other@example.com' }), message()],
    [context({ storageKey: 'thread:2/%' }), message({ id: 'message:2/%' })],
  ];
  for (const [thread, entry] of inputs) assert.equal(publishChatMessageNotification(thread, entry, state.storage), true);
  assert.equal(new Set(state.rows().map(row => row.id)).size, inputs.length);
  assert.match(state.rows().at(-1).id, /thread%3A2%2F%25:message%3A2%2F%25/);
});

test('unknown sender, forged recipient, invalid identities and empty messages cannot emit notifications', () => {
  for (const patch of [
    { authorEmail: 'third@example.com' }, { authorEmail: undefined }, { authorEmail: 'not-an-email' },
    { recipientEmail: 'third@example.com' }, { recipientEmail: 'sender@example.com' }, { recipientEmail: '' },
    { id: '' }, { id: '  ' }, { sentAt: undefined }, { sentAt: 'not-a-date' }, { sentAt: '0' },
    { text: '  ', attachments: [] }, { systemEvent: 'accountant-handoff' }, { authorType: 'FH AI' },
  ]) {
    const state = setup();
    assert.equal(publishChatMessageNotification(context(), message(patch), state.storage), false, JSON.stringify(patch));
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.events, []);
  }
});

test('general, unscoped, AI, legacy and non-human-addressed conversations fail closed', () => {
  for (const patch of [
    { storageKey: '__general__' }, { storageKey: '' }, { organizationId: undefined }, { organizationId: ' ' },
    { createdByEmail: undefined }, { recipientEmail: undefined }, { recipientEmail: 'not-an-email' },
    { recipientEmail: 'SENDER@EXAMPLE.COM' }, { participantType: 'FH AI' }, { recipientId: 'fh-ai' }, { aiEnabled: true },
  ]) {
    const state = setup();
    assert.equal(publishChatMessageNotification(context(patch), message(), state.storage), false, JSON.stringify(patch));
    assert.deepEqual(state.writes, []);
  }
});

test('missing notification storage preserves sample rows, while an explicitly empty store stays empty except for the addition', () => {
  const missing = setup();
  missing.values.delete(KEY);
  publishChatMessageNotification(context(), message(), missing.storage);
  assert.deepEqual(missing.rows().slice(0, -1), SAMPLE_NOTIFICATIONS);
  const empty = setup([]);
  publishChatMessageNotification(context(), message(), empty.storage);
  assert.equal(empty.rows().length, 1);
});

test('corrupt storage is surfaced without replacing records or claiming delivery', () => {
  for (const raw of ['{broken', '{}', '[null]', '[{}]', '[4]']) {
    const state = setup(raw);
    assert.throws(() => publishChatMessageNotification(context(), message(), state.storage));
    assert.equal(state.values.get(KEY), raw);
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.events, []);
  }
  const state = setup();
  const unavailable = { ...state.storage, setItem() { throw new Error('Storage full.'); } };
  assert.throws(() => publishChatMessageNotification(context(), message(), unavailable), /Storage full/);
  assert.deepEqual(state.rows(), []);
  assert.deepEqual(state.events, []);
});

test('reading displayed messages changes only this recipient and exact organization, conversation and message identities', () => {
  const state = setup([], [[sourceKey, JSON.stringify([message()])]]);
  for (const [thread, entry] of [
    [context(), message()],
    [context(), message({ id: 'not-displayed' })],
    [context(), message({ authorEmail: 'recipient@example.com' })],
    [context({ storageKey: 'other-thread' }), message()],
    [context({ organizationId: 'other-org' }), message()],
  ]) publishChatMessageNotification(thread, entry, state.storage);
  const initial = state.rows();
  initial[0] = setNotificationRead(initial[0], 'another-reader@example.com', true, '2026-09-14T08:00:00Z');
  initial.push({ id: 'manual-without-source', name: 'Keep', status: 'Active', type: 'Chat', message: 'Keep', organizationId: 'org-1', recipientEmails: ['recipient@example.com'], relatedObject: initial[0].relatedObject });
  state.values.set(KEY, JSON.stringify(initial));
  const sourceBefore = state.values.get(sourceKey);
  const snapshot = JSON.stringify(initial.slice(1));
  assert.equal(markChatNotificationsRead(context(), ['message-1'], ' RECIPIENT@EXAMPLE.COM ', state.storage), 1);
  const after = state.rows();
  assert.equal(isNotificationRead(after[0], 'recipient@example.com'), true);
  assert.equal(after[0].readAtByEmail['another-reader@example.com'], '2026-09-14T08:00:00Z');
  assert.equal(JSON.stringify(after.slice(1)), snapshot);
  assert.equal(after[0].status, 'Active');
  assert.equal(after[0].resolvedAt, undefined);
  assert.equal(state.values.get(sourceKey), sourceBefore);
  const writes = state.writes.length;
  const events = state.events.length;
  assert.equal(markChatNotificationsRead(context(), ['message-1'], 'recipient@example.com', state.storage), 0);
  assert.equal(state.writes.length, writes);
  assert.equal(state.events.length, events);
});

test('foreign users, sender of the source message and empty selections cannot mark recipient signals read', () => {
  const state = setup();
  publishChatMessageNotification(context(), message(), state.storage);
  const before = state.values.get(KEY);
  for (const [thread, selected, identity] of [
    [context(), ['message-1'], 'third@example.com'],
    [context(), ['message-1'], 'sender@example.com'],
    [context(), [], 'recipient@example.com'],
    [context({ organizationId: 'foreign' }), ['message-1'], 'recipient@example.com'],
    [context({ storageKey: 'foreign' }), ['message-1'], 'recipient@example.com'],
  ]) assert.equal(markChatNotificationsRead(thread, selected, identity, state.storage), 0);
  assert.equal(state.values.get(KEY), before);
  assert.equal(state.writes.length, 1);
});

test('reading incoming signal clears dashboard attention but does not resolve active notifications', () => {
  const state = setup();
  publishChatMessageNotification(context(), message(), state.storage);
  const incoming = state.rows()[0];
  const ordinary = setNotificationRead({ id: 'ordinary-action', name: 'Action', type: 'System', status: 'Active', requiresAction: true, message: 'Keep' }, viewer().email, true);
  const task = { id: 'task-1', name: 'Task', type: 'Review', message: 'Keep', status: 'Active', taskStatus: 'Open', daysTillRemind: '', requiresAction: false };
  let records = getAttentionNotifications([incoming, ordinary], [task], true);
  assert.equal(getDashboardAttentionNotifications(records, viewer()).length, 3);
  assert.deepEqual(getNotificationTabCounts(records, viewer()), { notifications: 2, reminders: 1 });
  markChatNotificationsRead(context(), ['message-1'], viewer().email, state.storage);
  records = getAttentionNotifications([...state.rows(), ordinary], [task], true);
  assert.deepEqual(new Set(getDashboardAttentionNotifications(records, viewer()).map(row => row.id)), new Set(['ordinary-action', 'task-1']));
  assert.deepEqual(getNotificationTabCounts(records, viewer()), { notifications: 2, reminders: 1 });
  assert.equal(state.rows().length, 1);
  assert.equal(isNotificationRead(incoming, viewer().email), false, 'Original immutable signal is unchanged');
});
