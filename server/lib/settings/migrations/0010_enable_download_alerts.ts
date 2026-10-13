import type { AllSettings } from '@server/lib/settings';

const MIGRATION = '0010_enable_download_alerts';

// Notification bits, spelled out so later changes to the enum cannot change
// what this migration did
const MEDIA_FAILED = 16;
const SCAN_FAILURE = 524288;
const DOWNLOAD_NEEDS_ATTENTION = 1048576;

/**
 * Turns on the new Download Needs Attention notifications for the agents
 * that already send admin alerts about failures (Request Processing Failed
 * or Scan Failures), so a stuck download is not missed after an upgrade.
 * Runs once, so an admin who turns them off again keeps them off.
 */
const enableDownloadAlerts = (settings: any): AllSettings => {
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
      agent.types & (MEDIA_FAILED | SCAN_FAILURE)
    ) {
      agent.types |= DOWNLOAD_NEEDS_ATTENTION;
    }
  }

  if (!Array.isArray(settings.migrations)) {
    settings.migrations = [];
  }

  settings.migrations.push(MIGRATION);

  return settings;
};

export default enableDownloadAlerts;
