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
  '../lib/notificationPresentation': load('../src/lib/notificationPresentation.ts'),
  './PageHeader': load('../src/components/PageHeader.tsx'),
};
const componentPath = '../src/components/NotificationDetailsPanel.tsx';
const Panel = load(componentPath, imports).default;
const notification = Object.freeze({
  id: 'system-signal', category: 'notifications', origin: 'system', status: 'Active',
  name: 'Processing completed', type: 'Document', message: 'First line.\nSecond line with all notification details.',
  createdAt: '2026-09-15T09:05:00Z', organizationId: 'company-1',
});
const props = { notification, organizationName: 'Example organization', read: false, onClose() {} };
const render = overrides => renderToStaticMarkup(createElement(Panel, { ...props, ...overrides }));

test('read-only notification details expose the full message and metadata without source or editing actions', () => {
  const html = render();
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby=/);
  for (const label of ['Name', 'Type', 'Organization', 'Date / time', 'Read status', 'Message']) {
    assert.match(html, new RegExp(`<dt[^>]*>${label}<\\/dt>`));
  }
  for (const value of [notification.name, 'Documents', props.organizationName, notification.message, 'Unread']) assert.ok(html.includes(value));
  assert.match(html, />Documents<\/dd>/);
  assert.ok(html.includes(imports['../lib/notificationPresentation'].formatNotificationDateTime(notification)));
  assert.match(html, /whitespace-pre-wrap break-words/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /font-montserrat/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<(input|textarea|select|form|a)\b|contenteditable|truncate|line-clamp|Edit|Delete|Save|Mark as|Related object/);
  assert.equal(notification.status, 'Active');
  assert.equal(notification.readAtByEmail, undefined);
});

test('read status is supplied by the parent and missing metadata stays unknown', () => {
  const html = render({ notification: { ...notification, name: '', type: '', message: '', createdAt: undefined }, organizationName: '', read: true });
  assert.match(html, />Read<\/dd>/);
  assert.doesNotMatch(html, />Unread<\/dd>/);
  assert.equal((html.match(/>—<\/dd>/g) ?? []).length, 5);
});

test('notification details render untrusted content as text without truncation', () => {
  const message = `<script>alert('message')</script>\n${'Very long notification content. '.repeat(200)}`;
  const html = render({ notification: { ...notification, message }, organizationName: '<img src=x>' });
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.equal((html.match(/Very long notification content\./g) ?? []).length, 200);
});

function mountedPanel(t) {
  const effects = [];
  const react = { ...require('react'), useId: () => 'notification-details-title', useRef: value => ({ current: value }), useEffect: effect => effects.push(effect) };
  const Component = load(componentPath, { ...imports, react }).default;
  let closeCount = 0;
  const tree = Component({ ...props, onClose: () => { closeCount++; } });
  const listeners = new Map();
  const document = { activeElement: null, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name, callback) => { assert.equal(listeners.get(name), callback); listeners.delete(name); } };
  class Element {
    isConnected = true;
    children = [];
    focus() { document.activeElement = this; }
    contains(target) { return target === this || this.children.includes(target); }
    querySelectorAll() { return this.children; }
  }
  const originalGlobals = Object.fromEntries(['document', 'HTMLElement', 'Node'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, { document, HTMLElement: Element, Node: Element });
  t.after(() => {
    for (const [name, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const trigger = new Element();
  const panel = new Element();
  const first = new Element();
  const last = new Element();
  panel.children = [first, last];
  trigger.focus();
  const section = tree.props.children;
  section.ref.current = panel;
  const cleanup = effects.map(effect => effect()).filter(Boolean);
  const key = (key, shiftKey = false) => {
    const event = { key, shiftKey, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    listeners.get('keydown')(event);
    return event;
  };
  return { tree, section, panel, first, last, trigger, document, listeners, key, closeCount: () => closeCount, unmount: () => cleanup.forEach(fn => fn()) };
}

test('the dialog receives initial focus, traps keyboard focus, and restores the opening control on close', t => {
  const harness = mountedPanel(t);
  assert.equal(harness.document.activeElement, harness.panel);
  assert.equal(harness.key('Tab', true).prevented, true);
  assert.equal(harness.document.activeElement, harness.last);
  assert.equal(harness.key('Tab').prevented, true);
  assert.equal(harness.document.activeElement, harness.first);
  assert.equal(harness.key('Tab', true).prevented, true);
  assert.equal(harness.document.activeElement, harness.last);
  harness.trigger.focus();
  harness.listeners.get('focusin')({ target: harness.trigger });
  assert.equal(harness.document.activeElement, harness.panel);
  harness.unmount();
  assert.equal(harness.document.activeElement, harness.trigger);
  assert.equal(harness.listeners.size, 0);
});

test('Escape, backdrop, and both close buttons close the panel; clicks inside do not', t => {
  const harness = mountedPanel(t);
  const event = harness.key('Escape');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(harness.closeCount(), 1);
  harness.tree.props.onClick({ target: harness.panel, currentTarget: harness.tree });
  assert.equal(harness.closeCount(), 1);
  harness.tree.props.onClick({ target: harness.tree, currentTarget: harness.tree });
  const [header, , footer] = harness.section.props.children;
  header.props.children[1].props.onClick();
  footer.props.children.props.onClick();
  assert.equal(harness.closeCount(), 4);
  harness.unmount();
});
