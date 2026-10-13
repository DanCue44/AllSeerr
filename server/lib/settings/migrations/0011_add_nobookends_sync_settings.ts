import type { AllSettings } from '@server/lib/settings';

const trimUrl = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';

/**
 * Adds the NoBookEnds Sync block, turned off, to settings files from before
 * it existed, and tidies one written by hand: addresses without a trailing
 * slash and a real true or false for enabled. Values already set are kept.
 */
const addNoBookEndsSyncSettings = (settings: any): AllSettings => {
  const current = settings.nobookendsSync;
  const block =
    current && typeof current === 'object' && !Array.isArray(current)
      ? current
      : {};

  const next = {
    ...block,
    enabled: block.enabled === true,
    url: trimUrl(block.url),
    internalUrl: trimUrl(block.internalUrl),
    adminToken:
      typeof block.adminToken === 'string' ? block.adminToken.trim() : '',
  };

  if (JSON.stringify(next) === JSON.stringify(current)) {
    return settings;
  }

  settings.nobookendsSync = next;

  return settings;
};

export default addNoBookEndsSyncSettings;
