import { SAMPLE_REMINDERS, type ReminderRow } from './notifications';

type TaskProvenance = {
  source: string;
  createdBy: string;
  createdByEmail?: string;
  legacy: boolean;
};

const SEED_CONTENT_FIELDS = ['id', 'name', 'type', 'daysTillRemind', 'message'] as const;
const SEED_DISPLAY_FIELDS = new Set<string>([
  ...SEED_CONTENT_FIELDS,
  'status', 'taskStatus', 'resolvedAt', 'requiresAction', 'readAtByEmail',
  'source', 'createdByName', 'createdByEmail', 'category',
]);

function recordedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Recognize only unchanged seed content, allowing lifecycle and display metadata. */
function isKnownDemoTask(task: ReminderRow): boolean {
  if (Object.entries(task).some(([key, value]) => value !== undefined && (
    !SEED_DISPLAY_FIELDS.has(key) || (key === 'category' && value !== 'reminders')
  ))) return false;

  return SAMPLE_REMINDERS.some(seed => SEED_CONTENT_FIELDS.every(key => task[key] === seed[key]));
}

/** Display provenance without rewriting old records or attributing them to the viewer. */
export function getTaskProvenance(task: ReminderRow): TaskProvenance {
  const recordedSource = recordedText(task.source);
  const createdByEmail = recordedText(task.createdByEmail);
  const recordedCreator = recordedText(task.createdByName) || createdByEmail;
  const demo = (!recordedSource || !recordedCreator) && isKnownDemoTask(task);
  const source = recordedSource || (demo ? 'Demo data' : 'Not recorded');
  const createdBy = recordedCreator || (demo ? 'System' : 'Not recorded');

  return {
    source,
    createdBy,
    ...(createdByEmail ? { createdByEmail } : {}),
    legacy: !demo && (!recordedSource || !recordedCreator),
  };
}
