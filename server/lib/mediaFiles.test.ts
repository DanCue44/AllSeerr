import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RadarrMovie } from '@server/api/servarr/radarr';
import type { SonarrEpisodeFile } from '@server/api/servarr/sonarr';
import {
  normalizeEpisodeFile,
  normalizeMovieFile,
  splitLanguages,
} from '@server/lib/mediaFiles';

type MovieFile = NonNullable<RadarrMovie['movieFile']>;

const movieFile: MovieFile = {
  id: 12,
  movieId: 4,
  relativePath: 'Spider-Man Brand New Day (2026) WEBDL-2160p.mkv',
  path: '/media/Movies/Spider-Man Brand New Day (2026)/Spider-Man Brand New Day (2026) WEBDL-2160p.mkv',
  size: 23300000000,
  dateAdded: '2026-10-02T14:12:00Z',
  releaseGroup: 'GROUP',
  quality: { quality: { id: 18, name: 'WEBDL-2160p', resolution: 2160 } },
  languages: [{ id: 1, name: 'English' }],
  mediaInfo: {
    id: 1,
    audioBitrate: 768000,
    audioChannels: 5.1,
    audioCodec: 'EAC3 Atmos',
    audioLanguages: 'English/Spanish',
    audioStreamCount: 2,
    videoBitDepth: 10,
    videoBitrate: 19000000,
    videoCodec: 'HEVC',
    videoFps: 23.976,
    videoDynamicRange: 'HDR',
    videoDynamicRangeType: 'DV HDR10',
    resolution: '3840x2160',
    runTime: '2:25:14',
    scanType: 'Progressive',
    subtitles: 'English / Spanish / ',
  },
  qualityCutoffNotMet: false,
};

describe('splitLanguages', () => {
  it('splits slash separated values and drops blanks', () => {
    assert.deepStrictEqual(splitLanguages('English / Spanish / '), [
      'English',
      'Spanish',
    ]);
  });

  it('returns an empty list for missing values', () => {
    assert.deepStrictEqual(splitLanguages(undefined), []);
    assert.deepStrictEqual(splitLanguages(''), []);
  });
});

describe('normalizeMovieFile', () => {
  it('maps Radarr file details', () => {
    const file = normalizeMovieFile(movieFile, true);

    assert.strictEqual(
      file.fileName,
      'Spider-Man Brand New Day (2026) WEBDL-2160p.mkv'
    );
    assert.strictEqual(file.path, movieFile.path);
    assert.strictEqual(file.quality, 'WEBDL-2160p');
    assert.strictEqual(file.resolution, 2160);
    assert.deepStrictEqual(file.languages, ['English']);
    assert.strictEqual(file.mediaInfo?.videoDynamicRange, 'DV HDR10');
    assert.deepStrictEqual(file.mediaInfo?.audioLanguages, [
      'English',
      'Spanish',
    ]);
    assert.deepStrictEqual(file.mediaInfo?.subtitles, ['English', 'Spanish']);
  });

  it('leaves out the full path when not allowed', () => {
    const file = normalizeMovieFile(movieFile, false);

    assert.strictEqual(file.path, undefined);
    assert.strictEqual(
      file.fileName,
      'Spider-Man Brand New Day (2026) WEBDL-2160p.mkv'
    );
  });

  it('falls back to the path for the file name', () => {
    const file = normalizeMovieFile(
      { ...movieFile, relativePath: undefined },
      false
    );

    assert.strictEqual(
      file.fileName,
      'Spider-Man Brand New Day (2026) WEBDL-2160p.mkv'
    );
  });
});

describe('normalizeEpisodeFile', () => {
  it('maps Sonarr file details with its episode numbers', () => {
    const episodeFile: SonarrEpisodeFile = {
      id: 31,
      seriesId: 2,
      seasonNumber: 2,
      relativePath: 'Season 02/Severance - S02E01 - Hello, Ms. Cobel.mkv',
      size: 4100000000,
      dateAdded: '2026-01-17T09:00:00Z',
      quality: { quality: { id: 15, name: 'WEBDL-1080p', resolution: 1080 } },
      languages: [{ id: 1, name: 'English' }],
    };

    const file = normalizeEpisodeFile(episodeFile, [1], false);

    assert.strictEqual(
      file.fileName,
      'Severance - S02E01 - Hello, Ms. Cobel.mkv'
    );
    assert.strictEqual(file.seasonNumber, 2);
    assert.deepStrictEqual(file.episodeNumbers, [1]);
    assert.strictEqual(file.mediaInfo, undefined);
  });
});
