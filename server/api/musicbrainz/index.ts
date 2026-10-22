import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import ExternalAPI from '@server/api/externalapi';
import { ALLSEERR_REPO_URL } from '@server/constants/repository';
import cacheManager from '@server/lib/cache';
import { getAppVersion } from '@server/utils/appVersion';

import type {
  MbAlbumDetails,
  MbArtist,
  MbArtistDetails,
  MbBrowseReleaseGroupsResponse,
  MbRelease,
  MbReleaseGroup,
} from './interfaces';

const CACHE_TTL = 43200;
const BASE_URL = 'https://musicbrainz.org/ws/2/';
const MAX_RPS = 1;

const window = new JSDOM('').window;
const purify = DOMPurify(window);

export const UUID_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// MusicBrainz asks clients to name themselves with a way to reach them
export const getDefaultMusicBrainzUserAgent = (): string =>
  `Allseerr/${getAppVersion()} ( ${ALLSEERR_REPO_URL} )`;

export const headers: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': getDefaultMusicBrainzUserAgent(),
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

class MusicBrainz extends ExternalAPI {
  constructor() {
    super(
      BASE_URL,
      {},
      {
        headers,
        nodeCache: cacheManager.getCache('musicbrainz').data,
        publicCatalog: true,
        rateLimit: {
          maxRequests: MAX_RPS,
          maxRPS: MAX_RPS,
        },
      }
    );
  }

  public async searchAlbum({
    query,
    limit = 30,
    offset = 0,
  }: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<MbAlbumDetails[]> {
    try {
      const data = await this.get<{
        'release-groups': MbAlbumDetails[];
      }>(
        '/release-group',
        {
          params: {
            query,
            fmt: 'json',
            limit: String(limit),
            offset: String(offset),
          },
        },
        CACHE_TTL
      );

      return data['release-groups'];
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to search albums: ${getErrorMessage(error)}`
      );
    }
  }

  public async searchArtist({
    query,
    limit = 50,
    offset = 0,
  }: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<MbArtistDetails[]> {
    try {
      const data = await this.get<{
        artists: MbArtistDetails[];
      }>(
        '/artist',
        {
          params: {
            query,
            fmt: 'json',
            limit: String(limit),
            offset: String(offset),
          },
        },
        CACHE_TTL
      );

      return data.artists;
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to search artists: ${getErrorMessage(error)}`
      );
    }
  }

  public async getAlbum({
    releaseGroupId,
  }: {
    releaseGroupId: string;
  }): Promise<MbReleaseGroup> {
    if (!UUID_REGEX.test(releaseGroupId)) {
      throw new Error('Invalid MusicBrainz release group ID format');
    }

    try {
      return await this.get<MbReleaseGroup>(
        `/release-group/${releaseGroupId}`,
        {
          params: {
            inc: 'artist-credits+releases+genres+tags+url-rels',
            fmt: 'json',
          },
        },
        CACHE_TTL
      );
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to fetch album: ${getErrorMessage(error)}`
      );
    }
  }

  public async getRelease({
    releaseId,
  }: {
    releaseId: string;
  }): Promise<MbRelease> {
    if (!UUID_REGEX.test(releaseId)) {
      throw new Error('Invalid MusicBrainz release ID format');
    }

    try {
      return await this.get<MbRelease>(
        `/release/${releaseId}`,
        {
          params: {
            inc: 'recordings+artist-credits',
            fmt: 'json',
          },
        },
        CACHE_TTL
      );
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to fetch release: ${getErrorMessage(error)}`
      );
    }
  }

  public async getArtist({
    artistId,
  }: {
    artistId: string;
  }): Promise<MbArtist> {
    if (!UUID_REGEX.test(artistId)) {
      throw new Error('Invalid MusicBrainz artist ID format');
    }

    try {
      return await this.get<MbArtist>(
        `/artist/${artistId}`,
        {
          params: {
            inc: 'genres+tags+url-rels',
            fmt: 'json',
          },
        },
        CACHE_TTL
      );
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to fetch artist: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Lists the albums, EPs and singles of an artist, a page at a time
   */
  public async getArtistReleaseGroups({
    artistId,
    limit = 100,
    offset = 0,
  }: {
    artistId: string;
    limit?: number;
    offset?: number;
  }): Promise<MbBrowseReleaseGroupsResponse> {
    if (!UUID_REGEX.test(artistId)) {
      throw new Error('Invalid MusicBrainz artist ID format');
    }

    try {
      return await this.get<MbBrowseReleaseGroupsResponse>(
        '/release-group',
        {
          params: {
            artist: artistId,
            type: 'album|ep|single',
            inc: 'artist-credits',
            fmt: 'json',
            limit: String(limit),
            offset: String(offset),
          },
        },
        CACHE_TTL
      );
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to fetch artist release groups: ${getErrorMessage(
          error
        )}`
      );
    }
  }

  public async getArtistWikipediaExtract({
    artistMbid,
    language = 'en',
  }: {
    artistMbid: string;
    language?: string;
  }): Promise<{ title: string; url: string; content: string } | null> {
    if (!UUID_REGEX.test(artistMbid)) {
      throw new Error('Invalid MusicBrainz artist ID format');
    }

    try {
      const webRoot = BASE_URL.replace(/\/ws\/\d+\/?$/, '').replace(/\/+$/, '');

      const response = await this.axios.get(
        `${webRoot}/artist/${artistMbid}/wikipedia-extract`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Language': language,
            'User-Agent': getDefaultMusicBrainzUserAgent(),
          },
        }
      );

      const extract = response.data?.wikipediaExtract;

      if (!extract?.content) {
        return null;
      }

      return {
        title: extract.title,
        url: extract.url,
        content: purify
          .sanitize(extract.content, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: [],
          })
          .trim(),
      };
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to fetch Wikipedia extract: ${getErrorMessage(
          error
        )}`
      );
    }
  }

  public async getReleaseGroup({
    releaseId,
  }: {
    releaseId: string;
  }): Promise<string | null> {
    try {
      const data = await this.get<{
        'release-group'?: {
          id: string;
        };
      }>(
        `/release/${releaseId}`,
        {
          params: {
            inc: 'release-groups',
            fmt: 'json',
          },
        },
        CACHE_TTL
      );

      return data['release-group']?.id ?? null;
    } catch (error) {
      throw new Error(
        `[MusicBrainz] Failed to fetch release group: ${getErrorMessage(error)}`
      );
    }
  }
}

export default MusicBrainz;
