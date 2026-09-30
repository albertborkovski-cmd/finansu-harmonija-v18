import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/index.css');

test('both explicit flex action classes expand their row across the viewport and overflow', () => {
  for (const className of ['system-table-row-actions', 'table-row-actions']) {
    const selector = `.flex:has(> .${className})`;
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const rule = rules.find(([, selectors]) => selectors.includes(selector))?.[2];
    assert.ok(rule, `${selector} must use the shared row surface contract`);
    assert.match(rule, /width:\s*max-content\s*!important/);
    assert.match(rule, /min-width:\s*100%\s*!important/);
  }
});

test('action-bearing grid definitions reserve a flexible final track with a fixed minimum', () => {
  const definitions = [
    ['src/components/OperationDateValidationView.tsx', 'tableGridTemplate'],
    ['src/components/ml/LogsTab.tsx', 'gridTemplateColumns'],
    ['src/components/ml/ModelsView.tsx', 'tableGrid'],
    ['src/components/ml/ModelsView.tsx', 'versionGrid'],
    ['src/components/AutomationProcessDetailView.tsx', 'gridTemplateColumns'],
    ['src/components/AutomationProcessDetailView.tsx', 'configurationGridTemplate'],
    ['src/components/AutomationProcessDetailView.tsx', 'notificationGridTemplate'],
  ];
  for (const [path, name] of definitions) {
    const line = read(path).split('\n').find(value => value.includes(`const ${name} =`));
    assert.ok(line, `${path}: ${name} definition exists`);
    assert.match(line, /minmax\(\d+px,\s*1fr\)`;/, `${path}: ${name} ends with the flexible actions track`);
  }
});

test('isolated browser fixture uses production CSS and exposes mutation checks', () => {
  const fixture = read('tests/fixtures/table-action-layout.html');
  assert.match(fixture, /href="\/src\/index\.css"/);
  for (const id of ['hide-column', 'add-column', 'resize-column', 'resize-viewport', 'scroll-end', 'reset', 'check-layout', 'layout-result']) {
    assert.ok(fixture.includes(`id="${id}"`), `Browser fixture must expose ${id}`);
  }
  assert.match(fixture, /window\.tableActionFixture/);
  assert.doesNotMatch(fixture, /(?:margin-left|position)\s*:\s*(?:auto|static|sticky|fixed|absolute)/,
    'The fixture must not supply or override the production action-position contract');
});
