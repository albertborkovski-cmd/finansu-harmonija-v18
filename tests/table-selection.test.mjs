import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/tableSelection.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { toggleFilteredSelection } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('INV search selects only matches and remains selected after clearing search', () => {
  const all = ['INV-1', 'BANK-1', 'INV-2'];
  const selected = toggleFilteredSelection(new Set(), all.filter(id => id.includes('INV')));
  assert.deepEqual(all.filter(id => selected.has(id)), ['INV-1', 'INV-2']);
  assert.equal(selected.has('BANK-1'), false);
});
test('select and deselect filtered results preserves other selections without mutation', () => {
  const original = new Set(['OTHER']);
  const selected = toggleFilteredSelection(original, ['INV-1', 'INV-2']);
  assert.deepEqual([...original], ['OTHER']);
  assert.deepEqual([...toggleFilteredSelection(selected, ['INV-1', 'INV-2'])], ['OTHER']);
  assert.deepEqual([...toggleFilteredSelection(selected, [])], [...selected]);
});
test('selection includes all matching records, beyond the loaded page', () => {
  const ids = Array.from({length: 120}, (_, i) => `INV-${i}`);
  assert.equal(toggleFilteredSelection(new Set(), ids).size, 120);
});
