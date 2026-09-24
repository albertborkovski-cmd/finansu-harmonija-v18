import type { ReminderRow } from './notifications';
import { TASK_REMINDER_OPTIONS } from './taskSchedule';

export const TASK_TYPES = ['To-do', 'Request', 'Review', 'Approval'] as const;
export const TASK_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
export type TaskAssignee = {
  id: string; userId: string; name: string; email: string;
  audience: 'Internal users' | 'External users'; organizationId: string;
};
export type TaskRelatedObject = NonNullable<ReminderRow['relatedObject']>;
export type TaskDraft = {
  name: string; type: string; organizationId: string; assignedToId: string;
  dueDate: string; relatedObjectId: string; description: string;
  reminder?: string;
  priority?: string;
};
export type TaskCreationContext = {
  session: { email: string; fullName: string };
  organizations: { id: string; name: string }[];
  assignees: TaskAssignee[];
  relatedObjects: TaskRelatedObject[];
  organizationContextId?: string;
};

export function validateTaskDraft(draft: TaskDraft, context: TaskCreationContext): Partial<Record<keyof TaskDraft, string>> {
  const errors: Partial<Record<keyof TaskDraft, string>> = {};
  if (draft.priority !== undefined && !(TASK_PRIORITIES as readonly string[]).includes(draft.priority)) errors.priority = 'Select a valid priority.';
  if (!draft.name.trim()) errors.name = 'Enter a task name.';
  if (!(TASK_TYPES as readonly string[]).includes(draft.type)) errors.type = 'Select a task type.';
  if (!context.organizations.some(org => org.id === draft.organizationId)) errors.organizationId = 'Select an available organization.';
  if (context.organizationContextId && context.organizationContextId !== draft.organizationId) errors.organizationId = 'The organization cannot be changed in this context.';
  if (!context.assignees.some(user => user.id === draft.assignedToId && user.organizationId === draft.organizationId)) errors.assignedToId = 'Select an active user assigned to this organization.';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate) ? new Date(`${draft.dueDate}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== draft.dueDate) errors.dueDate = 'Select a valid due date (YYYY-MM-DD).';
  if (draft.reminder !== undefined && !TASK_REMINDER_OPTIONS.some(option => option.value === draft.reminder)) errors.reminder = 'Select a valid reminder.';
  if (draft.relatedObjectId && !context.relatedObjects.some(object => object.id === draft.relatedObjectId && object.organizationId === draft.organizationId)) errors.relatedObjectId = 'Select an available object from this organization.';
  return errors;
}

function editableTaskFields(draft: TaskDraft, context: TaskCreationContext) {
  const errors = validateTaskDraft(draft, context);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (!context.session.email.trim()) throw new Error('A signed-in user is required.');
  const organization = context.organizations.find(org => org.id === draft.organizationId)!;
  const assignee = context.assignees.find(user => user.id === draft.assignedToId && user.organizationId === draft.organizationId)!;
  const relatedObject = context.relatedObjects.find(object => object.id === draft.relatedObjectId && object.organizationId === organization.id);
  return {
    name: draft.name.trim(), type: draft.type, message: draft.description.trim(),
    priority: (draft.priority ?? 'Normal') as NonNullable<ReminderRow['priority']>,
    organizationId: organization.id, organizationName: organization.name,
    assignedToId: assignee.id, assignedToName: assignee.name, assignedToEmail: assignee.email,
    assignedToAudience: assignee.audience, dueDate: draft.dueDate,
    reminder: TASK_REMINDER_OPTIONS.find(option => option.value === (draft.reminder ?? 'none'))!.value,
    relatedObject: draft.relatedObjectId && relatedObject ? { ...relatedObject } : undefined,
  };
}

/** Construct trusted automatic metadata at save time, never from editable draft fields. */
export function createTaskRecord(draft: TaskDraft, context: TaskCreationContext, id = crypto.randomUUID(), now = new Date().toISOString()): ReminderRow {
  return {
    ...editableTaskFields(draft, context), id,
    source: 'Manual', createdByEmail: context.session.email, createdByName: context.session.fullName || context.session.email,
    createdAt: now, status: 'Active', taskStatus: 'Open', requiresAction: true, daysTillRemind: '',
  };
}

/** Editing changes only validated form fields; provenance, lifecycle and other metadata stay intact. */
export function updateTaskRecord(existing: ReminderRow, draft: TaskDraft, context: TaskCreationContext): ReminderRow {
  return { ...existing, ...editableTaskFields(draft, context) };
}

function canonicalTaskValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalTaskValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalTaskValue(entry)]));
  }
  return value;
}

/** Personal reading updates may coexist with an editor; all other persisted changes require a reload. */
export function assertTaskUnchanged(current: ReminderRow, original: ReminderRow): void {
  const snapshot = (task: ReminderRow) => JSON.stringify(canonicalTaskValue(
    Object.fromEntries(Object.entries(task).filter(([key]) => key !== 'readAtByEmail')),
  ));
  if (snapshot(current) !== snapshot(original)) {
    throw new Error('This task changed while the editor was open. Close the editor, refresh the list, and try again.');
  }
}
