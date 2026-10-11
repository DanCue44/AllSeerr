import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  BazarrEpisode,
  BazarrLanguageProfile,
  BazarrSystemLanguage,
} from '@server/api/bazarr';
import {
  normalizeEpisode,
  normalizeSubtitle,
  profileLanguages,
} from '@server/lib/subtitles';

const languages: BazarrSystemLanguage[] = [
  { name: 'English', code2: 'en', code3: 'eng', enabled: true },
  { name: 'Spanish', code2: 'es', code3: 'spa', enabled: true },
  { name: 'Portuguese (Brazil)', code2: 'pb', code3: 'pob', enabled: false },
];

describe('normalizeSubtitle', () => {
  it('marks subtitles inside the video file as embedded', () => {
    const track = normalizeSubtitle({
      name: 'English',
      code2: 'en',
      code3: 'eng',
      path: null,
      forced: false,
      hi: false,
      file_size: null,
      embedded_track_id: 2,
    });

    assert.strictEqual(track.embedded, true);
    assert.strictEqual(track.fileName, undefined);
    assert.strictEqual(track.code, 'en');
  });

  it('keeps the file name and size of external subtitles', () => {
    const track = normalizeSubtitle({
      name: 'Spanish',
      code2: 'es',
      code3: 'spa',
      path: '/media/Movies/Spider-Man Brand New Day (2026)/Spider-Man Brand New Day (2026).es.forced.srt',
      forced: true,
      hi: false,
      file_size: 41250,
      embedded_track_id: null,
    });

    assert.strictEqual(track.embedded, false);
    assert.strictEqual(
      track.fileName,
      'Spider-Man Brand New Day (2026).es.forced.srt'
    );
    assert.strictEqual(track.size, 41250);
    assert.strictEqual(track.forced, true);
  });
});

describe('profileLanguages', () => {
  it('names each language in the profile and reads its flags', () => {
    const profile: BazarrLanguageProfile = {
      profileId: 1,
      name: 'English and Spanish',
      items: [
        { id: 1, language: 'en', forced: 'False', hi: 'True' },
        { id: 2, language: 'es', forced: 'True', hi: 'False' },
      ],
    };

    assert.deepStrictEqual(profileLanguages(profile, languages), [
      { code: 'en', name: 'English', forced: false, hi: true },
      { code: 'es', name: 'Spanish', forced: true, hi: false },
    ]);
  });

  it('returns nothing without a profile', () => {
    assert.deepStrictEqual(profileLanguages(undefined, languages), []);
  });
});

describe('normalizeEpisode', () => {
  it('maps season, episode and missing languages', () => {
    const episode: BazarrEpisode = {
      sonarrSeriesId: 2,
      sonarrEpisodeId: 31,
      season: 2,
      episode: 1,
      title: 'Hello, Ms. Cobel',
      monitored: true,
      subtitles: [],
      missing_subtitles: [
        {
          name: 'Spanish',
          code2: 'es',
          code3: 'spa',
          forced: false,
          hi: false,
        },
      ],
      audio_language: [],
    };

    const status = normalizeEpisode(episode);

    assert.strictEqual(status.seasonNumber, 2);
    assert.strictEqual(status.episodeNumber, 1);
    assert.deepStrictEqual(status.missing, [
      { code: 'es', name: 'Spanish', forced: false, hi: false },
    ]);
  });
});
