// Regions Audnexus, which Audiobookshelf matches authors with, knows
export const AUDIOBOOKSHELF_MATCH_REGIONS = [
  'us',
  'ca',
  'uk',
  'au',
  'fr',
  'de',
  'jp',
  'it',
  'in',
  'es',
] as const;

export type AudiobookshelfMatchRegion =
  (typeof AUDIOBOOKSHELF_MATCH_REGIONS)[number];

export const DEFAULT_AUDIOBOOKSHELF_MATCH_REGION: AudiobookshelfMatchRegion =
  'us';

export const isAudiobookshelfMatchRegion = (
  value: unknown
): value is AudiobookshelfMatchRegion =>
  typeof value === 'string' &&
  (AUDIOBOOKSHELF_MATCH_REGIONS as readonly string[]).includes(value);
