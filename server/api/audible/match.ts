import type { AudibleProduct } from './interfaces';

// Shorter titles must cover this much of the longer one to count as the
// same book, so "Dune" never matches "Dune Messiah and Other Stories"
const MIN_CONTAINED_RATIO = 0.6;

// Listings about a book rather than the book itself
const COMPANION_TERMS = [
  'workbook',
  'summary',
  'summary of',
  'analysis of',
  'study guide',
  'sparknotes',
  'cliffsnotes',
];

const LEADING_ARTICLE = /^(the|a|an)\s+/;
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);

const stripDiacritics = (value: string): string =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

const cleanWords = (value: string): string =>
  stripDiacritics(value.toLowerCase())
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Comparable form of a title: lowercase, without the subtitle after a colon,
 * bracketed notes such as "(Unabridged)", punctuation or a leading article
 */
export const normalizeTitle = (title: string): string => {
  const main = title
    .split(':')[0]
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/\s[-\u2013\u2014]\s/)[0];

  return cleanWords(main).replace(LEADING_ARTICLE, '');
};

/**
 * Last names of the authors in a name list such as "Neil Gaiman, Terry
 * Pratchett" or "J. R. R. Tolkien"
 */
export const getAuthorLastNames = (names: string[]): Set<string> => {
  const lastNames = new Set<string>();

  for (const name of names
    .flatMap((entry) => entry.split(/,|;|&|\band\b/))
    .map(cleanWords)
    .filter(Boolean)) {
    const words = name.split(' ').filter((word) => !NAME_SUFFIXES.has(word));
    const lastName = words[words.length - 1];

    if (lastName && lastName.length > 1) {
      lastNames.add(lastName);
    }
  }

  return lastNames;
};

export const hasCompanionTerm = (value: string): boolean => {
  const words = ` ${cleanWords(value)} `;

  return COMPANION_TERMS.some((term) => words.includes(` ${term} `));
};

export const isTitleMatch = (sourceTitle: string, candidate: string) => {
  const source = normalizeTitle(sourceTitle);
  const other = normalizeTitle(candidate);

  if (!source || !other) {
    return false;
  }

  if (source === other) {
    return true;
  }

  const [shorter, longer] =
    source.length <= other.length ? [source, other] : [other, source];

  return (
    ` ${longer} `.includes(` ${shorter} `) &&
    shorter.length / longer.length >= MIN_CONTAINED_RATIO
  );
};

export const isAuthorMatch = (
  sourceAuthors: string[],
  candidateAuthors: string[]
): boolean => {
  const source = getAuthorLastNames(sourceAuthors);
  const other = getAuthorLastNames(candidateAuthors);

  return [...source].some((lastName) => other.has(lastName));
};

export interface EditionCandidate {
  title?: string;
  subtitle?: string;
  authors: string[];
}

/**
 * Whether a catalog listing is an edition of the book. The author has to
 * match, and companions such as summaries and workbooks are skipped unless
 * the book itself is one.
 */
export const isEditionMatch = (
  title: string,
  authors: string[],
  candidate: EditionCandidate
): boolean => {
  if (!candidate.title) {
    return false;
  }

  const fullTitle = [candidate.title, candidate.subtitle]
    .filter(Boolean)
    .join(' ');

  if (!hasCompanionTerm(title) && hasCompanionTerm(fullTitle)) {
    return false;
  }

  return (
    isTitleMatch(title, candidate.title) &&
    isAuthorMatch(authors, candidate.authors)
  );
};

/**
 * Picks the Audible product that is an edition of the book, if any
 */
export const findAudiobookMatch = (
  title: string,
  authors: string[],
  products: AudibleProduct[]
): AudibleProduct | undefined =>
  products.find((product) =>
    isEditionMatch(title, authors, {
      title: product.title,
      subtitle: product.subtitle,
      authors: (product.authors ?? []).map((author) => author.name),
    })
  );
