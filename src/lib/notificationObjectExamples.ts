import { canEditMenu, canViewMenu, parseSession, type AppSession } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';
import { canAccessAssignedOrganization } from './linkedSettingsData';
import { getRelevantActionsForTab, SAMPLE_NOTIFICATIONS, SAMPLE_REMINDERS, type NotificationRow, type ReminderRow } from './notifications';
import { loadRelatedObjects } from './relatedObjects';
import type { Company } from './supabase';
import { createTaskRecord } from './taskCreation';
import { loadTaskAssignees } from './taskFormData';
import { getLocalDateKey } from './taskSchedule';

const NOTIFICATIONS_KEY = 'finansu-harmonija:v7:notifications';
const TASKS_KEY = 'finansu-harmonija:v7:reminders';
const EXAMPLE_TYPES = ['Task', 'Document', 'Invoice', 'Bank operation'] as const;
const normalize = (value: string) => value.trim().toLowerCase();

function readRows<T extends { id: string }>(key: string, fallback: readonly T[]): T[] {
  const saved = window.localStorage.getItem(key);
  const rows: unknown = saved === null ? fallback : JSON.parse(saved);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim()
    || ['recipientEmails', 'relevantRoles'].some(field => row[field] !== undefined
      && (!Array.isArray(row[field]) || row[field].some((item: unknown) => typeof item !== 'string'))))) {
    throw new Error('Unable to read existing notification test records.');
  }
  return rows as T[];
}

function currentSessionFor(session: AppSession, organization?: Company): AppSession | undefined {
  const current = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  if (!normalize(session.email) || !current || normalize(current.email) !== normalize(session.email)
    || !current.access.companies.view || !canViewMenu(current, 'notifications')
    || (organization && !canAccessAssignedOrganization(organization, current))) return undefined;
  return current;
}

function changed(storageKey: string) {
  window.dispatchEvent(new CustomEvent('finansu-harmonija:persistent-state-changed', { detail: { storageKey } }));
}

/** Explicit local-development examples. Call only in DEV; original business records are read-only. */
export async function ensureObjectNotificationExamples(organizations: readonly Company[], session: AppSession): Promise<number> {
  const current = currentSessionFor(session);
  if (!current) return 0;
  const available = organizations.filter(organization => canAccessAssignedOrganization(organization, current));
  const organization = available.find(company => company.name === 'Alice Stone') ?? available[0];
  if (!organization) return 0;
  const identity = [organization.id, normalize(current.email)].map(encodeURIComponent).join(':');
  const marker = (type: string) => `finansu-harmonija:v15:object-notification-example:${identity}:${type}`;
  if (EXAMPLE_TYPES.every(type => window.localStorage.getItem(marker(type)) !== null)) return 0;

  // Validate both shared stores before any write; malformed data must never be replaced with seeds.
  readRows(NOTIFICATIONS_KEY, SAMPLE_NOTIFICATIONS);
  readRows(TASKS_KEY, SAMPLE_REMINDERS);
  const objects = await loadRelatedObjects(organization, current);
  const latest = currentSessionFor(session, organization);
  if (!latest) return 0;
  // Read again after the asynchronous catalog lookup so concurrent reading/editing is preserved.
  const notifications = readRows(NOTIFICATIONS_KEY, SAMPLE_NOTIFICATIONS);
  const tasks = readRows(TASKS_KEY, SAMPLE_REMINDERS);
  const additions: NotificationRow[] = [];
  const completed: string[] = [];
  let newTask: ReminderRow | undefined;
  const now = new Date();

  for (const type of EXAMPLE_TYPES) {
    if (window.localStorage.getItem(marker(type)) !== null) continue;
    const id = `demo-object-notification:${identity}:${encodeURIComponent(type)}`;
    if (notifications.some(row => row.id === id)) {
      completed.push(type);
      continue;
    }
    let sourceTaskId: string | undefined;
    const relatedObject = type === 'Task' ? undefined : objects.find(object => object.type === type && object.organizationId === organization.id);
    if (type === 'Task') {
      const visibleTasks = getRelevantActionsForTab(tasks.filter(task => task.organizationId === organization.id
        && typeof task.name === 'string' && Boolean(task.name.trim())).map(task => ({ ...task, category: 'reminders' })), latest, 'reminders');
      sourceTaskId = visibleTasks[0]?.id;
      const taskId = `demo-notification-task:${identity}`;
      if (!sourceTaskId && !tasks.some(task => task.id === taskId)
        && window.localStorage.getItem(marker('task-source')) === null && canEditMenu(latest, 'notifications')) {
        const assignees = loadTaskAssignees(organization);
        const assignee = assignees.find(user => normalize(user.email) === normalize(latest.email));
        if (assignee) {
          newTask = {
            ...createTaskRecord({
              name: 'Demo: notification navigation task', type: 'To-do', organizationId: organization.id,
              assignedToId: assignee.id, dueDate: getLocalDateKey(now), reminder: 'none', relatedObjectId: '',
              description: 'Demo task for testing Notifications → Open task. You may complete or cancel this test task. No business record was changed.',
            }, { session: latest, organizations: [organization], assignees, relatedObjects: [] }, undefined, now.toISOString()),
            id: taskId,
            recipientEmails: [normalize(latest.email)],
          };
          sourceTaskId = newTask.id;
        }
      }
      if (!sourceTaskId) continue;
    } else if (!relatedObject) continue;

    additions.push({
      id, origin: 'system', createdAt: now.toISOString(), name: `Demo: Open ${type.toLowerCase()}`, type,
      message: `Demo navigation test: open the ${type.toLowerCase()}${relatedObject ? ` “${relatedObject.label}”` : ''} in ${organization.name}. No business record was changed.`,
      status: 'Active', requiresAction: false, organizationId: organization.id, organizationName: organization.name,
      recipientEmails: [normalize(latest.email)], sourceTaskId, relatedObject,
    });
    completed.push(type);
  }
  if (!currentSessionFor(session, organization)) return 0;
  if (newTask) {
    // Record issuance first: even an interrupted/failed save must not recreate a removed demo Task.
    window.localStorage.setItem(marker('task-source'), 'issued');
    window.localStorage.setItem(TASKS_KEY, JSON.stringify([...tasks, newTask]));
  }
  if (additions.length) window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify([...notifications, ...additions]));
  for (const type of completed) window.localStorage.setItem(marker(type), 'issued');
  if (newTask) changed(TASKS_KEY);
  if (additions.length) changed(NOTIFICATIONS_KEY);
  return additions.length;
}
