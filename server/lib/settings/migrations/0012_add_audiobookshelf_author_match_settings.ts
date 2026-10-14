import {
  DEFAULT_AUDIOBOOKSHELF_MATCH_REGION,
  isAudiobookshelfMatchRegion,
} from '@server/constants/audiobookshelf';
import type { AllSettings } from '@server/lib/settings';

/**
 * Adds the author matching settings to the Audiobookshelf block: no admin
 * API key, so authors are not matched until an admin adds one, and the us
 * region. A key written by hand is trimmed and a region Audnexus does not
 * know is reset. Values already set are kept.
 */
const addAudiobookshelfAuthorMatchSettings = (settings: any): AllSettings => {
  const current = settings.audiobookshelf;
  const block =
    current && typeof current === 'object' && !Array.isArray(current)
      ? current
      : {};
  const region =
    typeof block.authorMatchRegion === 'string'
      ? block.authorMatchRegion.trim().toLowerCase()
      : undefined;

  const next = {
    ...block,
    adminApiKey:
      typeof block.adminApiKey === 'string' ? block.adminApiKey.trim() : '',
    authorMatchRegion: isAudiobookshelfMatchRegion(region)
      ? region
      : DEFAULT_AUDIOBOOKSHELF_MATCH_REGION,
  };

  if (JSON.stringify(next) === JSON.stringify(current)) {
    return settings;
  }

  settings.audiobookshelf = next;

  return settings;
};

export default addAudiobookshelfAuthorMatchSettings;
