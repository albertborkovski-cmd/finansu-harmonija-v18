export type AppModuleId = 'companies' | 'chats' | 'notifications' | 'settings' | 'faq' | 'ocr';

export type ModulePermission = {
  view: boolean;
  edit: boolean;
};

export type AccessMap = Record<AppModuleId, ModulePermission>;

export type MenuAccessMap = Record<string, ModulePermission>;

export type RoleAccessNode = {
  id: string;
  label: string;
  module: AppModuleId;
  children?: RoleAccessNode[];
};

export type AppSession = {
  email: string;
  fullName: string;
  roleNames: string[];
  access: AccessMap;
  menuAccess: MenuAccessMap;
};

export const APP_MODULES: Array<{ id: AppModuleId; label: string }> = [
  { id: 'companies', label: 'Companies' },
  { id: 'chats', label: 'Chats' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'settings', label: 'Settings' },
  { id: 'faq', label: 'FAQ' },
  { id: 'ocr', label: 'OCR' },
];

export const ROLE_ACCESS_TREE: RoleAccessNode[] = [
  {
    id: 'module:companies', label: 'Dashboard & Companies', module: 'companies', children: [
      { id: 'global-dashboard', label: 'Dashboard', module: 'companies' },
      { id: 'uploaded-documents', label: 'Uploaded documents', module: 'companies' },
      { id: 'dashboard', label: 'Companies', module: 'companies' },
    ],
  },
  { id: 'messages', label: 'Chats', module: 'chats' },
  { id: 'notifications', label: 'Notifications & Reminders', module: 'notifications' },
  {
    id: 'module:settings', label: 'Settings', module: 'settings', children: [
      {
        id: 'settings-internal', label: 'Internal Users', module: 'settings', children: [
          { id: 'settings-internal-roles', label: 'Roles', module: 'settings' },
          { id: 'settings-internal-users', label: 'Users', module: 'settings' },
        ],
      },
      {
        id: 'settings-external', label: 'External Users', module: 'settings', children: [
          { id: 'settings-external-roles', label: 'Roles', module: 'settings' },
          { id: 'settings-external-users', label: 'Users', module: 'settings' },
        ],
      },
      {
        id: 'settings-organizations', label: 'Organizations', module: 'settings', children: [
          { id: 'settings-organizations-company-status', label: 'Company status', module: 'settings' },
          { id: 'settings-organizations-tax-country', label: 'Tax country', module: 'settings' },
          { id: 'settings-organizations-legal-form', label: 'Legal form', module: 'settings' },
          { id: 'settings-organizations-base-currency', label: 'Base currency', module: 'settings' },
          { id: 'settings-organizations-document-type', label: 'Document type', module: 'settings' },
          { id: 'settings-organizations-document-status', label: 'Document Status', module: 'settings' },
          { id: 'settings-organizations-unit', label: 'Unit', module: 'settings' },
          { id: 'settings-organizations-operation-date-validation', label: 'Operation date validation', module: 'settings' },
          { id: 'settings-organizations-email', label: 'Email templates', module: 'settings' },
          { id: 'settings-vat-classifications', label: 'VAT classifications', module: 'settings' },
        ],
      },
      { id: 'settings-counterparties', label: 'Counterparties', module: 'settings' },
      { id: 'settings-general-ledger', label: 'General ledger', module: 'settings' },
    ],
  },
  { id: 'settings-analytics', label: 'Analytics', module: 'settings' },
  { id: 'info', label: 'FAQ', module: 'faq' },
  {
    id: 'module:ocr', label: 'OCR', module: 'ocr', children: [
      {
        id: 'ocr-all-documents', label: 'All documents', module: 'ocr', children: [
          { id: 'ocr-all-documents-processed', label: 'Processed documents', module: 'ocr' },
          { id: 'ocr-all-documents-uploaded', label: 'Uploaded documents', module: 'ocr' },
        ],
      },
      { id: 'ocr-workspace', label: 'Workspace', module: 'ocr' },
      { id: 'ocr-ml', label: 'Machine learning', module: 'ocr' },
      {
        id: 'ocr-review', label: 'Review', module: 'ocr', children: [
          { id: 'ocr-review-approve-documents', label: 'Approve documents', module: 'ocr' },
          { id: 'ocr-review-analytics', label: 'Analytics', module: 'ocr' },
        ],
      },
      {
        id: 'ocr-admin', label: 'Administration', module: 'ocr', children: [
          { id: 'ocr-admin-human-task-types', label: 'OCR Validation Settings', module: 'ocr' },
          { id: 'ocr-admin-activity', label: 'Activity Log', module: 'ocr' },
        ],
      },
    ],
  },
];

export function flattenRoleAccessTree(nodes = ROLE_ACCESS_TREE): RoleAccessNode[] {
  return nodes.flatMap(node => [node, ...flattenRoleAccessTree(node.children ?? [])]);
}

export function createMenuAccessFromModules(access: AccessMap): MenuAccessMap {
  return Object.fromEntries(
    flattenRoleAccessTree().map(node => [node.id, { ...access[node.module] }]),
  );
}

export function createFullMenuAccess(): MenuAccessMap {
  return createMenuAccessFromModules(createFullAccess());
}

export function deriveModuleAccess(menuAccess: MenuAccessMap): AccessMap {
  const result = createEmptyAccess();
  ROLE_ACCESS_TREE.forEach(node => {
    const permission = menuAccess[node.id] ?? { view: false, edit: false };
    result[node.module] = { view: permission.view, edit: permission.edit };
  });
  return result;
}

export function canViewMenu(session: AppSession, menu: string): boolean {
  const exact = session.menuAccess?.[menu];
  const node = flattenRoleAccessTree().find(item => item.id === menu);
  if (node?.children?.length)
    return Boolean(exact?.view) || node.children.some(child => canViewMenu(session, child.id));
  if (exact) return exact.view;
  const module = moduleForMenu(menu);
  return module ? session.access[module].view : true;
}

export function canEditMenu(session: AppSession, menu: string): boolean {
  const exact = session.menuAccess?.[menu];
  if (exact) return exact.edit;
  const module = moduleForMenu(menu);
  return module ? session.access[module].edit : true;
}

export const createEmptyAccess = (): AccessMap => Object.fromEntries(
  APP_MODULES.map(module => [module.id, { view: false, edit: false }]),
) as AccessMap;

export const createFullAccess = (): AccessMap => Object.fromEntries(
  APP_MODULES.map(module => [module.id, { view: true, edit: true }]),
) as AccessMap;

export const createFullViewAccess = (): AccessMap => Object.fromEntries(
  APP_MODULES.map(module => [module.id, { view: true, edit: false }]),
) as AccessMap;

const SYSTEM_ADMIN_ROLE_NAMES = new Set(['administrator', 'administration']);

export function isSystemAdministratorRole(roleName?: string): boolean {
  return SYSTEM_ADMIN_ROLE_NAMES.has(roleName?.trim().toLowerCase() ?? '');
}

export function moduleForMenu(menu: string): AppModuleId | null {
  if (menu === 'dashboard' || menu === 'global-dashboard' || menu === 'uploaded-documents') return 'companies';
  if (menu === 'messages') return 'chats';
  if (menu === 'notifications') return 'notifications';
  if (menu === 'settings' || menu.startsWith('settings-')) return 'settings';
  if (menu === 'info') return 'faq';
  if (menu === 'ocr' || menu.startsWith('ocr-')) return 'ocr';
  return null;
}

type StoredRow = { [key: string]: string };

function readRows(key: string): StoredRow[] {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as StoredRow[] : [];
  } catch {
    return [];
  }
}

function parseAccess(value?: string): AccessMap | null {
  if (!value || value === '—') return null;
  try {
    const parsed = JSON.parse(value) as Partial<AccessMap>;
    const result = createEmptyAccess();
    APP_MODULES.forEach(module => {
      result[module.id] = {
        view: Boolean(parsed[module.id]?.view),
        edit: Boolean(parsed[module.id]?.edit),
      };
      if (result[module.id].edit) result[module.id].view = true;
    });
    return result;
  } catch {
    return null;
  }
}

function parseMenuAccess(value: string | undefined, fallback: AccessMap): MenuAccessMap {
  if (!value || value === '—') return createMenuAccessFromModules(fallback);
  try {
    const parsed = JSON.parse(value) as MenuAccessMap;
    const result = createMenuAccessFromModules(fallback);
    flattenRoleAccessTree().forEach(node => {
      if (!parsed[node.id]) return;
      result[node.id] = {
        view: Boolean(parsed[node.id].view),
        edit: Boolean(parsed[node.id].edit),
      };
      if (result[node.id].edit) result[node.id].view = true;
    });
    return result;
  } catch {
    return createMenuAccessFromModules(fallback);
  }
}

function resolveConfiguredUser(email: string): AppSession | null {
  for (const audience of ['internal', 'external']) {
    const prefix = `finansu-harmonija:v7:settings:${audience}`;
    const user = readRows(`${prefix}:users`).find(row => row.email?.trim().toLowerCase() === email);
    if (!user || user.status === 'Disabled') continue;

    const assignedRoles = (user.roles ?? '').split(',').map(role => role.trim()).filter(role => role && role !== 'Unassigned');
    const roles = readRows(`${prefix}:roles`).filter(role => assignedRoles.includes(role.name));

    // Administrator/Administration is a system-wide role. Its access is not
    // constrained by a stale saved permission snapshot: newly added modules,
    // organizations and records are covered automatically.
    if (assignedRoles.some(isSystemAdministratorRole)) {
      return {
        email,
        fullName: user.fullName || user.username || email,
        roleNames: assignedRoles,
        access: createFullAccess(),
        menuAccess: createFullMenuAccess(),
      };
    }

    const access = createEmptyAccess();
    const menuAccess = createMenuAccessFromModules(access);
    roles.forEach(role => {
      const roleAccess = parseAccess(role.moduleAccess);
      if (!roleAccess) return;
      const roleMenuAccess = parseMenuAccess(role.menuAccess, roleAccess);
      APP_MODULES.forEach(module => {
        access[module.id].view ||= roleAccess[module.id].view;
        access[module.id].edit ||= roleAccess[module.id].edit;
      });
      flattenRoleAccessTree().forEach(node => {
        menuAccess[node.id].view ||= roleMenuAccess[node.id].view;
        menuAccess[node.id].edit ||= roleMenuAccess[node.id].edit;
      });
    });

    if (assignedRoles.includes('Meso accountant') && !roles.length) {
      const accountantAccess = createFullAccess();
      accountantAccess.ocr = { view: false, edit: false };
      return {
        email,
        fullName: user.fullName || user.username || email,
        roleNames: assignedRoles,
        access: accountantAccess,
        menuAccess: createMenuAccessFromModules(accountantAccess),
      };
    }

    const hasVisibleModule = APP_MODULES.some(module => access[module.id].view);

    return {
      email,
      fullName: user.fullName || user.username || email,
      roleNames: assignedRoles.length ? assignedRoles : ['Unassigned'],
      access: hasVisibleModule ? access : createFullViewAccess(),
      menuAccess: hasVisibleModule ? menuAccess : createMenuAccessFromModules(createFullViewAccess()),
    };
  }
  return null;
}

export function resolveSessionForEmail(rawEmail: string): AppSession {
  const email = rawEmail.trim().toLowerCase();
  if (
    email === 'albertborkvski@gmail.com' ||
    email === 'albertborkovski@gmail.com' ||
    email === 'albert.borkovski@gmail.com'
  ) {
    return { email, fullName: 'Albert Borkovski', roleNames: ['Administrator'], access: createFullAccess(), menuAccess: createFullMenuAccess() };
  }
  if (email === 'albert.borkovski@yahoo.com') {
    return {
      email,
      fullName: 'Albert Borkovski',
      roleNames: ['Meso accountant'],
      access: (() => {
        const access = createFullAccess();
        access.ocr = { view: false, edit: false };
        return access;
      })(),
      menuAccess: (() => {
        const access = createFullAccess();
        access.ocr = { view: false, edit: false };
        return createMenuAccessFromModules(access);
      })(),
    };
  }

  const configured = resolveConfiguredUser(email);
  if (configured) return configured;

  // Keep the complete project visible for a newly signed-in account. Editing
  // remains disabled until an administrator assigns an explicit role.
  const access = createFullViewAccess();
  return { email, fullName: email.split('@')[0] || 'Unassigned user', roleNames: ['Viewer'], access, menuAccess: createMenuAccessFromModules(access) };
}

export function serializeSession(session: AppSession) {
  return JSON.stringify(session);
}

export function parseSession(value: string | null): AppSession | null {
  if (!value) return null;
  if (value === 'true') return resolveSessionForEmail('albertborkvski@gmail.com');
  try {
    const parsed = JSON.parse(value) as AppSession;
    // Re-resolve permissions on every load so role changes take effect without
    // retaining an outdated access snapshot in the browser session.
    return parsed?.email ? resolveSessionForEmail(parsed.email) : null;
  } catch {
    return null;
  }
}
