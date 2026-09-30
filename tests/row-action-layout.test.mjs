import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

function components(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? components(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

test('shared row actions stay in normal flow and consume spare space before the final column', () => {
  const rule = css.match(/\.system-table-row-actions,\s*\.table-row-actions,\s*:where\(div, span\):has\(> button\[data-button-family="row-delete"\]\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, 'Explicit row-action and legacy DeleteButton contract must exist');
  assert.match(rule, /position:\s*static\s*!important/);
  assert.match(rule, /inset:\s*auto\s*!important/);
  assert.match(rule, /margin-left:\s*auto\s*!important/);
  assert.match(rule, /flex-shrink:\s*0\s*!important/);
});

test('table action wrappers do not reintroduce viewport anchors or flexible action widths', () => {
  let markedWrappers = 0;
  const violations = [];
  for (const path of components(join(root, 'src/components'))) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'className') {
        const value = node.initializer?.getText(source) || '';
        if (value.includes('system-table-row-actions')) {
          markedWrappers += 1;
          if (/(?:^|[\s"'`])(sticky|absolute|fixed|flex-1|grow)(?:[\s"'`]|$)/.test(value)) {
            violations.push(`${path}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(markedWrappers >= 10, 'The shared contract must cover multiple system menus');
  assert.deepEqual(violations, [], 'Row actions must follow the last visible data column');
});
