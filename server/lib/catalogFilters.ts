import { MediaStatus } from '@server/constants/media';

// Helpers shared by the discography and author catalog requests on the
// server and their modals. Kept free of server only imports.

// A single bulk request makes at most this many requests. A book requested
// in both formats is two.
export const MAX_BULK_REQUEST_ITEMS = 100;

// The release types a discography is requested by, in the order shown. The
// rarer MusicBrainz types (Spokenword, DJ-mix, Demo...) fall under Other.
export const DISCOGRAPHY_TYPES = [
  'Album',
  'EP',
  'Single',
  'Live',
  'Compilation',
  'Soundtrack',
  'Remix',
  'Other',
] as const;

export type DiscographyType = (typeof DISCOGRAPHY_TYPES)[number];

export const DEFAULT_DISCOGRAPHY_TYPES: DiscographyType[] = ['Album', 'EP'];

/**
 * The release type a release group is requested under: its first secondary
 * type (Live, Compilation...) and otherwise its primary type, the way the
 * artist page groups releases
 */
export const getDiscographyType = (
  albumType?: string,
  secondaryTypes?: string[]
): DiscographyType => {
  const type = secondaryTypes?.[0] ?? albumType;

  return DISCOGRAPHY_TYPES.find((value) => value === type) ?? 'Other';
};

export type BulkSkipReason = 'requested' | 'available' | 'blocklisted';

/**
 * Why an album, or one format of a book, is left out of a bulk request, or
 * undefined when it can be requested. A blocklisted book is blocklisted in
 * both formats, so pass its ebook status as blocklistStatus.
 */
export const getBulkSkipReason = (
  status?: MediaStatus,
  blocklistStatus = status
): BulkSkipReason | undefined => {
  if (blocklistStatus === MediaStatus.BLOCKLISTED) {
    return 'blocklisted';
  }

  switch (status) {
    case MediaStatus.AVAILABLE:
    case MediaStatus.PARTIALLY_AVAILABLE:
      return 'available';
    case MediaStatus.PENDING:
    case MediaStatus.PROCESSING:
      return 'requested';
    default:
      return undefined;
  }
};

export type WorkKind = 'book' | 'studyGuide' | 'collection';

const STUDY_GUIDE_PATTERN = new RegExp(
  [
    'study guide',
    'spark ?notes',
    'cliffs? ?notes',
    "cliff's notes",
    'york notes',
    'coles notes',
    'monarch notes',
    "readers?'? guide",
    "teachers?'? guide",
    'literature guide',
    'lesson plans?',
    'summary (of|and|&)',
    'summary\\s*:',
    '^summary\\b',
    'analysis of',
    'workbook',
    'quiz ?book',
  ]
    .map((pattern) => `(${pattern})`)
    .join('|'),
  'i'
);

const COLLECTION_PATTERN = new RegExp(
  [
    'box(ed)? ?set',
    '\\bcollection\\b',
    'collected (works|stories|novels|poems|plays)',
    'complete (works|novels|stories|poems|plays|series|collection)',
    'omnibus',
    'anthology',
    'selected (works|stories|poems)',
    '\\bbooks? \\d+ ?(-|–|to|&|and) ?\\d+',
    '\\b\\d+[ -]books?\\b',
    '\\b(trilogy|series) set\\b',
  ]
    .map((pattern) => `(${pattern})`)
    .join('|'),
  'i'
);

/**
 * Tells study guides, summaries and box sets apart from the books of an
 * author by their title, so a catalog request can leave them out by default.
 * A guess from the title only: anything else counts as a book.
 */
export const getWorkKind = (title: string, subtitle?: string): WorkKind => {
  const text = [title, subtitle].filter(Boolean).join(': ');

  if (STUDY_GUIDE_PATTERN.test(text)) {
    return 'studyGuide';
  }

  if (COLLECTION_PATTERN.test(text)) {
    return 'collection';
  }

  return 'book';
};
