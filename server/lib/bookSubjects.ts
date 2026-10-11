/**
 * OpenLibrary subjects are edited by anyone and imported from library
 * catalogs, so they arrive messy: phrases split into single words ("True",
 * "Crime"), catalog headings ("Murder -- Kansas -- Case studies."), people
 * with dates, and subjects in other languages. This tidies them into tags
 * worth showing.
 */

// Phrases that turn up split into separate subjects, rejoined when their
// words sit next to each other in the list
const COMPOUNDS = [
  'true crime',
  'murder mystery',
  'science fiction',
  'historical fiction',
  'literary fiction',
  'young adult',
  'self help',
  'short stories',
  'graphic novels',
  'comic books',
  'detective and mystery stories',
  'love stories',
  'ghost stories',
  'horror fiction',
  'fantasy fiction',
  'psychological fiction',
  'domestic fiction',
  'romance fiction',
  'spy stories',
  'war stories',
  'coming of age',
  'new york times bestseller',
];

// Words that only appear in subjects written in another language
const FOREIGN_WORDS =
  /\b(etudes|études|meurtre|asesinato|análisis|analisis|casos|ficción|ficcion|novela|novelas|literatura|geschichte|kriminalroman|mord|fiktion|historia|histoire|policier|giallo|ficção|ficcao|romanzo)\b/i;

// Accented letters, and anything outside the Latin scripts. Built from a
// string so the escapes stay readable.
const NON_ENGLISH_LETTERS = new RegExp(
  '[\\u00c0-\\u024f]|[^\\x20-\\x7e\\u00a0-\\u024f]'
);

// Single-word subjects that are other languages' catalog terms ("Roman" is
// German for novel); only dropped when they stand alone
const FOREIGN_SINGLE_WORDS = new Set([
  'roman',
  'deutsch',
  'ausgabe',
  'amerikanisch',
  'englisch',
  'französisch',
  'franzosisch',
  'erzählung',
  'erzahlung',
  'jugendbuch',
  'kinderbuch',
  'sachbuch',
]);

// "Smith, Perry Edward, 1928-1965" and similar catalog name headings
const PERSON_WITH_DATES = /,\s*\d{3,4}\s*-\s*(\d{3,4})?\s*$/;

const normalize = (subject: string): string =>
  subject.trim().replace(/\s+/g, ' ');

const sentenceCase = (subject: string): string =>
  subject.charAt(0).toUpperCase() + subject.slice(1);

export const cleanBookSubjects = (
  subjects: string[] = [],
  max = 20
): string[] => {
  const words = subjects.map(normalize).filter(Boolean);
  const merged: string[] = [];

  for (let i = 0; i < words.length; i++) {
    let matched = false;

    // Try the longest phrase first
    for (const compound of COMPOUNDS) {
      const parts = compound.split(' ');
      const slice = words
        .slice(i, i + parts.length)
        .map((word) => word.toLowerCase());

      if (
        parts.length > 1 &&
        slice.length === parts.length &&
        slice.every((word, index) => word === parts[index])
      ) {
        merged.push(sentenceCase(compound));
        i += parts.length - 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      merged.push(words[i]);
    }
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const subject of merged) {
    // Catalog headings: keep the main heading only
    const heading = subject
      .split(/\s+--\s+/)[0]
      .replace(/[.;:,]+$/, '')
      .trim();

    if (
      !heading ||
      heading.length > 60 ||
      PERSON_WITH_DATES.test(subject) ||
      FOREIGN_WORDS.test(heading) ||
      FOREIGN_SINGLE_WORDS.has(heading.toLowerCase()) ||
      // Accented letters outside plain English, or non-Latin scripts
      NON_ENGLISH_LETTERS.test(heading)
    ) {
      continue;
    }

    const key = heading.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(heading);
    }
  }

  return cleaned.slice(0, max);
};

// OpenLibrary subject keys, as in /subjects/science_fiction. Hyphens are
// part of some keys ("self-help" is a different subject from "self_help").
export const BOOK_SUBJECT_SLUG_REGEX = /^[a-z0-9_-]+$/;

export const MAX_BOOK_SUBJECT_LENGTH = 100;

const SUBJECT_PATH = /\/subjects\/([^/?#]+)/i;

/**
 * Turns a subject as an admin types it ("Science fiction"), an OpenLibrary
 * subject link or a subject key into the key OpenLibrary uses. Each space
 * becomes an underscore and other punctuation is dropped, the way
 * OpenLibrary builds its keys ("Adventure / thriller" is
 * adventure__thriller).
 */
export const toBookSubjectSlug = (input: string): string => {
  let subject = input.trim();
  const path = SUBJECT_PATH.exec(subject);

  if (path) {
    subject = path[1].replace(/\.json$/i, '');

    try {
      subject = decodeURIComponent(subject);
    } catch {
      // Not encoded, so it is used as it is
    }
  }

  return subject
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 _-]/g, '')
    .trim()
    .replace(/ /g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_BOOK_SUBJECT_LENGTH);
};

export const isBookSubjectSlug = (subject: string): boolean =>
  subject.length > 0 &&
  subject.length <= MAX_BOOK_SUBJECT_LENGTH &&
  BOOK_SUBJECT_SLUG_REGEX.test(subject);

/** A readable name for a subject key, for when OpenLibrary's is not at hand */
export const getBookSubjectLabel = (subject: string): string =>
  subject.replace(/_+/g, ' ').trim();
