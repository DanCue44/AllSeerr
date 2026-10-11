import type { AlbumResult, ArtistResult } from '@server/models/Search';

const tokens = (value: string): string[] =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const containsAll = (haystack: string[], needles: string[]): boolean =>
  needles.length > 0 && needles.every((needle) => haystack.includes(needle));

const LESSER_TYPES = [
  'Compilation',
  'Live',
  'Remix',
  'DJ-mix',
  'Mixtape/Street',
];
const TRIBUTE_WORDS = ['tribute', 'karaoke', 'cover', 'covers', 'instrumental'];

/**
 * Re-scores a music search result against the query. MusicBrainz scores
 * only measure text similarity, so "Michael Jackson's Thriller" by a sax
 * tribute act outranks Thriller by Michael Jackson. This prefers results
 * whose artist and title together make up the query and pushes down
 * compilations, live albums and tribute releases.
 */
export const rankMusicResult = (
  query: string,
  result: AlbumResult | ArtistResult
): number => {
  const queryTokens = tokens(query);
  let score = result.score ?? 0;

  if (result.mediaType === 'artist') {
    const nameTokens = tokens(result.name);
    if (nameTokens.join(' ') === queryTokens.join(' ')) {
      score += 30;
    } else if (containsAll(queryTokens, nameTokens)) {
      score += 10;
    }
    return score;
  }

  const titleTokens = tokens(result.title);
  const artistTokens = tokens(result.artistName ?? '');
  const titleInQuery = containsAll(queryTokens, titleTokens);
  const artistInQuery = containsAll(queryTokens, artistTokens);

  if (titleInQuery && artistInQuery) {
    score += 40;
  } else if (titleInQuery && titleTokens.join(' ') === queryTokens.join(' ')) {
    score += 20;
  } else if (artistInQuery) {
    score += 10;
  }

  if (result.albumType === 'Album') {
    score += 8;
  }

  if (artistTokens.join(' ') === 'various artists') {
    score -= 30;
  }

  if (result.secondaryTypes?.some((type) => LESSER_TYPES.includes(type))) {
    score -= 15;
  }

  // A tribute names the original in its title, which inflates its text score
  if (titleTokens.some((token) => TRIBUTE_WORDS.includes(token))) {
    score -= 25;
  }

  return score;
};
