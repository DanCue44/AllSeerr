import type { AllSettings } from '@server/lib/settings';

const MIGRATION = '0013_lowercase_allseerr_name';

// The name was spelled with a capital S before 3.5.0.2
const OLD_NAME = 'AllSeerr';
const NEW_NAME = 'Allseerr';

/**
 * Moves the default application title and email sender name to the new
 * spelling. Titles and sender names an admin chose are left alone. Runs once.
 */
const lowercaseAllseerrName = (settings: any): AllSettings => {
  if (
    Array.isArray(settings.migrations) &&
    settings.migrations.includes(MIGRATION)
  ) {
    return settings;
  }

  if (settings.main?.applicationTitle === OLD_NAME) {
    settings.main.applicationTitle = NEW_NAME;
  }

  const email = settings.notifications?.agents?.email?.options;
  if (email?.senderName === OLD_NAME) {
    email.senderName = NEW_NAME;
  }

  if (!Array.isArray(settings.migrations)) {
    settings.migrations = [];
  }

  settings.migrations.push(MIGRATION);

  return settings;
};

export default lowercaseAllseerrName;
