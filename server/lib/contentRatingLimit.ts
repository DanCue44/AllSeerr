import type {
  TmdbMovieReleaseResult,
  TmdbTvRatingResult,
} from '@server/api/themoviedb/interfaces';

/**
 * Rating limits are compared on the US scales only. Other regions use their
 * own scales (BBFC, FSK, ...) that do not map cleanly onto each other, so the
 * US certification is read no matter which discover or streaming region the
 * server uses.
 */
export const RATING_LIMIT_REGION = 'US';

// Ordered from least to most restrictive
export const MOVIE_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
export const TV_RATINGS = [
  'TV-Y',
  'TV-Y7',
  'TV-G',
  'TV-PG',
  'TV-14',
  'TV-MA',
] as const;

export type MovieRating = (typeof MOVIE_RATINGS)[number];
export type TvRating = (typeof TV_RATINGS)[number];

/**
 * Returns the position of a rating on its scale, or -1 when it is not part
 * of the scale (NR, Unrated, empty, or a rating from another region).
 */
export const getRatingIndex = (
  scale: readonly string[],
  rating?: string | null
): number => {
  if (!rating) {
    return -1;
  }

  const normalized = rating.trim().toUpperCase();

  // TV-Y7-FV is TV-Y7 with a fantasy violence descriptor
  return scale.indexOf(normalized === 'TV-Y7-FV' ? 'TV-Y7' : normalized);
};

/**
 * Returns the stored limit when it is a known rating, otherwise null (no
 * limit). Used to clean values before saving them to a user.
 */
export const parseRatingLimit = (
  scale: readonly string[],
  value?: string | null
): string | null => {
  const index = getRatingIndex(scale, value);
  return index >= 0 ? scale[index] : null;
};

/**
 * Finds the US certification of a movie. When TMDB lists several release
 * dates with different certifications, the most restrictive one is used.
 */
export const getMovieCertification = (
  releases?: TmdbMovieReleaseResult
): MovieRating | undefined => {
  const releaseDates =
    releases?.results?.find(
      (release) => release.iso_3166_1 === RATING_LIMIT_REGION
    )?.release_dates ?? [];

  const index = Math.max(
    -1,
    ...releaseDates.map((release) =>
      getRatingIndex(MOVIE_RATINGS, release.certification)
    )
  );

  return index >= 0 ? MOVIE_RATINGS[index] : undefined;
};

/**
 * Finds the US content rating of a series.
 */
export const getTvContentRating = (
  contentRatings?: TmdbTvRatingResult
): TvRating | undefined => {
  const index = getRatingIndex(
    TV_RATINGS,
    contentRatings?.results?.find(
      (rating) => rating.iso_3166_1 === RATING_LIMIT_REGION
    )?.rating
  );

  return index >= 0 ? TV_RATINGS[index] : undefined;
};

/**
 * Checks a rating against a limit. Titles without a known rating are always
 * allowed, as are users without a limit.
 */
export const exceedsRatingLimit = (
  scale: readonly string[],
  rating?: string | null,
  limit?: string | null
): boolean => {
  const limitIndex = getRatingIndex(scale, limit);

  if (limitIndex < 0) {
    return false;
  }

  return getRatingIndex(scale, rating) > limitIndex;
};
