import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  Upload,
  Activity,
  LogIn,
  ShieldCheck,
  Building2,
  FileText,
  PencilLine,
  ChevronDown,
} from 'lucide-react';
import UnsubscribeModal from './UnsubscribeModal';
import { SaveButton } from './ScopedActionButtons';
import { usePersistentState } from '../hooks/usePersistentState';
import { userProfileStorageKey } from '../lib/currentUser';
import {
  LOGIN_HISTORY_CHANGED_EVENT,
  loadLoginHistory,
  type LoginHistoryEntry,
} from '../lib/loginHistory';
import { supabase, type Company, type DbDocument } from '../lib/supabase';
import {
  SETTINGS_DATA_CHANGED_EVENT,
  isActiveLinkedOrganization,
  loadLinkedDirectoryUsers,
  reconcileOrganizationUserLinks,
  type LinkedOrganization,
  type SettingsAudience,
} from '../lib/linkedSettingsData';
import { SystemBreadcrumb } from './SystemNavigation';

interface ProfileSettingsProps {
  user: {
    role: string;
    name: string;
    email: string;
    phone: string;
  };
  onProfileSaved?: (profile: { fullName: string; email: string; phone: string; role: string }) => void;
  onOpenCompanies?: () => void;
}

interface ProfileErrors {
  fullName: string;
  email: string;
  phone: string;
}

interface PasswordErrors {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface TouchedFields {
  fullName: boolean;
  email: boolean;
  phone: boolean;
}

interface PasswordTouched {
  currentPassword: boolean;
  newPassword: boolean;
  confirmPassword: boolean;
}

type ProfileSettingsTab =
  | 'profile'
  | 'integrations'
  | 'security'
  | 'notifications'
  | 'accessActivity';

const PROFILE_SETTINGS_TABS: Array<{
  id: ProfileSettingsTab;
  label: string;
}> = [
  { id: 'profile', label: 'Profile' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'security', label: 'Authorization notifications' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'accessActivity', label: 'Access & activity' },
];

const normalizeDirectoryEmail = (value?: string) => {
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

const isDirectoryEmailMatch = (directoryEmail: string | undefined, sessionEmail: string) =>
  normalizeDirectoryEmail(directoryEmail) === normalizeDirectoryEmail(sessionEmail);

type ProfileActivityRow = {
  id: string;
  date: string;
  organization: string;
  action: string;
  object: string;
};

type RawDocumentHistory = {
  id: string;
  document_id: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
};

const normalizeActivityIdentity = (value?: string) => {
  const normalizedEmail = normalizeDirectoryEmail(value);
  return normalizedEmail || value?.trim().toLocaleLowerCase() || '';
};

const formatActivityDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()} - ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function SecurityToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-[22px] w-[38px] flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-main-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
        checked ? 'bg-main-blue' : 'bg-[#A1B6C6]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${
          checked ? 'right-[3px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

const PROFILE_DOCUMENT_ACTIVITY = {
  created: [
    ['2026-08-08 17:03', 'EXP-003', 'Expense document'],
    ['2026-08-07 11:15', 'AN-2026-0012', 'Accounting note'],
    ['2026-08-05 15:37', 'INV-2026-0031', 'Invoice'],
    ['2026-08-04 09:18', 'AGR-2026-0008', 'Agreement'],
  ],
  edited: [
    ['2026-08-11 09:48', 'INV-2026-0042', 'Invoice'],
    ['2026-08-08 14:26', 'INV-2026-0038', 'Invoice'],
    ['2026-08-06 16:41', 'CP-2026-0014', 'Counterparty document'],
    ['2026-08-05 12:09', 'EXP-2026-0029', 'Expense document'],
  ],
} as const;

interface ProfileNotificationOption {
  id: string;
  label: string;
  audience: string;
  inApp: boolean;
  email: boolean;
  required?: boolean;
}

interface ProfileNotificationCategory {
  id: string;
  label: string;
  required?: boolean;
  options: ProfileNotificationOption[];
}

const PROFILE_NOTIFICATION_CATEGORIES: ProfileNotificationCategory[] = [
  {
    id: 'documents',
    label: 'Documents',
    options: [
      { id: 'document-ready', label: 'Document processed and ready for review', audience: 'Accountants and organization users with access', inApp: true, email: false },
      { id: 'document-additional-data', label: 'Document requires additional data', audience: 'User responsible for providing the information', inApp: true, email: true },
      { id: 'document-rejected', label: 'Document rejected', audience: 'Submitting or responsible user', inApp: true, email: true },
      { id: 'document-duplicate', label: 'Possible document duplicate detected', audience: 'Accountant or document owner', inApp: true, email: false },
      { id: 'document-exception', label: 'Document processing exception or error', audience: 'Responsible accountant or administrator', inApp: true, email: true },
      { id: 'document-not-document', label: 'File recognized as Not Document', audience: 'Accountant or document owner', inApp: true, email: false },
      { id: 'document-transfer-failed', label: 'Transfer to the accounting system failed', audience: 'Accountant or administrator with access', inApp: true, email: true },
      { id: 'document-comment', label: 'New comment or mention on a document', audience: 'Related or mentioned user', inApp: true, email: false },
    ],
  },
  {
    id: 'chats',
    label: 'Chats',
    options: [
      { id: 'chat-message', label: 'New chat message received', audience: 'Chat participants', inApp: true, email: false },
    ],
  },
  {
    id: 'tasks',
    label: 'Tasks / Activities',
    options: [
      { id: 'task-assigned', label: 'New task assigned to you', audience: 'Task assignee', inApp: true, email: true },
      { id: 'task-due-today', label: 'Task is due today', audience: 'Task assignee', inApp: true, email: false },
      { id: 'task-overdue', label: 'Task became overdue', audience: 'Task assignee', inApp: true, email: true },
      { id: 'task-changed', label: 'Assigned task significantly changed or was cancelled', audience: 'Task assignee', inApp: true, email: false },
    ],
  },
  {
    id: 'bank-payments',
    label: 'Bank & payments',
    options: [
      { id: 'bank-sync-failed', label: 'Bank data or statement synchronization failed', audience: 'Users with bank access', inApp: true, email: true },
      { id: 'payment-failed', label: 'Payment rejected or failed', audience: 'Payment initiator or responsible user', inApp: true, email: true },
      { id: 'payment-completed', label: 'Payment completed successfully', audience: 'Payment initiator or responsible user', inApp: true, email: false },
    ],
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation',
    options: [
      { id: 'reconciliation-review', label: 'Reconciliation requires user review', audience: 'Responsible accountant or organization user', inApp: true, email: true },
    ],
  },
  {
    id: 'debts-reminders',
    label: 'Debts & reminders',
    options: [
      { id: 'new-overdue-debts', label: 'New overdue or unsettled debts detected', audience: 'User responsible for debt control', inApp: true, email: false },
      { id: 'debt-reminder-failed', label: 'Debt reminder could not be sent', audience: 'Responsible accountant', inApp: true, email: true },
    ],
  },
  {
    id: 'reports-declarations',
    label: 'Reports & declarations',
    options: [
      { id: 'report-ready', label: 'Scheduled report or declaration is ready', audience: 'Requesting or responsible user', inApp: true, email: false },
      { id: 'report-failed', label: 'Report or declaration generation failed', audience: 'Requesting or responsible user', inApp: true, email: true },
      { id: 'report-deadline', label: 'Report or declaration deadline is approaching', audience: 'Responsible user', inApp: true, email: true },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    options: [
      { id: 'accounting-export-failed', label: 'Accounting integration or export failed', audience: 'Responsible accountant or administrator', inApp: true, email: true },
      { id: 'sharepoint-sync-failed', label: 'SharePoint import or synchronization failed', audience: 'Responsible accountant or administrator', inApp: true, email: true },
      { id: 'government-connection-failed', label: 'VMI / SODRA authentication or connection failed', audience: 'User performing the action', inApp: true, email: true },
      { id: 'integration-credentials-expiring', label: 'Integration credentials need to be updated', audience: 'Credentials owner', inApp: true, email: true },
    ],
  },
  {
    id: 'access-changes',
    label: 'Access changes',
    required: true,
    options: [
      { id: 'organization-access-changed', label: 'Organization access granted or removed', audience: 'Affected user', inApp: true, email: true, required: true },
      { id: 'role-permissions-changed', label: 'Role or permissions changed', audience: 'Affected user', inApp: true, email: true, required: true },
    ],
  },
  {
    id: 'substitution',
    label: 'Substitution',
    required: true,
    options: [
      { id: 'substitution-started', label: 'Substitution assigned or started', audience: 'Substituting and substituted users', inApp: true, email: true },
      { id: 'substitution-ended', label: 'Substitution ended or was cancelled', audience: 'Substituting and substituted users', inApp: true, email: false },
    ],
  },
  {
    id: 'ocr-administration',
    label: 'OCR / Administration',
    required: true,
    options: [
      { id: 'ocr-sla-risk', label: 'OCR queue creates an SLA risk or processing stopped', audience: 'Team lead, support, or administrator', inApp: true, email: true, required: true },
    ],
  },
];

interface ProfileNotificationPreferences {
  categoryEnabled: Record<string, boolean>;
  inApp: Record<string, boolean>;
  email: Record<string, boolean>;
}

function createDefaultNotificationPreferences(): ProfileNotificationPreferences {
  return PROFILE_NOTIFICATION_CATEGORIES.reduce<ProfileNotificationPreferences>(
    (preferences, category) => {
      preferences.categoryEnabled[category.id] = true;
      category.options.forEach(option => {
        preferences.inApp[option.id] = option.inApp;
        preferences.email[option.id] = option.email;
      });
      return preferences;
    },
    { categoryEnabled: {}, inApp: {}, email: {} },
  );
}

export default function ProfileSettings({ user, onProfileSaved, onOpenCompanies }: ProfileSettingsProps) {
  const [activeTab, setActiveTab] = useState<ProfileSettingsTab>('profile');
  const normalizedUserEmail = user.email.trim().toLocaleLowerCase();
  const [storedProfile, setStoredProfile] = usePersistentState(userProfileStorageKey(user.email), {
    fullName: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  });

  // Profile form state
  const [fullName] = useState(storedProfile.fullName);
  const [email] = useState(storedProfile.email);
  const [phone, setPhone] = useState(storedProfile.phone);
  const [role] = useState(storedProfile.role);
  const [position, setPosition] = useState(() => {
    const directoryUser = [
      ...loadLinkedDirectoryUsers('Internal users'),
      ...loadLinkedDirectoryUsers('External users'),
    ].find(item => isDirectoryEmailMatch(item.email, normalizedUserEmail));
    return directoryUser?.position ?? '';
  });
  const [internalUser, setInternalUser] = usePersistentState('finansu-harmonija:v7:internal-user-card', {
    sodraUser: '',
    sodraPassword: '',
    edsUser: '',
    edsPassword: '',
    profileImage: '',
    organizationLogo: '',
  });
  const [integrationDraft, setIntegrationDraft] = useState(() => ({
    sodraUser: internalUser.sodraUser,
    sodraPassword: internalUser.sodraPassword,
    edsUser: internalUser.edsUser,
    edsPassword: internalUser.edsPassword,
  }));
  const [integrationSaved, setIntegrationSaved] = useState(false);
  const [notificationSaved, setNotificationSaved] = useState(false);
  const [profileAudience, setProfileAudience] = useState<SettingsAudience>(() =>
    loadLinkedDirectoryUsers('Internal users').some(
      directoryUser => isDirectoryEmailMatch(directoryUser.email, normalizedUserEmail),
    )
      ? 'Internal users'
      : 'External users',
  );
  const [assignedOrganizations, setAssignedOrganizations] = useState<string[]>([]);
  const [profileActivityLog, setProfileActivityLog] = useState<ProfileActivityRow[]>([]);
  const [profileActivityLoading, setProfileActivityLoading] = useState(false);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>(() =>
    loadLoginHistory(user.email),
  );
  const [showSodraPassword, setShowSodraPassword] = useState(false);
  const [showEdsPassword, setShowEdsPassword] = useState(false);

  // Original values for tracking changes
  const [originalProfile, setOriginalProfile] = useState({
    ...storedProfile,
  });

  const [touched, setTouched] = useState<TouchedFields>({
    fullName: false,
    email: false,
    phone: false,
  });

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState<PasswordTouched>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  // Security toggles
  const [emailNotifications, setEmailNotifications] = usePersistentState('finansu-harmonija:v7:profile-email-notifications', false);
  const [phoneNotifications, setPhoneNotifications] = usePersistentState('finansu-harmonija:v7:profile-phone-notifications', false);
  const [dualAuth, setDualAuth] = usePersistentState('finansu-harmonija:v7:profile-dual-auth', false);
  const [mfaPanelOpen, setMfaPanelOpen] = useState(false);
  const [activityLogExpanded, setActivityLogExpanded] = useState(false);
  const [loginHistoryExpanded, setLoginHistoryExpanded] = useState(false);
  const [documentActivityView, setDocumentActivityView] = useState<'created' | 'edited' | null>(null);
  const [savedReportNotifications, setSavedReportNotifications] = usePersistentState('finansu-harmonija:v7:profile-report-notifications', true);
  const [savedNotificationPreferences, setSavedNotificationPreferences] = usePersistentState<ProfileNotificationPreferences>(
    'finansu-harmonija:v12:profile-notification-preferences',
    createDefaultNotificationPreferences,
  );
  const [reportNotifications, setReportNotifications] = useState(savedReportNotifications);
  const [notificationPreferences, setNotificationPreferences] = useState(savedNotificationPreferences);

  // Unsubscribe modal state
  const [showUnsubscribeModal, setShowUnsubscribeModal] = useState(false);
  const [pendingToggleOff, setPendingToggleOff] = useState<(() => void) | null>(null);

  // Validation functions
  const validateEmail = (email: string): string => {
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!email.includes('@')) {
      return 'Email must contain @ symbol';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    return '';
  };

  const validatePhone = (phone: string): string => {
    if (!phone.trim()) {
      return '';
    }
    const phoneRegex = /^[\d\s\-+()]+$/;
    if (!phoneRegex.test(phone) || phone.replace(/\D/g, '').length < 8) {
      return 'Please enter a valid phone number';
    }
    return '';
  };

  const validateFullName = (name: string): string => {
    if (!name.trim()) {
      return 'Full name is required';
    }
    if (name.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    return '';
  };

  const validateCurrentPassword = (password: string): string => {
    if (!password) {
      return 'Current password is required';
    }
    return '';
  };

  const validateNewPassword = (password: string): string => {
    if (!password) {
      return 'New password is required';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return '';
  };

  const validateConfirmPassword = (confirm: string, newPass: string): string => {
    if (!confirm) {
      return 'Please confirm your password';
    }
    if (confirm !== newPass) {
      return 'Passwords do not match';
    }
    return '';
  };

  // Profile errors
  const profileErrors: ProfileErrors = useMemo(() => ({
    fullName: touched.fullName ? validateFullName(fullName) : '',
    email: touched.email ? validateEmail(email) : '',
    phone: touched.phone ? validatePhone(phone) : '',
  }), [fullName, email, phone, touched]);

  // Password errors
  const passwordErrors: PasswordErrors = useMemo(() => ({
    currentPassword: passwordTouched.currentPassword ? validateCurrentPassword(currentPassword) : '',
    newPassword: passwordTouched.newPassword ? validateNewPassword(newPassword) : '',
    confirmPassword: passwordTouched.confirmPassword ? validateConfirmPassword(confirmPassword, newPassword) : '',
  }), [currentPassword, newPassword, confirmPassword, passwordTouched]);

  // Check if profile has changes
  const hasProfileChanges = useMemo(() => {
    return (
      fullName !== originalProfile.fullName ||
      email !== originalProfile.email ||
      phone !== originalProfile.phone ||
      role !== originalProfile.role
    );
  }, [fullName, email, phone, role, originalProfile]);

  // Check if profile is valid
  const isProfileValid = useMemo(() => {
    return (
      validateFullName(fullName) === '' &&
      validateEmail(email) === '' &&
      validatePhone(phone) === ''
    );
  }, [fullName, email, phone]);

  // Check if password form is valid and has changes
  const isPasswordValid = useMemo(() => {
    return (
      validateCurrentPassword(currentPassword) === '' &&
      validateNewPassword(newPassword) === '' &&
      validateConfirmPassword(confirmPassword, newPassword) === '' &&
      newPassword.length > 0
    );
  }, [currentPassword, newPassword, confirmPassword]);

  // Handle blur for profile fields
  const handleProfileBlur = (field: keyof TouchedFields) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Handle blur for password fields
  const handlePasswordBlur = (field: keyof PasswordTouched) => {
    setPasswordTouched(prev => ({ ...prev, [field]: true }));
  };

  // Save profile
  const handleSaveProfile = async () => {
    setTouched({ fullName: true, email: true, phone: true });

    if (!isProfileValid) {
      return;
    }

    setIsSavingProfile(true);
    setProfileSaved(false);

    // Simulating API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update original values
    setOriginalProfile({
      fullName,
      email,
      phone,
      role,
    });
    setStoredProfile({ fullName, email, phone, role });
    onProfileSaved?.({ fullName, email, phone, role });

    setIsSavingProfile(false);
    setProfileSaved(true);
    setTouched({ fullName: false, email: false, phone: false });

    // Hide success message after 3 seconds
    setTimeout(() => setProfileSaved(false), 3000);
  };

  // Save password
  const handleSavePassword = async () => {
    setPasswordTouched({
      currentPassword: true,
      newPassword: true,
      confirmPassword: true,
    });

    if (!isPasswordValid) {
      return;
    }

    setIsSavingPassword(true);
    setPasswordSaved(false);

    // Simulating API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Clear password fields after save
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordTouched({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });

    setIsSavingPassword(false);
    setPasswordSaved(true);

    // Hide success message after 3 seconds
    setTimeout(() => setPasswordSaved(false), 3000);
  };

  const handleSaveIntegrations = () => {
    setInternalUser(current => ({ ...current, ...integrationDraft }));
    setIntegrationSaved(true);
    setTimeout(() => setIntegrationSaved(false), 3000);
  };

  const hasIntegrationChanges =
    integrationDraft.sodraUser !== internalUser.sodraUser ||
    integrationDraft.sodraPassword !== internalUser.sodraPassword ||
    integrationDraft.edsUser !== internalUser.edsUser ||
    integrationDraft.edsPassword !== internalUser.edsPassword;

  const hasNotificationChanges =
    reportNotifications !== savedReportNotifications ||
    JSON.stringify(notificationPreferences) !== JSON.stringify(savedNotificationPreferences);

  const handleSaveNotifications = () => {
    setSavedReportNotifications(reportNotifications);
    setSavedNotificationPreferences(notificationPreferences);
    setNotificationSaved(true);
    setTimeout(() => setNotificationSaved(false), 3000);
  };

  // Handle notification toggle - show confirmation when trying to disable
  const handleReportNotificationsToggle = () => {
    if (reportNotifications) {
      // Trying to turn OFF - show confirmation modal
      setPendingToggleOff(() => () => setReportNotifications(false));
      setShowUnsubscribeModal(true);
    } else {
      // Turning ON - no confirmation needed
      setReportNotifications(true);
    }
  };

  const toggleNotificationCategory = (categoryId: string) => {
    setNotificationPreferences(current => ({
      ...current,
      categoryEnabled: {
        ...current.categoryEnabled,
        [categoryId]: !(current.categoryEnabled[categoryId] ?? true),
      },
    }));
  };

  const toggleNotificationChannel = (
    channel: 'inApp' | 'email',
    optionId: string,
  ) => {
    const category = PROFILE_NOTIFICATION_CATEGORIES.find(item =>
      item.options.some(option => option.id === optionId),
    );
    const option = category?.options.find(item => item.id === optionId);
    const otherChannel = channel === 'inApp' ? 'email' : 'inApp';

    setNotificationPreferences(current => {
      const checked = current[channel][optionId] ?? option?.[channel] ?? false;
      const otherChecked =
        current[otherChannel][optionId] ?? option?.[otherChannel] ?? false;

      if (category?.id === 'substitution' && checked && !otherChecked) {
        return current;
      }

      return {
        ...current,
        [channel]: {
          ...current[channel],
          [optionId]: !checked,
        },
      };
    });
  };

  const handleUnsubscribeConfirm = () => {
    if (pendingToggleOff) {
      pendingToggleOff();
    }
    setShowUnsubscribeModal(false);
    setPendingToggleOff(null);
  };

  const handleUnsubscribeCancel = () => {
    setShowUnsubscribeModal(false);
    setPendingToggleOff(null);
  };

  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '—';
  const lastName = nameParts.slice(1).join(' ') || '—';
  const isInternalUser = profileAudience === 'Internal users';
  const assignedRoles = role
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const mfaRequiredByPolicy = role
    .split(',')
    .map(item => item.trim().toLocaleLowerCase())
    .some(item => item === 'administrator' || item === 'administration');
  const mfaStatus = dualAuth
    ? 'Enabled'
    : mfaRequiredByPolicy
      ? 'Required by policy'
      : 'Disabled';
  const lastSuccessfulLogin = loginHistory.find(entry => entry.status === 'Successful');

  const syncProfileRelationships = useCallback(async () => {
    const internalUsers = loadLinkedDirectoryUsers('Internal users');
    const externalUsers = loadLinkedDirectoryUsers('External users');
    const audience: SettingsAudience = internalUsers.some(
      directoryUser => isDirectoryEmailMatch(directoryUser.email, normalizedUserEmail),
    )
      ? 'Internal users'
      : 'External users';
    const currentDirectoryUser = (audience === 'Internal users' ? internalUsers : externalUsers).find(
      directoryUser => isDirectoryEmailMatch(directoryUser.email, normalizedUserEmail),
    );
    setPosition(currentDirectoryUser?.position ?? '');
    const { data } = await supabase.from('companies').select('*');
    const organizations = ((data ?? []) as LinkedOrganization[]).filter(
      isActiveLinkedOrganization,
    );
    const { users, assignments } = reconcileOrganizationUserLinks(
      organizations,
      audience,
      false,
    );
    const directoryUser = users.find(
      item => isDirectoryEmailMatch(item.email, normalizedUserEmail),
    );
    const names = directoryUser
      ? organizations
          .filter(organization => assignments.get(organization.id)?.has(directoryUser.id))
          .map(organization => organization.name)
      : [];
    setProfileAudience(audience);
    setAssignedOrganizations(names);
  }, [normalizedUserEmail]);

  useEffect(() => {
    void syncProfileRelationships();
    const handleSettingsChange = () => void syncProfileRelationships();
    window.addEventListener(SETTINGS_DATA_CHANGED_EVENT, handleSettingsChange);
    window.addEventListener('storage', handleSettingsChange);
    return () => {
      window.removeEventListener(SETTINGS_DATA_CHANGED_EVENT, handleSettingsChange);
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, [syncProfileRelationships]);

  const loadProfileActivity = useCallback(async () => {
    if (activeTab !== 'accessActivity') return;

    setProfileActivityLoading(true);
    const [companyResult, documentResult, historyResult] = await Promise.all([
      supabase.from('companies').select('*'),
      supabase.from('documents').select('*'),
      supabase.from('document_history').select('*').order('created_at', { ascending: false }),
    ]);

    const assignedNames = new Set(
      assignedOrganizations.map(name => name.trim().toLocaleLowerCase()),
    );
    const companies = ((companyResult.data ?? []) as unknown as Company[]).filter(
      company => assignedNames.has(company.name.trim().toLocaleLowerCase()),
    );
    const companyById = new Map(companies.map(company => [company.id, company]));
    const documents = ((documentResult.data ?? []) as unknown as DbDocument[]).filter(
      document => Boolean(document.company_id && companyById.has(document.company_id)),
    );
    const documentById = new Map(documents.map(document => [document.id, document]));
    const profileIdentities = new Set(
      [fullName, user.name, email, user.email]
        .map(normalizeActivityIdentity)
        .filter(Boolean),
    );
    const belongsToCurrentProfile = (value?: string) => {
      const identity = normalizeActivityIdentity(value);
      return identity === 'current user' || profileIdentities.has(identity);
    };

    const historyRows = ((historyResult.data ?? []) as unknown as RawDocumentHistory[])
      .filter(history => belongsToCurrentProfile(history.user_name))
      .flatMap<ProfileActivityRow>(history => {
        const document = documentById.get(history.document_id);
        if (!document?.company_id) return [];
        const company = companyById.get(document.company_id);
        if (!company) return [];
        return [{
          id: history.id,
          date: history.created_at,
          organization: company.name,
          action: history.action || 'Updated',
          object: document.number?.trim() || document.file_case?.trim() || document.id,
        }];
      });

    const creationRows = documents
      .filter(document => belongsToCurrentProfile(document.created_by))
      .map<ProfileActivityRow>(document => ({
        id: `created-${document.id}`,
        date: document.created_at,
        organization: companyById.get(document.company_id ?? '')?.name ?? '—',
        action: document.document_type === 'Accounting note'
          ? 'Created accounting note'
          : 'Created document',
        object: document.number?.trim() || document.file_case?.trim() || document.id,
      }));

    setProfileActivityLog(
      [...historyRows, ...creationRows].sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
      ),
    );
    setProfileActivityLoading(false);
  }, [activeTab, assignedOrganizations, email, fullName, user.email, user.name]);

  useEffect(() => {
    void loadProfileActivity();
  }, [loadProfileActivity]);

  useEffect(() => {
    const syncLoginHistory = () => setLoginHistory(loadLoginHistory(user.email));
    syncLoginHistory();
    window.addEventListener(LOGIN_HISTORY_CHANGED_EVENT, syncLoginHistory);
    window.addEventListener('storage', syncLoginHistory);
    return () => {
      window.removeEventListener(LOGIN_HISTORY_CHANGED_EVENT, syncLoginHistory);
      window.removeEventListener('storage', syncLoginHistory);
    };
  }, [user.email]);

  const handleImageUpload = (field: 'profileImage' | 'organizationLogo', file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInternalUser(current => ({ ...current, [field]: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const readOnlyInputClass = 'w-full h-[42px] px-3.5 border border-[#D3E1EC] rounded-lg bg-[#F5F8FB] text-sm font-medium text-[#536B86] cursor-not-allowed';
  const inputClass = 'w-full h-[42px] px-3.5 border border-[#D3E1EC] rounded-lg text-sm font-medium text-[#10233A] focus:outline-none focus:border-main-blue transition-colors';

  return (
    <div className="w-full min-w-0 flex-1 bg-[#FCFCFD] p-5 sm:p-8 xl:p-10 2xl:p-14 flex flex-col gap-6 xl:gap-8 min-h-full">
      {/* Header */}
      <div className="flex items-end gap-4">
        <h1 className="text-[30px] sm:text-[36px] font-semibold text-[#10233A] leading-tight sm:leading-[46px]">
          Profile settings
        </h1>
      </div>
      <SystemBreadcrumb items={["Profile settings"]} />

      <div
        role="tablist"
        aria-label="Profile settings sections"
        className="flex min-h-[42px] w-full flex-wrap items-end gap-1 border-b border-[#D3E1EC]"
      >
        {PROFILE_SETTINGS_TABS.map(tab => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={`relative min-h-[42px] px-4 py-2 font-montserrat text-[14px] font-semibold leading-5 transition-colors ${
                selected
                  ? 'text-main-blue'
                  : 'text-[#7288A3] hover:text-[#10233A]'
              }`}
            >
              {tab.label}
              {selected && (
                <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-main-blue" />
              )}
            </button>
          );
        })}
      </div>

      {/* Success messages */}
      {profileSaved && (
        <div className="w-fit px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check size={16} className="text-green-600" />
          <span className="text-sm text-green-700">Profile updated successfully</span>
        </div>
      )}
      {passwordSaved && (
        <div className="w-fit px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check size={16} className="text-green-600" />
          <span className="text-sm text-green-700">Password changed successfully</span>
        </div>
      )}
      {integrationSaved && (
        <div className="w-fit px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check size={16} className="text-green-600" />
          <span className="text-sm text-green-700">Integration settings saved successfully</span>
        </div>
      )}
      {notificationSaved && (
        <div className="w-fit px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check size={16} className="text-green-600" />
          <span className="text-sm text-green-700">Notification settings saved successfully</span>
        </div>
      )}

      {/* Settings cards */}
      <div
        className={`${activeTab === 'accessActivity' ? 'hidden' : 'grid'} grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-6 xl:gap-8 items-start`}
      >
        <div className={`${activeTab === 'profile' ? 'grid' : 'hidden'} col-span-full grid-cols-1 gap-4 sm:grid-cols-2`}>
          <div className="flex min-h-[96px] items-center gap-4 rounded-lg border border-[#DCE7EF] bg-white p-5">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#EAF4F8] text-main-blue">
              <ShieldCheck size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                Assigned role
              </p>
              <p className="mt-1 truncate font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">
                {role || 'Not assigned'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCompanies}
            className="group flex min-h-[96px] items-center gap-4 rounded-lg border border-[#DCE7EF] bg-white p-5 text-left transition-colors hover:border-[#9FC2D2] hover:bg-[#F8FBFD] focus:outline-none focus-visible:ring-2 focus-visible:ring-main-blue focus-visible:ring-offset-2"
            aria-label="Open assigned companies"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#EAF4F8] text-main-blue">
              <Building2 size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                Assigned company/-ies
              </p>
              <p className="mt-1 font-montserrat text-[24px] font-semibold leading-7 text-[#10233A]">
                {assignedOrganizations.length}
              </p>
            </div>
          </button>
        </div>

        {/* Internal user / Meso accountant card */}
        <div className={`${activeTab === 'profile' ? '' : 'hidden'} min-w-0 bg-white border border-[#D3E1EC] rounded-lg p-5 sm:p-6`}>
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[22px] font-semibold text-[#10233A]">{isInternalUser ? 'Profile information' : 'Company Users card'}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#6F86A1]">{profileAudience}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">First name</label>
                <input type="text" value={firstName} readOnly className={readOnlyInputClass} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">Last name</label>
                <input type="text" value={lastName} readOnly className={readOnlyInputClass} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">Email</label>
                <div className="group relative min-w-0">
                  <input
                    type="email"
                    value={email}
                    readOnly
                    aria-describedby="profile-email-full-value"
                    className={`${readOnlyInputClass} peer truncate`}
                  />
                  <span
                    id="profile-email-full-value"
                    role="tooltip"
                    className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 max-w-[min(360px,calc(100vw-48px))] break-all rounded-lg border border-[#D3E1EC] bg-white px-3 py-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] opacity-0 shadow-[0_8px_24px_rgba(16,35,58,0.14)] transition-opacity duration-75 group-hover:visible group-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
                  >
                    {email}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">Phone</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => handleProfileBlur('phone')}
                    className={`w-full h-[42px] px-3.5 py-[11px] pr-10 border rounded-lg text-sm font-medium text-[#10233A] placeholder:text-[#A1B6C6] focus:outline-none transition-colors ${
                      profileErrors.phone
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-[#D3E1EC] focus:border-main-blue'
                    }`}
                  />
                  {profileErrors.phone && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AlertCircle size={18} className="text-red-500" />
                    </div>
                  )}
                </div>
                {profileErrors.phone && (
                  <p className="text-xs text-red-500">{profileErrors.phone}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">Position</label>
                <input type="text" value={position} readOnly className={readOnlyInputClass} />
              </div>

            </div>

            <SaveButton
              onClick={handleSaveProfile}
              disabled={!hasProfileChanges || !isProfileValid || isSavingProfile}
              className="w-full"
            >
              {isSavingProfile ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save'
              )}
            </SaveButton>
          </div>
        </div>

        {/* Government integrations */}
        <div className={`${activeTab === 'integrations' ? '' : 'hidden'} min-w-0 bg-white border border-[#D3E1EC] rounded-lg p-5 sm:p-6`}>
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[22px] font-semibold text-[#10233A]">Government integrations</h2>
              <p className="mt-1 text-sm text-[#7288A3]">Optional credentials for SODRA and VMI (EDS) API connections.</p>
            </div>

            <div className="grid grid-cols-1 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">SODRA username</label>
                <input
                  value={integrationDraft.sodraUser}
                  onChange={event => setIntegrationDraft(current => ({ ...current, sodraUser: event.target.value }))}
                  placeholder="Enter SODRA username"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">SODRA password</label>
                <div className="relative">
                  <input
                    type={showSodraPassword ? 'text' : 'password'}
                    value={integrationDraft.sodraPassword}
                    onChange={event => setIntegrationDraft(current => ({ ...current, sodraPassword: event.target.value }))}
                    placeholder="Enter SODRA password"
                    className={`${inputClass} pr-11`}
                  />
                  <button type="button" aria-label="Show SODRA password" onClick={() => setShowSodraPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7288A3]">
                    {showSodraPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">VMI (EDS) username</label>
                <input
                  value={integrationDraft.edsUser}
                  onChange={event => setIntegrationDraft(current => ({ ...current, edsUser: event.target.value }))}
                  placeholder="Enter VMI (EDS) username"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">VMI (EDS) password</label>
                <div className="relative">
                  <input
                    type={showEdsPassword ? 'text' : 'password'}
                    value={integrationDraft.edsPassword}
                    onChange={event => setIntegrationDraft(current => ({ ...current, edsPassword: event.target.value }))}
                    placeholder="Enter VMI (EDS) password"
                    className={`${inputClass} pr-11`}
                  />
                  <button type="button" aria-label="Show VMI password" onClick={() => setShowEdsPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7288A3]">
                    {showEdsPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <SaveButton
              onClick={handleSaveIntegrations}
              disabled={!hasIntegrationChanges}
              className="w-full"
            >
              Save
            </SaveButton>
          </div>
        </div>

        {/* Profile and organization branding */}
        <div className={`${activeTab === 'profile' ? '' : 'hidden'} min-w-0 bg-white border border-[#D3E1EC] rounded-lg p-5 sm:p-6`}>
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-[22px] font-semibold text-[#10233A]">Profile photo</h2>
              <p className="mt-1 text-sm text-[#7288A3]">Images are stored with the profile and used in the system.</p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 rounded-lg border border-[#E3ECF3] bg-[#F8FAFC] p-4">
                <div className="w-16 h-16 rounded-full bg-[#E8F2F7] overflow-hidden flex items-center justify-center text-lg font-semibold text-main-blue shrink-0">
                  {internalUser.profileImage ? <img src={internalUser.profileImage} alt="Profile" className="w-full h-full object-cover" /> : `${firstName[0] || ''}${lastName[0] || ''}`}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#10233A]">Profile photo</p>
                  <p className="text-xs text-[#879BB1] mt-0.5">PNG or JPG image.</p>
                  <label className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-main-blue cursor-pointer hover:text-[#006F91]">
                    <Upload size={16} /> Upload photo
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={event => handleImageUpload('profileImage', event.target.files?.[0])} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Password Card */}
        <div className={`${activeTab === 'security' ? '' : 'hidden'} min-w-0 bg-white border border-[#D3E1EC] rounded-lg p-5 sm:p-6`}>
          <div className="flex flex-col gap-6">
            <h2 className="text-[22px] font-semibold text-[#10233A]">
              Password
            </h2>

            <div className="flex flex-col gap-6">
              {/* Current Password */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">
                  Current password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    onBlur={() => handlePasswordBlur('currentPassword')}
                    placeholder="Enter current password"
                    className={`w-full h-[42px] px-3.5 py-[11px] pr-16 border rounded-lg text-sm font-medium text-[#10233A] placeholder:text-[#A1B6C6] focus:outline-none transition-colors ${
                      passwordErrors.currentPassword
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-[#D3E1EC] focus:border-main-blue'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {passwordErrors.currentPassword && (
                      <AlertCircle size={16} className="text-red-500" />
                    )}
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="text-[#7288A3] hover:text-[#10233A] transition-colors"
                    >
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {passwordErrors.currentPassword && (
                  <p className="text-xs text-red-500">{passwordErrors.currentPassword}</p>
                )}
              </div>

              {/* New Password */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">
                  New password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onBlur={() => handlePasswordBlur('newPassword')}
                    placeholder="Enter new password"
                    className={`w-full h-[42px] px-3.5 py-[11px] pr-16 border rounded-lg text-sm font-medium text-[#10233A] placeholder:text-[#A1B6C6] focus:outline-none transition-colors ${
                      passwordErrors.newPassword
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-[#D3E1EC] focus:border-main-blue'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {passwordErrors.newPassword && (
                      <AlertCircle size={16} className="text-red-500" />
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="text-[#7288A3] hover:text-[#10233A] transition-colors"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {passwordErrors.newPassword && (
                  <p className="text-xs text-red-500">{passwordErrors.newPassword}</p>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[#10233A]">
                  Confirm new password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => handlePasswordBlur('confirmPassword')}
                    placeholder="Confirm new password"
                    className={`w-full h-[42px] px-3.5 py-[11px] pr-16 border rounded-lg text-sm font-medium text-[#10233A] placeholder:text-[#A1B6C6] focus:outline-none transition-colors ${
                      passwordErrors.confirmPassword
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-[#D3E1EC] focus:border-main-blue'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {passwordErrors.confirmPassword && (
                      <AlertCircle size={16} className="text-red-500" />
                    )}
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="text-[#7288A3] hover:text-[#10233A] transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {passwordErrors.confirmPassword && (
                  <p className="text-xs text-red-500">{passwordErrors.confirmPassword}</p>
                )}
              </div>
            </div>

            <SaveButton
              onClick={handleSavePassword}
              disabled={!isPasswordValid || isSavingPassword}
              className="w-full"
            >
              {isSavingPassword ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save'
              )}
            </SaveButton>
          </div>
        </div>

        {/* Security Card */}
        <div className={`${activeTab === 'security' ? '' : 'hidden'} min-w-0 bg-white border border-[#D3E1EC] rounded-lg p-5 sm:p-6`}>
          <div className="flex flex-col gap-6">
            <h2 className="text-[22px] font-semibold text-[#10233A]">
              Verification methods
            </h2>

            {/* Authorization methods */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-[#10233A]">
                Authorization methods
              </h3>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-[#7288A3]">Email</span>
                  <SecurityToggle
                    checked={emailNotifications}
                    onChange={() => setEmailNotifications(!emailNotifications)}
                    label="Authorization notifications by email"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-[#7288A3]">Phone</span>
                  <SecurityToggle
                    checked={phoneNotifications}
                    onChange={() => setPhoneNotifications(!phoneNotifications)}
                    label="Authorization notifications by phone"
                  />
                </div>
              </div>
            </div>

            {/* Multi-factor authentication */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-[#10233A]">
                Multi-factor authentication (MFA)
              </h3>

              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-medium text-[#7288A3]">{mfaStatus}</span>
                  {mfaRequiredByPolicy && (
                    <span className="rounded-full bg-[#FFF3E8] px-2.5 py-1 font-montserrat text-[10px] font-semibold text-[#B45309]">
                      Policy
                    </span>
                  )}
                </div>
                <SecurityToggle
                  checked={dualAuth}
                  label="Enable or disable multi-factor authentication"
                  disabled={dualAuth && mfaRequiredByPolicy}
                  onChange={() => {
                    if (dualAuth) {
                      if (mfaRequiredByPolicy) return;
                      setDualAuth(false);
                      setMfaPanelOpen(false);
                      return;
                    }
                    setDualAuth(true);
                    setMfaPanelOpen(true);
                  }}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!dualAuth) setDualAuth(true);
                    setMfaPanelOpen(true);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[14px] font-semibold text-[#007EA7] transition-colors hover:border-[#9FC2D2] hover:bg-[#F2F8FB] focus:outline-none focus-visible:ring-2 focus-visible:ring-main-blue focus-visible:ring-offset-2"
                >
                  {dualAuth ? 'Manage MFA' : 'Set up'}
                </button>
              </div>

              {mfaPanelOpen && dualAuth && (
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E3ECF3] pt-4">
                  <div>
                    <p className="font-montserrat text-[12px] font-semibold text-[#10233A]">Authenticator app</p>
                    <p className="mt-1 font-montserrat text-[11px] text-[#7288A3]">Recovery codes are available.</p>
                  </div>
                  {mfaRequiredByPolicy ? (
                    <p className="font-montserrat text-[11px] font-medium text-[#B45309]">MFA cannot be disabled because it is required by policy.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setDualAuth(false);
                        setMfaPanelOpen(false);
                      }}
                      className="h-9 rounded-lg border border-[#E7B7B7] bg-white px-3 font-montserrat text-[12px] font-semibold text-[#B83A3A] hover:bg-[#FFF7F7]"
                    >
                      Disable MFA
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notifications Card */}
        <div className={`${activeTab === 'notifications' ? '' : 'hidden'} col-span-full min-w-0 bg-white border border-[#D3E1EC] rounded-lg p-5 sm:p-6`}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-semibold text-[#10233A]">
                  Notifications
                </h2>
                <p className="mt-1 text-sm text-[#7288A3]">
                  Choose which events should notify you in the application or by email.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#10233A]">
                  Enable notifications
                </span>
                <SecurityToggle
                  checked={reportNotifications}
                  onChange={handleReportNotificationsToggle}
                  label="Enable notifications"
                />
              </div>
            </div>

            {reportNotifications && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-4 px-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F86A1]">
                    Notification categories
                  </p>
                  <p className="text-right text-xs font-semibold uppercase tracking-[0.08em] text-[#6F86A1]">
                    Status
                  </p>
                </div>

                {PROFILE_NOTIFICATION_CATEGORIES.map(category => {
                  const categoryEnabled =
                    category.required ||
                    (notificationPreferences.categoryEnabled[category.id] ?? true);

                  return (
                    <div
                      key={category.id}
                      className="overflow-hidden rounded-lg border border-[#DCE7EF] bg-white"
                    >
                      <div className="flex min-h-[50px] items-center justify-between gap-4 bg-[#F7FAFC] px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ChevronDown
                            size={17}
                            className={`flex-shrink-0 text-[#7288A3] transition-transform ${
                              categoryEnabled ? '' : '-rotate-90'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
                              {category.label}
                            </p>
                            <p className="mt-0.5 font-montserrat text-[11px] leading-4 text-[#7288A3]">
                              {category.options.length} notification{category.options.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>

                        {category.required ? (
                          <span className="rounded-md border border-[#CBE4D8] bg-[#EEF8F3] px-2.5 py-1 font-montserrat text-[11px] font-semibold text-[#2D7C58]">
                            Required
                          </span>
                        ) : (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={categoryEnabled}
                            aria-label={`${category.label} notifications`}
                            onClick={() => toggleNotificationCategory(category.id)}
                            className={`relative h-[22px] w-[38px] flex-shrink-0 rounded-full transition-colors ${
                              categoryEnabled ? 'bg-main-blue' : 'bg-[#A1B6C6]'
                            }`}
                          >
                            <span
                              className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${
                                categoryEnabled ? 'right-[3px]' : 'left-[3px]'
                              }`}
                            />
                          </button>
                        )}
                      </div>

                      {categoryEnabled && (
                        <div className="overflow-x-auto">
                          <div className="min-w-[760px]">
                            <div className="grid grid-cols-[minmax(280px,1.5fr)_minmax(220px,1fr)_120px_80px] items-center gap-4 border-t border-[#E3ECF3] bg-white px-4 py-2.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">Notification / event</span>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">Relevant to</span>
                              <span className="flex min-h-[28px] items-center justify-center whitespace-nowrap rounded-md bg-[#F2F7FA] px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#536B86]">In application</span>
                              <span className="flex min-h-[28px] items-center justify-center rounded-md bg-[#F2F7FA] px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#536B86]">Email</span>
                            </div>
                            {category.options.map((option, optionIndex) => {
                              const inAppChecked =
                                notificationPreferences.inApp[option.id] ?? option.inApp;
                              const emailChecked =
                                notificationPreferences.email[option.id] ?? option.email;

                              const renderChannelCheckbox = (
                                channel: 'inApp' | 'email',
                                checked: boolean,
                                label: string,
                              ) => (
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={checked}
                                  aria-label={label}
                                  disabled={option.required}
                                  onClick={() => toggleNotificationChannel(channel, option.id)}
                                  className={`mx-auto flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                                    checked
                                      ? 'border-main-blue bg-main-blue text-white'
                                      : 'border-[#AFC3D3] bg-white text-transparent'
                                  } ${option.required ? 'cursor-not-allowed opacity-70' : 'hover:border-main-blue'}`}
                                >
                                  <Check size={13} strokeWidth={2.5} />
                                </button>
                              );

                              return (
                                <div
                                  key={option.id}
                                  className={`grid grid-cols-[minmax(280px,1.5fr)_minmax(220px,1fr)_120px_80px] items-center gap-4 border-t border-[#ECF1F5] px-4 py-3 ${
                                    optionIndex % 2 === 0 ? 'bg-[#FBFDFE]' : 'bg-white'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">
                                      {option.label}
                                    </p>
                                    {option.required && (
                                      <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-[#2D7C58]">
                                        Required notification
                                      </span>
                                    )}
                                  </div>
                                  <p className="font-montserrat text-[11px] leading-4 text-[#7288A3]">
                                    {option.audience}
                                  </p>
                                  {renderChannelCheckbox('inApp', inAppChecked, `${option.label}: in application`)}
                                  {renderChannelCheckbox('email', emailChecked, `${option.label}: email`)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <SaveButton
              onClick={handleSaveNotifications}
              disabled={!hasNotificationChanges}
              className="w-full"
            >
              Save
            </SaveButton>
          </div>
        </div>
      </div>

      {/* Analytics and control */}
      <section className={`${activeTab === 'accessActivity' ? '' : 'hidden'} bg-white border border-[#D3E1EC] rounded-lg p-6`}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] font-semibold text-[#10233A]">User activity overview</h2>
            <p className="mt-1 text-sm text-[#7288A3]">Analytics & control</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-[#F2F8FB] border border-[#D8E8F1] text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#7288A3]">Last login</p>
            <p className="mt-0.5 text-sm font-semibold text-[#10233A]">
              {lastSuccessfulLogin ? formatActivityDate(lastSuccessfulLogin.date) : 'No login recorded'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[
            { id: 'created' as const, label: 'Created documents', value: String(PROFILE_DOCUMENT_ACTIVITY.created.length), icon: FileText },
            { id: 'edited' as const, label: 'Edited documents', value: String(PROFILE_DOCUMENT_ACTIVITY.edited.length), icon: PencilLine },
          ].map(({ id, label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-[#DCE7EF] bg-[#FAFCFD] p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-[#EAF4F8] flex items-center justify-center text-main-blue"><Icon size={19} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-semibold text-[#10233A] leading-none">{value}</p>
                <p className="mt-1.5 text-xs text-[#7288A3]">{label}</p>
              </div>
              {id && (
                <button
                  type="button"
                  onClick={() => setDocumentActivityView(id)}
                  className="flex-shrink-0 font-montserrat text-[12px] font-semibold text-main-blue hover:text-[#006F91]"
                >
                  View all
                </button>
              )}
            </div>
          ))}
        </div>

        {documentActivityView && (
          <div className="mb-6 overflow-hidden rounded-lg border border-[#DCE7EF]">
            <div className="flex items-center justify-between gap-4 border-b border-[#E3ECF3] bg-[#F7FAFC] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#10233A]">
                {documentActivityView === 'created' ? 'Created documents' : 'Edited documents'}
              </h3>
              <button
                type="button"
                onClick={() => setDocumentActivityView(null)}
                className="font-montserrat text-[12px] font-semibold text-main-blue hover:text-[#006F91]"
              >
                Close
              </button>
            </div>
            <div className="divide-y divide-[#ECF1F5]">
              {PROFILE_DOCUMENT_ACTIVITY[documentActivityView].map(([date, number, type]) => (
                <div key={`${date}-${number}`} className="grid grid-cols-[128px_minmax(0,1fr)_minmax(120px,auto)] items-center gap-3 px-4 py-3 text-xs">
                  <span className="whitespace-nowrap text-[#7288A3]">{date}</span>
                  <span className="font-medium text-[#10233A]">{number}</span>
                  <span className="text-right text-[#536B86]">{type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="rounded-lg border border-[#DCE7EF] overflow-hidden">
            <div className="px-4 py-3 bg-[#F7FAFC] border-b border-[#E3ECF3] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity size={17} className="text-main-blue" />
                <h3 className="text-sm font-semibold text-[#10233A]">Activity log</h3>
              </div>
              {profileActivityLog.length > 3 && (
                <button
                  type="button"
                  onClick={() => setActivityLogExpanded(value => !value)}
                  className="font-montserrat text-[12px] font-semibold text-main-blue hover:text-[#006F91]"
                >
                  {activityLogExpanded ? 'Show less' : 'View all'}
                </button>
              )}
            </div>
            <div className={`divide-y divide-[#ECF1F5] ${activityLogExpanded && profileActivityLog.length > 8 ? 'profile-activity-scrollbar max-h-[420px] overflow-y-auto overscroll-contain' : ''}`}>
              {!profileActivityLoading && profileActivityLog.length > 0 && (
                <div className="sticky top-0 z-10 grid grid-cols-[128px_minmax(96px,0.8fr)_minmax(120px,1fr)] gap-3 bg-[#FBFCFD] px-4 py-2 font-montserrat text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7288A3]">
                  <span>Date / time</span>
                  <span>Organization</span>
                  <span>Activity</span>
                </div>
              )}
              {profileActivityLoading && (
                <p className="px-4 py-8 text-center text-xs text-[#7288A3]">Loading activity…</p>
              )}
              {!profileActivityLoading && profileActivityLog.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-[#7288A3]">No activity recorded for assigned companies.</p>
              )}
              {!profileActivityLoading && (activityLogExpanded ? profileActivityLog : profileActivityLog.slice(0, 3)).map(({ id, date, organization, action, object }) => (
                <div key={id} className="grid grid-cols-[128px_minmax(96px,0.8fr)_minmax(120px,1fr)] gap-3 px-4 py-3 text-xs items-center">
                  <span className="text-[#7288A3] whitespace-nowrap">{formatActivityDate(date)}</span>
                  <span className="font-medium text-[#10233A] truncate" title={organization}>{organization}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[#10233A]" title={action}>{action}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#7288A3]" title={object}>{object}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#DCE7EF] overflow-hidden">
            <div className="px-4 py-3 bg-[#F7FAFC] border-b border-[#E3ECF3] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LogIn size={17} className="text-main-blue" />
                <h3 className="text-sm font-semibold text-[#10233A]">Login history</h3>
              </div>
              {loginHistory.length > 2 && (
                <button
                  type="button"
                  onClick={() => setLoginHistoryExpanded(value => !value)}
                  className="font-montserrat text-[12px] font-semibold text-main-blue hover:text-[#006F91]"
                >
                  {loginHistoryExpanded ? 'Show less' : 'View all'}
                </button>
              )}
            </div>
            <div className={`divide-y divide-[#ECF1F5] ${loginHistoryExpanded && loginHistory.length > 8 ? 'profile-activity-scrollbar max-h-[420px] overflow-y-auto overscroll-contain' : ''}`}>
              {loginHistory.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-[#7288A3]">No login history recorded yet.</p>
              )}
              {(loginHistoryExpanded ? loginHistory : loginHistory.slice(0, 2)).map(entry => (
                <div key={entry.id} className="grid grid-cols-[128px_1fr_auto] gap-3 px-4 py-3 text-xs items-center">
                  <span className="text-[#7288A3] whitespace-nowrap">{formatActivityDate(entry.date)}</span>
                  <span className="font-medium text-[#10233A]">{entry.device}</span>
                  <span className={`inline-flex items-center gap-1.5 ${entry.status === 'Successful' ? 'text-[#2D7C58]' : 'text-[#D84B4B]'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${entry.status === 'Successful' ? 'bg-[#34B27B]' : 'bg-[#E55353]'}`} />
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#DCE7EF] p-4 xl:col-span-2">
            <div className="flex items-center gap-2 mb-4"><ShieldCheck size={17} className="text-main-blue" /><h3 className="text-sm font-semibold text-[#10233A]">Permissions & roles</h3></div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="min-w-0 md:border-r md:border-[#E3ECF3] md:pr-5">
                <h4 className="font-montserrat text-[12px] font-semibold uppercase tracking-[0.06em] text-[#7288A3]">Roles</h4>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(assignedRoles.length > 0 ? assignedRoles : ['Not assigned']).map(item => (
                    <span key={item} className="rounded-md border border-[#DCE7EF] bg-[#F2F7FA] px-2.5 py-1.5 text-xs font-medium text-[#536B86]">{item}</span>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <h4 className="font-montserrat text-[12px] font-semibold uppercase tracking-[0.06em] text-[#7288A3]">Permissions</h4>
                <div className="mt-3 flex flex-col gap-3">
                  {[
                    { area: 'Documents', permissions: ['Create', 'View', 'Edit'] },
                    { area: 'Companies', permissions: ['View', 'Edit'] },
                  ].map(({ area, permissions }) => (
                    <div key={area} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[82px] font-montserrat text-[12px] font-semibold text-[#10233A]">{area}</span>
                      {permissions.map(permission => (
                        <span key={permission} className="rounded-md border border-[#DCE7EF] bg-[#F8FAFC] px-2.5 py-1.5 font-montserrat text-[11px] font-medium text-[#536B86]">
                          {permission}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Unsubscribe Confirmation Modal */}
      <UnsubscribeModal
        isOpen={showUnsubscribeModal}
        reportName={fullName}
        onConfirm={handleUnsubscribeConfirm}
        onCancel={handleUnsubscribeCancel}
      />
    </div>
  );
}
