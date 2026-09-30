import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function environment(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  const localStorage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const window = { localStorage, dispatchEvent() {} };
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
    const module = { exports: {} };
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module, exports: module.exports, window,
      CustomEvent: class { constructor(type) { this.type = type; } },
      require(name) {
        if (name === './recordLifecycle') return load('lib/recordLifecycle');
        if (name === 'react') return { useCallback: value => value, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() };
        throw new Error(`Unexpected import ${name}`);
      },
    });
    modules.set(path, module.exports);
    return module.exports;
  }
  return { load, localStorage };
}

test('automation run deletion retains history and original outcome after reload', () => {
  const env = environment({
    'finansu-harmonija-v4:automation-processes': [{ id: 'process-1', name: 'Invoices' }],
    'finansu-harmonija-v4:automation-process-runs': {
      'process-1': [
        { id: 'RUN-001', tasks: 3, status: 'Completed', node: 'Node-01', created: '10.04.2026 12:22' },
        { id: 'RUN-002', tasks: 2, status: 'Failed', node: 'Node-02', created: '10.04.2026 13:22' },
      ],
    },
  });
  const store = env.load('components/automationRunsStore');
  store.deleteAggregatedRuns([{ processId: 'process-1', runId: 'RUN-001' }]);
  const runs = store.getProcessRuns('process-1');
  assert.equal(runs.length, 2);
  assert.equal(runs[0].inactive, true);
  assert.equal(runs[0].status, 'Completed');
  assert.equal(runs[0].tasks, 3);
  assert.equal(runs[1].inactive, undefined);
  assert.equal(store.getAggregatedRuns()[0].inactive, true);
  store.deleteAggregatedRuns([{ processId: 'process-1', runId: 'RUN-001' }]);
  assert.equal(store.getProcessRuns('process-1').length, 2);
});

test('built-in OCR rules are deactivated, visible in settings, and excluded from processing', () => {
  const env = environment();
  const store = env.load('lib/ocrFieldValidation');
  const original = store.loadOcrFieldValidationRules();
  const updated = store.removeOrDeactivateOcrFieldValidationRules(original, new Set(['documentDate']));
  assert.equal(updated.length, original.length);
  const inactiveRule = updated.find(rule => rule.key === 'documentDate');
  assert.equal(inactiveRule.inactive, true);
  assert.equal(inactiveRule.level, 'red');
  assert.equal(store.requiresMesoWorkerReview(inactiveRule, 0), false);
  store.saveOcrFieldValidationRules(updated);
  assert.equal(store.loadOcrFieldValidationRules().some(rule => rule.key === 'documentDate'), false);
  assert.equal(store.loadOcrFieldValidationRules({ includeInactive: true }).find(rule => rule.key === 'documentDate').inactive, true);
});

test('empty model catalog stays empty instead of restoring sample models', () => {
  const env = environment({ 'finansu-harmonija-v6-model-catalog': [] });
  const store = env.load('components/ml/modelCatalogStore');
  assert.equal(store.useModelCatalog()[0].length, 0);
});

test('unused custom OCR rules delete while linked custom rules remain inactive', () => {
  const env = environment();
  const store = env.load('lib/ocrFieldValidation');
  const unused = { key: 'custom-unused', label: 'Unused custom', type: 'OCR', subtype: 'OCR', level: 'yellow' };
  const linked = { key: 'custom-linked', label: 'Linked custom', type: 'OCR', subtype: 'OCR', level: 'red' };
  store.saveOcrFieldValidationRules([unused, linked]);
  env.localStorage.setItem('finansu-harmonija:v18:ocr-processing-events', JSON.stringify([{ id: 'event-1', fieldKey: linked.key }]));
  const updated = store.removeOrDeactivateOcrFieldValidationRules([unused, linked], new Set([unused.key, linked.key]));
  assert.equal(updated.length, 1);
  assert.equal(updated[0].key, linked.key);
  assert.equal(updated[0].inactive, true);
  assert.equal(linked.inactive, undefined);
});

test('persistent OCR and ML table surfaces opt into inactive row styling', () => {
  for (const path of [
    'components/OcrView.tsx', 'components/OcrDetailView.tsx',
    'components/AdministrationView.tsx', 'components/AutomationSecurityAccessView.tsx',
    'components/AutomationProcessDetailView.tsx', 'components/OcrFieldValidationSettings.tsx',
    'components/ml/DocumentsTab.tsx', 'components/ml/LogsTab.tsx',
    'components/ml/MachineLearningView.tsx', 'components/ml/ModelsView.tsx',
  ]) {
    const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
    assert.match(source, /data-record-inactive/, path);
    assert.match(source, /(?:Row|Bulk)DeleteButton[^>]*linked[=\s]/s, path);
  }
});
