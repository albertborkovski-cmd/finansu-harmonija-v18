import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/RelatedObjectLink.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
const compiled = { exports: {} };
const presentation = { exports: {} };
const presentationSource = ts.transpileModule(readFileSync(new URL('../src/lib/notificationPresentation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const require = createRequire(import.meta.url);
new Function('require', 'module', 'exports', presentationSource)(require, presentation, presentation.exports);
new Function('require', 'module', 'exports', outputText)(id => id === '../lib/notificationPresentation' ? presentation.exports : require(id), compiled, compiled.exports);
const RelatedObjectLink = compiled.exports.default;
const object = { id: 'document:1', type: 'Document', label: 'Invoice ABC-123.pdf', organizationId: 'company-1' };
const render = props => renderToStaticMarkup(createElement(RelatedObjectLink, {
  object,
  organizationId: object.organizationId,
  onOpen: () => { throw new Error('Rendering must not open or modify the original object.'); },
  onError: () => { throw new Error('Rendering must not change state.'); },
  ...props,
}));

test('existing task and object links retain their document name by default', () => {
  const html = render();
  assert.match(html, />Invoice ABC-123\.pdf<\/button>/);
  assert.match(html, /aria-label="Open Document: Invoice ABC-123\.pdf"/);
  assert.match(html, /title="Invoice ABC-123\.pdf"/);
});

test('notification link shows one contextual action while retaining object identity accessibly', () => {
  const html = render({ label: 'Open document' });
  assert.match(html, />Open document<\/button>/);
  assert.match(html, /aria-label="Open document: Invoice ABC-123\.pdf"/);
  assert.match(html, /title="Invoice ABC-123\.pdf"/);
  assert.equal((html.match(/role="link"/g) ?? []).length, 1);
  assert.equal((html.match(/<button /g) ?? []).length, 1);
  assert.doesNotMatch(html, />Invoice ABC-123\.pdf<\/button>/);
});

test('object names and contextual labels render safely as text', () => {
  const html = render({ object: { ...object, label: '<img src=x>' }, label: 'Open <document>' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Open &lt;document&gt;/);
  assert.match(html, /title="&lt;img src=x&gt;"/);
});

test('notification action uses the system row button without changing default task links', () => {
  const html = render({ label: 'Open document', variant: 'button' });
  assert.match(html, />Open<\/button>/);
  assert.match(html, /aria-label="Open document: Invoice ABC-123\.pdf"/);
  assert.doesNotMatch(html, /role="link"/);
  assert.match(html, /h-7/);
  assert.match(html, /w-20/);
  assert.match(html, /border-2/);
  assert.equal((html.match(/<button /g) ?? []).length, 1);
  assert.match(render(), /role="link"/);
});

test('all contextual buttons have identical width and Open text, retaining descriptive accessible names', () => {
  for (const type of ['Document', 'Invoice', 'Chat', 'Bank operation', 'Reconciliation', 'Debt', 'Counterparty']) {
    const html = render({ object: { ...object, type }, label: `Open ${type.toLowerCase()}`, variant: 'button' });
    assert.match(html, />Open<\/button>/);
    assert.match(html, /\bh-7 w-20 shrink-0\b/);
    assert.ok(html.includes(`aria-label="Open ${type.toLowerCase()}: Invoice ABC-123.pdf"`));
  }
});
