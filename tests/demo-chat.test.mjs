import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/newChat.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^import .* from .*;$/gm, '');
const session = { email: 'aurika.z@meso.lt', fullName: 'Aurika Z.', roleNames: ['External demo user'], access: { companies: { view: true } } };
globalThis.window = { localStorage: { getItem: () => null } };
globalThis.demoChatFixture = { session, saved: null };
const prelude = `
const AUTH_SESSION_KEY = 'session';
const parseSession = () => globalThis.demoChatFixture.session;
const canEditMenu = () => true;
const canAccessAssignedOrganization = organization => organization.id === 'alice';
const loadLinkedDirectoryUsers = audience => audience === 'Internal users'
  ? [{id:'internal',email:'accountant@example.com',status:'Enabled'}, {id:'disabled',email:'disabled@example.com',status:'Disabled'}]
  : [{id:'aurika',email:'aurika.z@meso.lt'}, {id:'external',email:'client@example.com'}];
const loadOrganizationUserIds = () => [];
const organizationAssignmentStorageKey = () => 'assignment';
const isAccountantAssigned = () => false;
const hasOrganizationSubstitution = () => false;
const loadRelatedObjects = async () => [];
const registerChatConversation = context => { globalThis.demoChatFixture.saved = context; };
`;
const api = await import(`data:text/javascript;base64,${Buffer.from(prelude + source).toString('base64')}`);
test('demo can create chats with active internal and external users, only in its demo company', async () => {
  const company = { id: 'alice', name: 'Alice Stone' };
  assert.deepEqual(api.chatRecipients(company, session.email).map(user => user.id), ['External users:external', 'Internal users:internal']);
  assert.deepEqual(api.chatRecipients({ id: 'other' }, session.email), []);
  for (const recipient of ['Internal users:internal', 'External users:external']) {
    const context = await api.createContextChat(company, recipient, '', 'Test conversation');
    assert.equal(context.createdByEmail, session.email);
    assert.equal(context.organizationId, 'alice');
    assert.equal(context.subject, 'Test conversation');
  }
  await assert.rejects(api.createContextChat({ id: 'other' }, 'Internal users:internal', '', 'Test'));
  await assert.rejects(api.createContextChat(company, 'Internal users:disabled', '', 'Test'));
});
