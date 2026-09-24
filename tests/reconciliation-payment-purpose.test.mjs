import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/reconciliationPaymentPurpose.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { paymentPurpose, paymentPurposes } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('statement purpose takes precedence and missing non-bank purpose stays blank', () => {
  assert.equal(paymentPurpose({ kind: 'Payment', paymentPurpose: ' Invoice SF-12 ', reference: 'other' }), 'Invoice SF-12');
  assert.equal(paymentPurpose({ kind: 'Payment', reference: 'Bank narrative' }), 'Bank narrative');
  assert.equal(paymentPurpose({ kind: 'Invoice', reference: 'SF-12' }), '—');
  assert.equal(paymentPurpose({ kind: 'Payment', reference: '' }), '—');
});

test('history combines unique purposes without changing bank records', () => {
  const items = [{ kind: 'Payment', paymentPurpose: 'First' }, { kind: 'Payment', paymentPurpose: 'First' }, { kind: 'Deposit', paymentPurpose: 'Second' }];
  const before = JSON.stringify(items);
  assert.equal(paymentPurposes(items), 'First · Second');
  assert.equal(paymentPurposes([]), '—');
  assert.equal(JSON.stringify(items), before);
});
