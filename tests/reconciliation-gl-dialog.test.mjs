import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => imports[id] ?? require(id), module, module.exports);
  return module.exports;
}

const imports = {
  './PageHeader': load('../src/components/PageHeader.tsx'),
  './SearchableSelect': load('../src/components/SearchableSelect.tsx'),
};
imports['./ReconciliationDialogs'] = load('../src/components/ReconciliationDialogs.tsx', imports);
const componentPath = '../src/components/ReconciliationGlAccountDialog.tsx';
const Dialog = load(componentPath, imports).default;
const Review = imports['./ReconciliationDialogs'].ReconciliationConfirmationDialog;

test('reconciled document reuses review layout, shows active allocations and has no confirmation action', () => {
  const invoice = { id: 'invoice', kind: 'Invoice', documentNumber: 'INV-201', counterpartyName: 'Example', currency: 'EUR', side: 'Receivable', remainingMinor: 0 };
  const payment = { ...invoice, id: 'payment', kind: 'Payment', documentNumber: 'PAY-201' };
  const state = { organizationId: 'org', items: [invoice, payment], batches: [
    { id: 'old', at: '2026-09-01T10:00:00.000Z', actor: 'Old user', reversedAt: '2026-09-02', allocations: [{ invoiceId: 'invoice', fundingId: 'payment', amountMinor: 99900 }] },
    { id: 'active', at: '2026-09-03T10:00:00.000Z', actor: 'Accountant', allocations: [{ invoiceId: 'invoice', fundingId: 'payment', amountMinor: 125000 }] },
  ] };
  const before = JSON.stringify(state);
  const html = renderToStaticMarkup(createElement(Review, { state, proposals: [], appliedItem: invoice, onClose() {}, onConfirm() { throw new Error('Must not confirm a reconciled document'); } }));
  for (const label of ['View document · INV-201', 'Confirmed reconciliation', 'Open before', 'Allocation', 'Open after', 'PAY-201', 'Invoice · INV-201', '1,250.00 EUR', '0.00 EUR', 'Total reconciled', 'Close']) assert.ok(html.includes(label), label);
  assert.ok(!html.includes('999.00')); assert.ok(!html.includes('Old user'));
  assert.ok(!html.includes('Confirm test reconciliation')); assert.ok(!html.includes('High confidence'));
  assert.equal(JSON.stringify(state), before);
});
const item = Object.freeze({
  id: 'payment-1', organizationId: 'company-1', counterpartyId: '', counterpartyName: '', payeeName: 'Example Bank',
  kind: 'Payment', side: 'Payable', documentNumber: 'BANK-123', reference: 'Monthly bank fee', documentDate: '2026-09-16',
  dueDate: '', currency: 'EUR', originalMinor: 1275, remainingMinor: 1275, glAccountCode: '',
});
const accounts = Object.freeze([{ code: '6270', name: 'Bank charges' }, { code: '6330', name: 'Interest expense' }]);
const props = { item, category: 'Bank fee', reason: 'Recognized bank charge.', accounts, history: [], onSave() {}, onClose() {} };
const render = overrides => renderToStaticMarkup(createElement(Dialog, { ...props, ...overrides }));

function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return [node, ...flatten(node.props?.children)];
}

function draft(overrides = {}) {
  const values = [];
  const calls = [];
  let hook = 0;
  let closed = 0;
  const react = {
    ...require('react'), useId: () => 'gl-note',
    useState(initial) {
      const index = hook++;
      if (!(index in values)) values[index] = initial;
      return [values[index], value => { values[index] = value; }];
    },
  };
  const Component = load(componentPath, { ...imports, react }).default;
  const input = { ...props, onSave: (...args) => calls.push(args), onClose: () => { closed++; }, ...overrides };
  const tree = () => {
    hook = 0;
    const wrapper = Component(input);
    return wrapper.type(wrapper.props);
  };
  const nodes = () => flatten(tree());
  return {
    tree, calls, closed: () => closed,
    select: () => nodes().find(node => node.type === imports['./SearchableSelect'].default),
    note: () => nodes().find(node => node.type === 'textarea'),
    action: name => nodes().find(node => node.type === imports['./PageHeader'].PageActionButton && node.props.children === name),
  };
}

test('GL editor exposes payment details as read-only text and the shared required account selector', () => {
  const html = render();
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby=/);
  for (const label of ['Document No.', 'Date', 'Payee / payer', 'Counterparty', 'Amount', 'Currency', 'Category', 'Current GL account', 'Reference']) {
    assert.ok(html.includes(`>${label}</dt>`), `Missing read-only field ${label}`);
  }
  for (const text of ['BANK-123', 'Example Bank', '12.75', 'EUR', 'Bank fee', 'Monthly bank fee', 'No counterparty assigned', 'Not assigned']) assert.ok(html.includes(text));
  assert.equal((html.match(/<input\b/g) ?? []).length, 1);
  assert.equal((html.match(/<textarea\b/g) ?? []).length, 1);
  assert.match(html, /role="combobox" aria-label="GL account \(required\)"/);
  assert.match(html, /GL account <span aria-hidden="true" class="text-\[#D92D20\]">\*<\/span>/);
  assert.match(html, /This test assignment does not post to the GL journal or ERP\./);
  assert.match(html, /Note <span[^>]*>\(optional\)<\/span>/);
  assert.doesNotMatch(html, /Create account|Delete|Reconcile payment/);
});

test('a client is green only when both client ID and name are assigned', () => {
  const complete = render({ item: { ...item, counterpartyId: 'client-1', counterpartyName: 'Verified client' } });
  assert.match(complete, /bg-\[#EAF8F2\] text-\[#087A55\][^>]*>Verified client/);
  for (const patch of [{ counterpartyName: 'Name without ID' }, { counterpartyId: 'client-1' }, { counterpartyId: ' ', counterpartyName: 'Name' }]) {
    const html = render({ item: { ...item, ...patch } });
    assert.match(html, /bg-\[#FFF8E5\] text-\[#9A6700\][^>]*>No counterparty assigned/);
  }
});

test('blank codes are excluded and no active accounts disables the selector and save', () => {
  const harness = draft({ accounts: [{ code: '', name: 'No code' }, { code: '  ', name: 'Blank code' }] });
  assert.deepEqual(harness.select().props.options, []);
  assert.equal(harness.select().props.disabled, true);
  assert.equal(harness.action('Save GL account').props.disabled, true);
  harness.action('Save GL account').props.onClick();
  assert.deepEqual(harness.calls, []);
  assert.match(render({ accounts: [] }), /No active GL accounts are available\. An account is required to save\./);
});

test('only a changed active code can save, with a trimmed optional note', () => {
  const harness = draft({ item: { ...item, glAccountCode: '6270' } });
  assert.equal(harness.action('Save GL account').props.disabled, true);
  for (const invalid of ['', '  ', 'unknown', '6270']) {
    harness.select().props.onChange(invalid);
    assert.equal(harness.action('Save GL account').props.disabled, true);
    harness.action('Save GL account').props.onClick();
  }
  assert.deepEqual(harness.calls, []);
  harness.select().props.onChange('6330');
  assert.equal(harness.action('Save GL account').props.disabled, false);
  harness.action('Save GL account').props.onClick();
  assert.deepEqual(harness.calls, [['6330', '']]);
  harness.note().props.onChange({ target: { value: '  Corrected account  ' } });
  harness.action('Save GL account').props.onClick();
  assert.deepEqual(harness.calls[1], ['6330', 'Corrected account']);
});

test('previous-account suggestion fills the draft but never saves automatically', () => {
  const harness = draft({ suggestedAccount: '6270' });
  assert.equal(harness.select().props.value, '');
  harness.action('Use previous account').props.onClick();
  assert.equal(harness.select().props.value, '6270');
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.action('Save GL account').props.disabled, false);
  for (const suggestedAccount of ['unknown', '']) assert.equal(draft({ suggestedAccount }).action('Use previous account'), undefined);
  assert.equal(draft({ item: { ...item, glAccountCode: '6270' }, suggestedAccount: '6270' }).action('Use previous account'), undefined);
});

test('busy saves disable changes and close, while persistence errors remain visible', () => {
  const harness = draft({ busy: true, suggestedAccount: '6330' });
  assert.equal(harness.select().props.disabled, true);
  assert.equal(harness.note().props.disabled, true);
  assert.equal(harness.action('Use previous account').props.disabled, true);
  assert.equal(harness.action('Saving…').props.disabled, true);
  assert.equal(harness.action('Cancel').props.disabled, true);
  harness.tree().props.onClose();
  harness.action('Saving…').props.onClick();
  assert.equal(harness.closed(), 0);
  assert.deepEqual(harness.calls, []);
  assert.match(render({ error: 'Could not save the assignment.' }), /role="alert"[^>]*>Could not save the assignment\./);
});

test('read-only access preserves details and history but blocks changes and forced saves', () => {
  const history = [{ id: 'audit', itemId: item.id, fromAccount: '', toAccount: '6270', at: '2026-09-16T10:00:00Z', actor: 'Accountant', note: 'Existing assignment' }];
  const overrides = { item: { ...item, glAccountCode: '6270' }, readOnly: true, suggestedAccount: '6330', history };
  const html = render(overrides);
  assert.match(html, />View GL account<\/h2>/);
  assert.match(html, /Your current role has read-only access to Companies\. GL account changes require edit access\./);
  assert.ok(html.includes('6270 — Bank charges') && html.includes('Existing assignment') && html.includes('BANK-123'));
  const harness = draft(overrides);
  assert.equal(harness.select().props.disabled, true);
  assert.equal(harness.note().props.disabled, true);
  assert.equal(harness.action('Use previous account').props.disabled, true);
  assert.equal(harness.action('Save GL account').props.disabled, true);
  assert.equal(harness.action('Cancel').props.disabled, false);
  harness.action('Use previous account').props.onClick();
  assert.equal(harness.select().props.value, '6270');
  harness.select().props.onChange('6330');
  harness.note().props.onChange({ target: { value: 'Forced draft change' } });
  assert.equal(harness.action('Save GL account').props.disabled, true);
  harness.action('Save GL account').props.onClick();
  assert.deepEqual(harness.calls, []);
  harness.action('Cancel').props.onClick();
  assert.equal(harness.closed(), 1);
});

test('history remains read-only, newest first, scoped to this payment, and internally scrollable', () => {
  const history = Object.freeze([
    Object.freeze({ id: 'old', itemId: item.id, fromAccount: '', toAccount: '6270', at: '2026-09-15T09:00:00Z', actor: 'First user', note: 'Initial assignment' }),
    Object.freeze({ id: 'new', itemId: item.id, fromAccount: '6270', toAccount: '6330', at: '2026-09-16T10:00:00Z', actor: 'Second user', note: 'Account correction' }),
    Object.freeze({ id: 'other', itemId: 'other-payment', fromAccount: '', toAccount: '9999', at: '2026-09-17T10:00:00Z', actor: 'Other user', note: 'Other payment audit' }),
  ]);
  const html = render({ history });
  assert.match(html, /Previous GL assignments[^>]*max-h-\[180px\] overflow-y-auto/);
  assert.ok(html.indexOf('Account correction') < html.indexOf('Initial assignment'));
  assert.match(html, /6270 <span aria-label="changed to">→<\/span> 6330/);
  assert.match(html, /Not assigned <span aria-label="changed to">→<\/span> 6270/);
  assert.ok(html.includes('First user') && html.includes('Second user'));
  assert.match(html, /<time dateTime="2026-09-16T10:00:00Z">\d{4}-\d{2}-\d{2} \d{2}:\d{2}<\/time>/);
  assert.doesNotMatch(html, /Other payment audit|Other user|Delete/);
  assert.equal(history[0].id, 'old');
});

test('references, payees, notes, and audit actors are escaped without truncation', () => {
  const reference = `<script>alert('reference')</script>\n${'Long reference. '.repeat(200)}`;
  const html = render({
    item: { ...item, reference, payeeName: '<img src=x>' },
    history: [{ id: 'x', itemId: item.id, fromAccount: '', toAccount: '6270', at: 'invalid-date', actor: '<script>actor</script>', note: '<img src=x>audit' }],
  });
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.equal((html.match(/Long reference\./g) ?? []).length, 200);
  assert.match(html, /whitespace-pre-wrap break-words/);
});

test('assignment history orders timezone-offset timestamps by their actual instant', () => {
  const history = Object.freeze([
    Object.freeze({ id: 'earlier', itemId: item.id, fromAccount: '', toAccount: '6270', at: '2026-09-16T10:00:00+03:00', actor: 'Accountant', note: 'Earlier instant' }),
    Object.freeze({ id: 'later', itemId: item.id, fromAccount: '6270', toAccount: '6330', at: '2026-09-16T09:00:00-03:00', actor: 'Accountant', note: 'Later instant' }),
  ]);
  assert.ok(history[0].at.localeCompare(history[1].at) > 0, 'Fixture must differ from lexical ordering');
  const html = render({ history });
  assert.ok(html.indexOf('Later instant') < html.indexOf('Earlier instant'));
  assert.equal(history[0].id, 'earlier');
});

test('shared dialog handles Escape after an expanded account picker closes', t => {
  const effects = [];
  const react = { ...require('react'), useId: () => 'gl-title', useRef: value => ({ current: value }), useEffect: effect => effects.push(effect) };
  const Modal = load('../src/components/ReconciliationDialogs.tsx', { ...imports, react }).ReconciliationDialog;
  let closed = 0;
  const tree = Modal({ title: 'Edit GL account', onClose: () => { closed++; }, children: null });
  const listeners = new Map();
  const document = { activeElement: null, body: { style: { overflow: 'auto' } }, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  class Element {
    isConnected = true;
    expanded = false;
    focus() { document.activeElement = this; }
    closest() { return this.expanded ? this : null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    contains(target) { return target === this; }
  }
  const originalGlobals = Object.fromEntries(['document', 'HTMLElement', 'Element', 'Node'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, { document, HTMLElement: Element, Element, Node: Element });
  t.after(() => {
    for (const [name, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const trigger = new Element();
  const modal = new Element();
  trigger.focus();
  tree.props.children.ref.current = modal;
  const cleanup = effects.map(effect => effect()).filter(Boolean);
  assert.equal(document.activeElement, modal);
  assert.equal(document.body.style.overflow, 'hidden');
  const target = new Element();
  const escape = () => listeners.get('keydown')({ key: 'Escape', target, preventDefault() {}, stopPropagation() {} });
  target.expanded = true;
  escape();
  assert.equal(closed, 0);
  target.expanded = false;
  escape();
  assert.equal(closed, 1);
  cleanup.forEach(fn => fn());
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(listeners.size, 0);
});
