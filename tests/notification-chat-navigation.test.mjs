import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/Dashboard.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});

// Keep Dashboard's real event handlers and JSX, while isolating unrelated views
// and services. The hook harness lets the tests follow navigation state changes.
function createDashboardHarness() {
  const company = { id: 'company-1', name: 'Example company' };
  const conversation = { storageKey: 'chat-1', documentId: 'document-1', documentName: 'Invoice.pdf' };
  const document = { id: 'document-1', company_id: company.id };
  const session = {
    email: 'user@example.com', fullName: 'Example user', roleNames: ['User'],
    access: Object.fromEntries(['companies', 'chats', 'notifications', 'settings', 'faq', 'ocr'].map(key => [key, { view: true, edit: true }])),
  };
  const hooks = [];
  const main = { scrollTop: 0 };
  let cursor = 0;
  let effects = [];
  let chatAccess = true;
  const react = {
    ...require('react'),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect() {},
    useLayoutEffect(effect, dependencies) {
      const index = cursor++;
      if (!hooks[index] || dependencies.some((value, i) => value !== hooks[index][i])) effects.push(effect);
      hooks[index] = dependencies;
    },
  };
  const module = { exports: {} };
  const imports = {
    react,
    '../hooks/usePersistentState': { usePersistentState: (_key, initial) => [initial, () => {}] },
    './useOrganizationAccessRevision': { useOrganizationAccessRevision: () => 0 },
    '../hooks/useAttentionNotifications': { useAttentionNotifications: () => [] },
    '../hooks/useVisibleNotificationRecords': { useVisibleNotificationRecords: records => ({ records, session }) },
    '../lib/notificationAttention': { getDashboardAttentionNotifications: () => [] },
    '../lib/notifications': { getOrganizationRequiredActions: () => [] },
    '../lib/currentUser': { userProfileStorageKey: () => 'test-profile' },
    '../lib/linkedSettingsData': { canAccessAssignedOrganization: () => true },
    '../lib/accessControl': {
      APP_MODULES: Object.keys(session.access).map(id => ({ id })),
      canViewMenu: (_session, menu) => menu !== 'messages' || chatAccess,
      canEditMenu: () => true,
      moduleForMenu: () => 'notifications',
      parseSession: value => JSON.parse(value),
    },
    '../lib/relatedObjects': {
      resolveRelatedObject: async object => object,
      loadRelatedObjectChats: () => [conversation],
    },
    '../lib/supabase': {
      supabase: {
        from: table => ({
          select: () => ({
            then: resolve => Promise.resolve({ data: table === 'companies' ? [company] : [document] }).then(resolve),
            eq: async () => ({ data: [document] }),
          }),
        }),
      },
    },
  };
  new Function('require', 'module', 'exports', outputText)(id => {
    if (id in imports) return imports[id];
    if (id === 'react/jsx-runtime') return require(id);
    return { default: id.split('/').at(-1) };
  }, module, module.exports);

  function render() {
    cursor = 0;
    effects = [];
    const tree = module.exports.default({ session, onLogout() {} });
    find(tree, element => element.props['data-app-main']).element.ref.current = main;
    effects.forEach(effect => effect());
    return tree;
  }

  return {
    render, main, conversation, document,
    denyChatAccess() { chatAccess = false; },
    object: { id: 'Chat:chat-1', recordId: conversation.storageKey, type: 'Chat', organizationId: company.id, label: 'Example chat' },
  };
}

function find(tree, predicate, ancestors = [], path = []) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return { element: tree, ancestors, path };
  const children = [tree.props?.children].flat(Infinity);
  for (let i = 0; i < children.length; i++) {
    const match = find(children[i], predicate, [...ancestors, tree], [...path, i]);
    if (match) return match;
  }
  return null;
}

const view = (tree, name) => find(tree, element => element.type === name);
const sidebar = tree => view(tree, 'Sidebar').element.props;

async function openNotificationChat(harness) {
  let tree = harness.render();
  sidebar(tree).onMenuClick('notifications');
  tree = harness.render();
  const originalNotifications = view(tree, 'OrganizationRequiredActionsView');
  harness.main.scrollTop = 540;
  await originalNotifications.element.props.onOpenRelatedObject(harness.object);
  return { tree: harness.render(), originalNotifications };
}

test('notification chat opens inside the normal shell and Back retains the notification subtree and scroll', async () => {
  const harness = createDashboardHarness();
  let { tree, originalNotifications } = await openNotificationChat(harness);
  const chat = view(tree, 'ChatsView');
  const notifications = view(tree, 'OrganizationRequiredActionsView');
  assert.equal(sidebar(tree).activeMenu, 'messages');
  assert.ok(chat.ancestors.some(element => element.props['data-app-main']));
  assert.equal(find(tree, element => element.props['data-app-main']).element.props['data-active-menu'], 'messages');
  assert.ok(!chat.ancestors.some(element => element.props.style?.display === 'none'));
  assert.ok(notifications.ancestors.some(element => element.props.style?.display === 'none'));
  assert.deepEqual(notifications.path, originalNotifications.path, 'Notifications must keep its reconciliation position');
  assert.equal(notifications.element.key, originalNotifications.element.key);
  assert.equal(chat.element.props.conversation.storageKey, harness.conversation.storageKey);
  assert.equal(chat.element.props.preserveConversationMetadata, true);
  assert.equal(harness.main.scrollTop, 0);

  chat.element.props.onBack();
  tree = harness.render();
  assert.equal(sidebar(tree).activeMenu, 'notifications');
  assert.equal(view(tree, 'ChatsView'), null);
  assert.deepEqual(view(tree, 'OrganizationRequiredActionsView').path, originalNotifications.path);
  assert.ok(!view(tree, 'OrganizationRequiredActionsView').ancestors.some(element => element.props.style?.display === 'none'));
  assert.equal(harness.main.scrollTop, 540);
});

test('explicit Chats sidebar navigation exits the notification detour and opens the normal Chats view', async () => {
  const harness = createDashboardHarness();
  let { tree } = await openNotificationChat(harness);
  sidebar(tree).onMenuClick('messages');
  tree = harness.render();
  const chat = view(tree, 'ChatsView').element.props;
  assert.equal(sidebar(tree).activeMenu, 'messages');
  assert.equal(chat.conversation, null);
  assert.equal(chat.onBack, undefined);
  assert.equal(chat.preserveConversationMetadata, undefined);
  assert.equal(view(tree, 'OrganizationRequiredActionsView'), null);
  assert.equal(harness.main.scrollTop, 0, 'manual navigation must not restore the old notification scroll');
});

test('opening a chat document and returning preserves the chat and its notification return path', async () => {
  const harness = createDashboardHarness();
  let { tree } = await openNotificationChat(harness);
  await view(tree, 'ChatsView').element.props.onOpenDocument(harness.document);
  tree = harness.render();
  const companyView = view(tree, 'CompanyDetail').element.props;
  assert.equal(companyView.initialDocumentId, harness.document.id);
  assert.equal(companyView.initialDocumentMode, 'view');
  companyView.onBack();
  tree = harness.render();
  assert.equal(sidebar(tree).activeMenu, 'messages');
  const chat = view(tree, 'ChatsView').element.props;
  assert.equal(chat.conversation.storageKey, harness.conversation.storageKey);
  chat.onBack();
  tree = harness.render();
  assert.equal(sidebar(tree).activeMenu, 'notifications');
  assert.equal(harness.main.scrollTop, 540);
});

test('opening a related chat still rechecks current chat access before navigating', async () => {
  const harness = createDashboardHarness();
  let tree = harness.render();
  sidebar(tree).onMenuClick('notifications');
  tree = harness.render();
  harness.denyChatAccess();
  await assert.rejects(view(tree, 'OrganizationRequiredActionsView').element.props.onOpenRelatedObject(harness.object), /no longer accessible/);
  tree = harness.render();
  assert.equal(sidebar(tree).activeMenu, 'notifications');
  assert.equal(view(tree, 'ChatsView'), null);
});
