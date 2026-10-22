import type { AllSettings } from '@server/lib/settings';

const MIGRATION = '0015_enable_access_granted_alerts';

// Notification bits, spelled out so later changes to the enum cannot change
// what this migration did
const MEDIA_APPROVED = 4;
const ACCESS_GRANTED = 4194304;

/**
 * Turns on the new Reading App Access Granted notifications for the agents
 * that already tell people their requests were approved, so someone given
 * an app hears about it after an upgrade. Runs once, so an admin who turns
 * them off again keeps them off.
 */
const enableAccessGrantedAlerts = (settings: any): AllSettings => {
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
      agent.types & MEDIA_APPROVED
    ) {
      agent.types |= ACCESS_GRANTED;
    }
  }

  if (!Array.isArray(settings.migrations)) {
    settings.migrations = [];
  }

  settings.migrations.push(MIGRATION);

  return settings;
};

export default enableAccessGrantedAlerts;
