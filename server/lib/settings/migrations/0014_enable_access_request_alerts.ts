import type { AllSettings } from '@server/lib/settings';

const MIGRATION = '0014_enable_access_request_alerts';

// Notification bits, spelled out so later changes to the enum cannot change
// what this migration did
const MEDIA_PENDING = 2;
const ACCESS_REQUESTED = 2097152;

/**
 * Turns on the new Reading App Access Requests notifications for the
 * agents that already tell admins about requests waiting for them, so an
 * ask for access is not missed after an upgrade. Runs once, so an admin who
 * turns them off again keeps them off.
 */
const enableAccessRequestAlerts = (settings: any): AllSettings => {
  if (
    Array.isArray(settings.migrations) &&
    settings.migrations.includes(MIGRATION)
  ) {
    return settings;
  }

  const agents = settings.notifications?.agents ?? {};

  for (const agent of Object.values(agents) as { types?: unknown }[]) {
    if (
      agent &&
      typeof agent.types === 'number' &&
      agent.types & MEDIA_PENDING
    ) {
      agent.types |= ACCESS_REQUESTED;
    }
  }

  if (!Array.isArray(settings.migrations)) {
    settings.migrations = [];
  }

  settings.migrations.push(MIGRATION);

  return settings;
};

export default enableAccessRequestAlerts;
