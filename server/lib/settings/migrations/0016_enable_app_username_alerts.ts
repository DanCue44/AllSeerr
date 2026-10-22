import type { AllSettings } from '@server/lib/settings';

const MIGRATION = '0016_enable_app_username_alerts';

// Notification bits, spelled out so later changes to the enum cannot change
// what this migration did
const ACCESS_GRANTED = 4194304;
const APP_USERNAME_CHANGED = 8388608;

/**
 * Turns on the new Reading App Username Changed notifications for the
 * agents that already tell people they were given an app, so someone whose
 * username changes to match Plex hears about it after an upgrade. Runs
 * once, so an admin who turns them off again keeps them off.
 */
const enableAppUsernameAlerts = (settings: any): AllSettings => {
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
      agent.types & ACCESS_GRANTED
    ) {
      agent.types |= APP_USERNAME_CHANGED;
    }
  }

  if (!Array.isArray(settings.migrations)) {
    settings.migrations = [];
  }

  settings.migrations.push(MIGRATION);

  return settings;
};

export default enableAppUsernameAlerts;
