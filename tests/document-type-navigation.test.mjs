import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = path => ts.transpileModule(read(path), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const lifecycle = url(compile('src/lib/recordLifecycle.ts'));
const access = await import(url(compile('src/lib/accessControl.ts').replace(/(['"])\.\/recordLifecycle\1/g, JSON.stringify(lifecycle))));

test('document types belong only to OCR administration in the navigation and access tree', () => {
  const nodes = access.flattenRoleAccessTree();
  assert.equal(nodes.some(node => node.id === 'settings-organizations-document-type'), false);
  const admin = nodes.find(node => node.id === 'ocr-admin');
  assert.equal(admin.children.find(node => node.id === 'ocr-admin-document-type').module, 'ocr');
  const sidebar = read('src/components/Sidebar.tsx');
  assert.doesNotMatch(sidebar, /settings-organizations-document-type/);
  assert.match(sidebar, /id: "ocr-admin-document-type", label: "Document type"/);
});

test('saved document-type permissions move without mutation or overwriting newer settings', () => {
  const old = { 'settings-organizations-document-type': { view: true, edit: false } };
  assert.deepEqual(access.migrateDocumentTypeMenuKey(old), { 'ocr-admin-document-type': { view: true, edit: false } });
  assert.ok(old['settings-organizations-document-type']);
  assert.deepEqual(access.migrateDocumentTypeMenuKey({ ...old, 'ocr-admin-document-type': { view: false, edit: false } }), { 'ocr-admin-document-type': { view: false, edit: false } });
  assert.deepEqual(access.migrateDocumentTypeMenuKey({ 'settings-organizations-document-type': ['READ', 'UPDATE'] }), { 'ocr-admin-document-type': ['READ', 'UPDATE'] });
});

test('OCR route reuses the existing document-type editor and supplies the new breadcrumb', () => {
  const dashboard = read('src/components/Dashboard.tsx');
  assert.match(dashboard, /"ocr-admin-document-type": "Document type"/);
  assert.match(dashboard, /breadcrumbParents=\{activeMenu === "ocr-admin-document-type" \? \["OCR", "Administration"\]/);
  const editor = read('src/components/OrganizationReferenceValuesView.tsx');
  assert.match(editor, /loadOrganizationReferenceRecords\(section\)/);
  assert.equal((editor.match(/<span>\{breadcrumbParents\[0\]\}<\/span>/g) || []).length, 2);
  assert.equal((editor.match(/<span>\{breadcrumbParents\[1\]\}<\/span>/g) || []).length, 2);
});
