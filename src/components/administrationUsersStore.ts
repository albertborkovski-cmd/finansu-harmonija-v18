export interface AdministrationUserRecord {
  id: string;
  username: string;
  email: string;
  fullName: string;
  status: string;
  groups: string;
  createdBy: string;
  creationDate: string;
  updatedBy?: string;
  lastUpdate?: string;
}

export const ADMINISTRATION_USERS_STORAGE_KEY = 'finansu-harmonija-v6:administration:users';

export const INITIAL_ADMINISTRATION_USERS: AdministrationUserRecord[] = [
  { id: 'usr-1', username: 'admin', email: 'admin@finansuharmonija.lt', fullName: 'System Administrator', status: 'Enabled', groups: 'Administrators', createdBy: 'RPA platform', creationDate: '10.04.2026 12:22' },
  { id: 'usr-2', username: 'automation.user', email: 'automation@finansuharmonija.lt', fullName: 'Automation User', status: 'Enabled', groups: 'Developers, RpaPlatform', createdBy: 'Administrator', creationDate: '10.04.2026 12:30' },
  { id: 'usr-3', username: 'monitor.user', email: 'monitor@finansuharmonija.lt', fullName: 'Monitoring User', status: 'Disabled', groups: 'Monitors', createdBy: 'Administrator', creationDate: '11.04.2026 09:14' },
];

export function getAdministrationUsers(): AdministrationUserRecord[] {
  if (typeof window === 'undefined') return INITIAL_ADMINISTRATION_USERS;
  try {
    const stored = window.localStorage.getItem(ADMINISTRATION_USERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) as AdministrationUserRecord[] : INITIAL_ADMINISTRATION_USERS;
  } catch {
    return INITIAL_ADMINISTRATION_USERS;
  }
}

export function saveAdministrationUsers(users: AdministrationUserRecord[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ADMINISTRATION_USERS_STORAGE_KEY, JSON.stringify(users));
  }
}
