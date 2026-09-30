import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const path = '../src/components/DeleteButtons.tsx';
const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
runInNewContext(compiled, { module, exports: module.exports, require }, { filename: path });
const { RowDeleteButton, BulkDeleteButton } = module.exports;
const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, { onDelete() {}, ...props }));

test('unused row has a Trash icon and a named Delete action', () => {
  const html = render(RowDeleteButton, { label: 'Delete Alice Stone' });
  assert.match(html, /lucide-trash-?2/);
  assert.match(html, /aria-label="Delete Alice Stone"/);
  assert.match(html, /title="DELETE"/);
  assert.doesNotMatch(html, /disabled=""/);
});

test('linked row has Power and changes only the action prefix, not the record name', () => {
  const html = render(RowDeleteButton, { linked: true, label: 'DELETE Delete Agency' });
  assert.match(html, /lucide-power/);
  assert.match(html, /aria-label="Deactivate Delete Agency"/);
  assert.match(html, /title="DEACTIVATE"/);
  assert.doesNotMatch(html, /disabled=""/);
});

test('inactive row has disabled Power and preserves the record identity in its accessible label', () => {
  const html = render(RowDeleteButton, { inactive: true, label: 'Delete Alice Stone' });
  assert.match(html, /lucide-power/);
  assert.match(html, /aria-label="Inactive Alice Stone"/);
  assert.match(html, /title="INACTIVE"/);
  assert.match(html, /disabled=""/);
});

test('bulk linked selection has an enabled Power action', () => {
  const html = render(BulkDeleteButton, { linked: true, selectedCount: 2 });
  assert.match(html, /lucide-power/);
  assert.match(html, /aria-label="Deactivate linked records; delete unused selected records"/);
  assert.doesNotMatch(html, /disabled=""/);
});

test('empty bulk selection is disabled and inactive bulk selection keeps Power', () => {
  assert.match(render(BulkDeleteButton, { selectedCount: 0 }), /disabled=""/);
  const inactive = render(BulkDeleteButton, { inactive: true, selectedCount: 2 });
  assert.match(inactive, /lucide-power/);
  assert.match(inactive, /disabled=""/);
});

test('bulk lifecycle labels preserve a caller-provided record name', () => {
  const html = render(BulkDeleteButton, { selectedCount: 2, linked: true, label: 'Delete Alice Stone records' });
  assert.match(html, /aria-label="[^"]*Alice Stone records/);
});

test('disabled lifecycle handlers cannot mutate and row handlers stop propagation', () => {
  let calls = 0;
  let stopped = 0;
  const onDelete = () => { calls++; };
  const inactive = RowDeleteButton({ inactive: true, onDelete });
  inactive.props.onClick({ stopPropagation() { stopped++; } });
  assert.equal(calls, 0);
  assert.equal(stopped, 1);
  const linked = RowDeleteButton({ linked: true, onDelete });
  linked.props.onClick({ stopPropagation() { stopped++; } });
  assert.equal(calls, 1);
  assert.equal(stopped, 2);
  assert.equal(BulkDeleteButton({ selectedCount: 0, onDelete }).props.onClick, undefined);
});

test('inactive full-row text strike excludes buttons with action icons', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-record-inactive="true"\]/);
  assert.match(css, /text-decoration(?:-line)?:\s*line-through/);
  assert.match(css, /:not\(button \*\)/);
  assert.match(css, /button:not\(\[data-button-family\]\):not\(:has\(svg\)\)/);
});
