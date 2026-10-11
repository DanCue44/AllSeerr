import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  TmdbMovieReleaseResult,
  TmdbTvRatingResult,
} from '@server/api/themoviedb/interfaces';
import {
  MOVIE_RATINGS,
  TV_RATINGS,
  exceedsRatingLimit,
  getMovieCertification,
  getTvContentRating,
  parseRatingLimit,
} from '@server/lib/contentRatingLimit';

const releases = (
  results: { iso_3166_1: string; certifications: string[] }[]
): TmdbMovieReleaseResult =>
  ({
    results: results.map((result) => ({
      iso_3166_1: result.iso_3166_1,
      release_dates: result.certifications.map((certification, i) => ({
        certification,
        release_date: '2020-01-01T00:00:00.000Z',
        type: i + 3,
      })),
    })),
  }) as TmdbMovieReleaseResult;

describe('exceedsRatingLimit', () => {
  it('flags movies rated above the limit', () => {
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, 'R', 'PG-13'), true);
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, 'NC-17', 'G'), true);
  });

  it('allows movies at or below the limit', () => {
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, 'PG-13', 'PG-13'), false);
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, 'G', 'PG'), false);
  });

  it('orders the TV scale', () => {
    assert.equal(exceedsRatingLimit(TV_RATINGS, 'TV-MA', 'TV-14'), true);
    assert.equal(exceedsRatingLimit(TV_RATINGS, 'TV-G', 'TV-Y7'), true);
    assert.equal(exceedsRatingLimit(TV_RATINGS, 'TV-Y7-FV', 'TV-Y7'), false);
    assert.equal(exceedsRatingLimit(TV_RATINGS, 'tv-pg', 'TV-PG'), false);
  });

  it('allows titles without a known rating', () => {
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, undefined, 'G'), false);
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, 'NR', 'G'), false);
    assert.equal(exceedsRatingLimit(TV_RATINGS, '15', 'TV-Y'), false);
  });

  it('allows everything without a limit', () => {
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, 'NC-17', null), false);
    assert.equal(exceedsRatingLimit(MOVIE_RATINGS, 'NC-17', ''), false);
    assert.equal(exceedsRatingLimit(TV_RATINGS, 'TV-MA', 'bogus'), false);
  });
});

describe('parseRatingLimit', () => {
  it('keeps known ratings and drops anything else', () => {
    assert.equal(parseRatingLimit(MOVIE_RATINGS, 'pg-13'), 'PG-13');
    assert.equal(parseRatingLimit(TV_RATINGS, 'TV-14'), 'TV-14');
    assert.equal(parseRatingLimit(MOVIE_RATINGS, 'TV-14'), null);
    assert.equal(parseRatingLimit(MOVIE_RATINGS, ''), null);
    assert.equal(parseRatingLimit(MOVIE_RATINGS, null), null);
  });
});

describe('getMovieCertification', () => {
  it('reads the US certification', () => {
    assert.equal(
      getMovieCertification(
        releases([
          { iso_3166_1: 'GB', certifications: ['18'] },
          { iso_3166_1: 'US', certifications: ['', 'PG-13'] },
        ])
      ),
      'PG-13'
    );
  });

  it('uses the most restrictive US certification', () => {
    assert.equal(
      getMovieCertification(
        releases([{ iso_3166_1: 'US', certifications: ['PG-13', 'NR', 'R'] }])
      ),
      'R'
    );
  });

  it('returns nothing without a US certification', () => {
    assert.equal(
      getMovieCertification(
        releases([{ iso_3166_1: 'GB', certifications: ['15'] }])
      ),
      undefined
    );
    assert.equal(getMovieCertification(undefined), undefined);
  });
});

describe('getTvContentRating', () => {
  it('reads the US content rating', () => {
    const contentRatings: TmdbTvRatingResult = {
      results: [
        { iso_3166_1: 'DE', rating: '16' },
        { iso_3166_1: 'US', rating: 'TV-14' },
      ],
    };

    assert.equal(getTvContentRating(contentRatings), 'TV-14');
  });

  it('returns nothing without a US content rating', () => {
    assert.equal(
      getTvContentRating({ results: [{ iso_3166_1: 'DE', rating: '16' }] }),
      undefined
    );
    assert.equal(getTvContentRating(undefined), undefined);
  });
});
