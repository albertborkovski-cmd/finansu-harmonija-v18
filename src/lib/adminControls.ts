import { isSystemAdministratorRole, type AppSession } from './accessControl';

export const ADMIN_CONTROLS_KEY = 'finansu-harmonija:v18:admin-controls';
export const ADMIN_CONTROLS_EVENT = 'fh-admin-controls-changed';
export type Maintenance = { id: string; start: number; end: number; reminderMinutes: number; message: string };
export type AdminControls = {
  maintenance: Maintenance | null;
  revokedBefore: Record<string, number>;
  blocks: Record<string, { until: number; reason: string }>;
  history: { id: string; at: number; actor: string; action: string }[];
};
export function loadAdminControls(): AdminControls {
  const raw = window.localStorage.getItem(ADMIN_CONTROLS_KEY);
  return raw ? JSON.parse(raw) : { maintenance: null, revokedBefore: {}, blocks: {}, history: [] };
}
export const isControlAdmin = (session: AppSession) => session.roleNames.some(isSystemAdministratorRole);
export function updateAdminControls(session: AppSession, action: string, change: (current: AdminControls) => AdminControls) {
  if (!isControlAdmin(session)) throw new Error('Only Meso Administrator can manage these settings.');
  const next = change(loadAdminControls());
  next.history = [{ id: crypto.randomUUID(), at: Date.now(), actor: session.email, action }, ...next.history];
  window.localStorage.setItem(ADMIN_CONTROLS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(ADMIN_CONTROLS_EVENT));
  return next;
}
export function loginRestriction(policy: AdminControls, session: AppSession, now: number): string | null {
  if (isControlAdmin(session)) return null;
  const maintenance = policy.maintenance;
  if (maintenance && now >= maintenance.start && now < maintenance.end) return `${maintenance.message} Access resumes ${new Date(maintenance.end).toLocaleString()}.`;
  const block = policy.blocks[session.email.toLowerCase()];
  return block && now < block.until ? `${block.reason} Access resumes ${new Date(block.until).toLocaleString()}.` : null;
}
export function sessionRevoked(policy: AdminControls, session: AppSession, startedAt: number, now = Date.now()) {
  const scheduledCutoff = policy.maintenance && policy.maintenance.start <= now ? policy.maintenance.start : 0;
  return !isControlAdmin(session) && Math.max(scheduledCutoff, policy.revokedBefore['*'] || 0, policy.revokedBefore[session.email.toLowerCase()] || 0) >= startedAt;
}
