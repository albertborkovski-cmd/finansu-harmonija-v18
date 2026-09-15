import type { AppSession } from './accessControl';
import {
  hasAdministratorRole,
  hasOrganizationSubstitution,
  isAccountantAssigned,
  loadLinkedDirectoryUsers,
  loadOrganizationUserIds,
  organizationAssignmentStorageKey,
  type LinkedOrganization,
  type SettingsAudience,
} from './linkedSettingsData';
import type { TaskAssignee, TaskRelatedObject } from './taskCreation';
import { loadRelatedObjects } from './relatedObjects';

type TaskOrganization = LinkedOrganization & { assigned_accountant?: string };

/** Task assignment includes both audiences and allows assigning yourself. */
export function loadTaskAssignees(organization: TaskOrganization): TaskAssignee[] {
  const organizationIdentities = new Set([
    organization.id.trim().toLowerCase(),
    organization.name.trim().toLowerCase(),
  ]);

  return (['Internal users', 'External users'] as SettingsAudience[]).flatMap(audience => {
    const assigned = new Set(loadOrganizationUserIds(organization.id, audience));
    const hasExplicitAssignments = window.localStorage.getItem(
      organizationAssignmentStorageKey(organization.id, audience),
    ) !== null;

    return loadLinkedDirectoryUsers(audience).flatMap(user => {
      const email = user.email?.trim();
      const status = user.status?.trim().toLowerCase();
      if (!email || (status && !['enabled', 'active'].includes(status))) return [];

      const internalAccess = audience === 'Internal users' && (
        hasAdministratorRole(user)
        || isAccountantAssigned(organization, user)
        || hasOrganizationSubstitution(organization.id, user.id)
      );
      const legacyOrganizations = user.organizations?.trim().toLowerCase() ?? '';
      const legacyAssigned = !hasExplicitAssignments && (
        legacyOrganizations === 'all organizations'
        || legacyOrganizations.split(',').some(name => organizationIdentities.has(name.trim()))
      );
      if (!assigned.has(user.id) && !internalAccess && !legacyAssigned) return [];

      return [{
        id: `${audience}:${user.id}`,
        userId: user.id,
        name: user.fullName?.trim() || user.username?.trim() || email,
        email,
        audience,
        organizationId: organization.id,
      }];
    });
  });
}

/** Share the organization's accessible object catalog with notifications. */
export async function loadTaskRelatedObjects(
  organization: TaskOrganization,
  session: AppSession,
): Promise<TaskRelatedObject[]> {
  return loadRelatedObjects(organization, session);
}
