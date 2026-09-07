import {
  loadLinkedDirectoryUsers,
  saveLinkedDirectoryUsers,
  type SettingsAudience,
} from './linkedSettingsData';

export type LoginHistoryEntry = {
  id: string;
  date: string;
  device: string;
  status: 'Successful' | 'Failed';
};

export const LOGIN_HISTORY_CHANGED_EVENT = 'finansu-harmonija:login-history-changed';

const normalizeLoginEmail = (value?: string) => {
  const email = value?.trim().toLocaleLowerCase() ?? '';
  if (
    email === 'albertborkvski@gmail.com' ||
    email === 'albertborkovski@gmail.com' ||
    email === 'albert.borkovski@gmail.com'
  ) {
    return 'albertborkovski@gmail.com';
  }
  return email;
};

export const loginHistoryStorageKey = (email: string) =>
  `finansu-harmonija:v12:login-history:${normalizeLoginEmail(email)}`;

function browserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/OPR\//.test(userAgent)) return 'Opera';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Browser';
}

function operatingSystem(userAgent: string) {
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Unknown device';
}

function currentDevice() {
  if (typeof navigator === 'undefined') return 'Unknown device';
  return `${browserName(navigator.userAgent)} · ${operatingSystem(navigator.userAgent)}`;
}

export function loadLoginHistory(email: string): LoginHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(loginHistoryStorageKey(email)) ?? '[]',
    ) as LoginHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function directoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function recordLoginAttempt(email: string, status: LoginHistoryEntry['status']) {
  if (typeof window === 'undefined') return;

  const entry: LoginHistoryEntry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    device: currentDevice(),
    status,
  };
  const history = [entry, ...loadLoginHistory(email)].slice(0, 100);
  window.localStorage.setItem(loginHistoryStorageKey(email), JSON.stringify(history));

  (['Internal users', 'External users'] as SettingsAudience[]).forEach(audience => {
    const users = loadLinkedDirectoryUsers(audience);
    let changed = false;
    const nextUsers = users.map(user => {
      if (normalizeLoginEmail(user.email) !== normalizeLoginEmail(email)) return user;
      changed = true;
      return {
        ...user,
        lastLogin: status === 'Successful' ? directoryDate(entry.date) : user.lastLogin,
        loginHistory: JSON.stringify(
          history.map(item => ({
            date: directoryDate(item.date),
            device: item.device,
            status: item.status,
          })),
        ),
      };
    });
    if (changed) saveLinkedDirectoryUsers(audience, nextUsers, false);
  });

  window.dispatchEvent(new CustomEvent(LOGIN_HISTORY_CHANGED_EVENT));
}

export function recordSuccessfulLogin(email: string) {
  recordLoginAttempt(email, 'Successful');
}

export function recordFailedLogin(email: string) {
  recordLoginAttempt(email, 'Failed');
}
