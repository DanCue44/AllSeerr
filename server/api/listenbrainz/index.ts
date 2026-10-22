import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import { getContactUserAgent } from '@server/utils/userAgent';
import type {
  LbFreshReleasesResponse,
  LbLabsSimilarArtist,
  LbRadioArtistResponse,
  LbReleaseGroupMetadataResponse,
  LbSimilarArtist,
  LbTopAlbumsResponse,
  LbTopArtistsResponse,
} from './interfaces';

const CACHE_TTL = 43200;
// Similar artists change slowly, each list is kept for a day
const SIMILAR_ARTISTS_TTL = 86400;
const SIMILAR_ARTISTS_TIMEOUT = 10000;
// The dataset the ListenBrainz artist pages read their similar artists from
const SIMILAR_ARTISTS_URL =
  'https://labs.api.listenbrainz.org/similar-artists/json';
const SIMILAR_ARTISTS_ALGORITHM =
  'session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

/**
 * Cover Art Archive thumbnail of the release ListenBrainz picked for a
 * release group
 */
export const getListenBrainzCoverUrl = ({
  caa_id,
  caa_release_mbid,
}: {
  caa_id?: number | null;
  caa_release_mbid?: string | null;
}): string | null =>
  caa_id && caa_release_mbid
    ? `https://archive.org/download/mbid-${caa_release_mbid}/mbid-${caa_release_mbid}-${caa_id}_thumb250.jpg`
    : null;

class ListenBrainzAPI extends ExternalAPI {
  constructor() {
    super(
      'https://api.listenbrainz.org/1',
      {},
      {
        headers: { 'User-Agent': getContactUserAgent() },
        nodeCache: cacheManager.getCache('listenbrainz').data,
        publicCatalog: true,
        rateLimit: {
          maxRequests: 20,
          maxRPS: 25,
        },
      }
    );
  }

  /**
   * Most listened albums across ListenBrainz
   */
  public async getTopAlbums({
    offset = 0,
    range = 'week',
    count = 20,
  }: {
    offset?: number;
    range?: string;
    count?: number;
  } = {}): Promise<LbTopAlbumsResponse> {
    try {
      return await this.get<LbTopAlbumsResponse>(
        '/stats/sitewide/release-groups',
        {
          params: {
            offset: String(offset),
            range,
            count: String(count),
          },
        },
        CACHE_TTL
      );
    } catch (error) {
      throw new Error(
        `[ListenBrainz] Failed to fetch top albums: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Most listened artists across ListenBrainz
   */
  public async getTopArtists({
    offset = 0,
    range = 'week',
    count = 20,
  }: {
    offset?: number;
    range?: string;
    count?: number;
  } = {}): Promise<LbTopArtistsResponse> {
    try {
      return await this.get<LbTopArtistsResponse>(
        '/stats/sitewide/artists',
        {
          params: {
            offset: String(offset),
            range,
            count: String(count),
          },
        },
        CACHE_TTL
      );
    } catch (error) {
      throw new Error(
        `[ListenBrainz] Failed to fetch top artists: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Type, cover and tags of up to 100 release groups. Not cached here, the
   * caller keeps what it needs of the large response.
   */
  public async getReleaseGroupMetadata(
    releaseGroupIds: string[]
  ): Promise<LbReleaseGroupMetadataResponse> {
    if (releaseGroupIds.length === 0) {
      return {};
    }

    try {
      return await this.get<LbReleaseGroupMetadataResponse>(
        '/metadata/release_group/',
        {
          params: {
            release_group_mbids: releaseGroupIds.join(','),
            inc: 'tag',
          },
        },
        0
      );
    } catch (error) {
      throw new Error(
        `[ListenBrainz] Failed to fetch release group metadata: ${getErrorMessage(
          error
        )}`
      );
    }
  }

  /**
   * Artists similar to an artist, most similar first. They come from the
   * similar artists dataset of ListenBrainz Labs, and from the artists LB
   * Radio plays for the artist when Labs fails; those are not ranked, so
   * the most listened come first. Each list is cached for a day.
   */
  public async getSimilarArtists(
    artistMbid: string,
    count = 20
  ): Promise<LbSimilarArtist[]> {
    try {
      const artists = await this.get<LbLabsSimilarArtist[]>(
        SIMILAR_ARTISTS_URL,
        {
          params: {
            artist_mbids: artistMbid,
            algorithm: SIMILAR_ARTISTS_ALGORITHM,
          },
          timeout: SIMILAR_ARTISTS_TIMEOUT,
        },
        SIMILAR_ARTISTS_TTL,
        // Only what is shown is kept of the hundred artists
        {
          transform: (data) =>
            Array.isArray(data) ? data.slice(0, count) : [],
        }
      );

      return artists
        .filter(
          (artist) => artist.artist_mbid && artist.artist_mbid !== artistMbid
        )
        .map((artist) => ({
          mbid: artist.artist_mbid,
          name: artist.name,
          comment: artist.comment || undefined,
          type: artist.type || undefined,
        }));
    } catch (labsError) {
      try {
        const radio = await this.get<LbRadioArtistResponse>(
          `/lb-radio/artist/${artistMbid}`,
          {
            params: {
              mode: 'easy',
              max_similar_artists: String(count),
              max_recordings_per_artist: '1',
              pop_begin: '0',
              pop_end: '100',
            },
          },
          SIMILAR_ARTISTS_TTL
        );

        return Object.entries(radio)
          .filter(([mbid, recordings]) => mbid !== artistMbid && recordings[0])
          .map(([mbid, recordings]) => ({
            mbid,
            name: recordings[0].similar_artist_name,
            listens: recordings[0].total_listen_count ?? 0,
          }))
          .sort((a, b) => b.listens - a.listens)
          .map(({ mbid, name }) => ({ mbid, name }));
      } catch (error) {
        throw new Error(
          `[ListenBrainz] Failed to fetch similar artists: ${getErrorMessage(
            labsError
          )}; ${getErrorMessage(error)}`
        );
      }
    }
  }

  /**
   * Releases out in the past days, newest first
   */
  public async getFreshReleases({
    days = 14,
    sort = 'release_date',
  }: {
    days?: number;
    sort?: string;
  } = {}): Promise<LbFreshReleasesResponse> {
    try {
      return await this.get<LbFreshReleasesResponse>(
        '/explore/fresh-releases/',
        {
          params: {
            days: String(days),
            sort,
            past: 'true',
            future: 'false',
          },
        },
        CACHE_TTL
      );
    } catch (error) {
      throw new Error(
        `[ListenBrainz] Failed to fetch fresh releases: ${getErrorMessage(
          error
        )}`
      );
    }
  }
}

export default ListenBrainzAPI;
