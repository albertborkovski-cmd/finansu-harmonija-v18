import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const url = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const lifecycle = url(compile('src/lib/recordLifecycle.ts'));
const api = await import(url(compile('src/lib/ocrFieldValidation.ts').replace(/(['"])\.\/recordLifecycle\1/g, JSON.stringify(lifecycle))));
const storage = new Map();
globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

test('document type rules persist independently from other types and shared rules', () => {
  const defaults = api.loadOcrFieldValidationRules({ includeInactive: true });
  const changed = defaults.map(rule => ({ ...rule, confidenceThreshold: 75, level: 'yellow', enabled: false, required: false }));
  api.saveOcrFieldValidationRules(changed, 'VAT_INVOICE');
  assert.deepEqual(api.loadOcrFieldValidationRules({ documentType: 'VAT_INVOICE', includeInactive: true }), changed);
  assert.deepEqual(api.loadOcrFieldValidationRules({ documentType: 'INVOICE', includeInactive: true }), defaults);
  assert.deepEqual(api.loadOcrFieldValidationRules({ includeInactive: true }), defaults);
});

test('disabled fields do not require OCR review', () => {
  const rule = { key: 'number', level: 'red', confidenceThreshold: 90, enabled: false };
  assert.equal(api.requiresMesoWorkerReview(rule, 10), false);
  assert.equal(api.requiresMesoWorkerReview({ ...rule, enabled: true }, 10), true);
});
