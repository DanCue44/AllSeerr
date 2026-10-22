import ExternalAPI from '@server/api/externalapi';
import { getRepository } from '@server/datasource';
import MetadataArtist from '@server/entity/MetadataArtist';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import { In } from 'typeorm';
import type { TadbArtistResponse } from './interfaces';

// The shared free key allows 30 requests a minute. A Premium key from a
// TheAudioDB supporter profile can be set in THEAUDIODB_API_KEY.
const FREE_API_KEY = '123';
const API_KEY = process.env.THEAUDIODB_API_KEY || FREE_API_KEY;
const IS_FREE_KEY = API_KEY === FREE_API_KEY;
const CACHE_TTL = 43200;
// Artists without images are asked again after this long
const STALE_THRESHOLD = 30 * 24 * 60 * 60 * 1000;

export interface ArtistImages {
  artistThumb: string | null;
  artistBackground: string | null;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

class TheAudioDb extends ExternalAPI {
  constructor() {
    super(
      'https://www.theaudiodb.com/api/v1/json',
      {},
      {
        nodeCache: cacheManager.getCache('tadb').data,
        publicCatalog: true,
        // Kept under the per minute limit of each tier
        rateLimit: {
          maxRequests: IS_FREE_KEY ? 25 : 90,
          perMilliseconds: 60 * 1000,
        },
      }
    );
  }

  private isMetadataStale(metadata: MetadataArtist | null): boolean {
    if (!metadata?.tadbUpdatedAt) {
      return true;
    }

    return (
      Date.now() - new Date(metadata.tadbUpdatedAt).getTime() > STALE_THRESHOLD
    );
  }

  private createEmptyResponse(): ArtistImages {
    return { artistThumb: null, artistBackground: null };
  }

  /**
   * Returns the thumbnail and fanart of an artist, from metadata_artist when
   * they were looked up before
   */
  public async getArtistImages(id: string): Promise<ArtistImages> {
    try {
      const metadata = await getRepository(MetadataArtist).findOne({
        where: { mbArtistId: id },
        select: ['mbArtistId', 'tadbThumb', 'tadbCover', 'tadbUpdatedAt'],
      });

      if (metadata?.tadbThumb || metadata?.tadbCover) {
        return {
          artistThumb: metadata.tadbThumb,
          artistBackground: metadata.tadbCover,
        };
      }

      if (metadata && !this.isMetadataStale(metadata)) {
        return this.createEmptyResponse();
      }

      return await this.fetchArtistImages(id);
    } catch (e) {
      logger.error('Failed to get artist images', {
        label: 'TheAudioDb',
        id,
        errorMessage: getErrorMessage(e),
      });
      return this.createEmptyResponse();
    }
  }

  private async fetchArtistImages(id: string): Promise<ArtistImages> {
    let result = this.createEmptyResponse();

    try {
      const data = await this.get<TadbArtistResponse>(
        `/${API_KEY}/artist-mb.php`,
        { params: { i: id } },
        CACHE_TTL
      );

      result = {
        artistThumb: data.artists?.[0]?.strArtistThumb || null,
        artistBackground: data.artists?.[0]?.strArtistFanart || null,
      };
    } catch (e) {
      logger.debug('Failed to fetch artist images', {
        label: 'TheAudioDb',
        id,
        errorMessage: getErrorMessage(e),
      });
    }

    await getRepository(MetadataArtist)
      .upsert(
        {
          mbArtistId: id,
          tadbThumb: result.artistThumb,
          tadbCover: result.artistBackground,
          tadbUpdatedAt: new Date(),
        },
        { conflictPaths: ['mbArtistId'] }
      )
      .catch((e) => {
        logger.error('Failed to save artist metadata', {
          label: 'TheAudioDb',
          errorMessage: getErrorMessage(e),
        });
      });

    return result;
  }

  /**
   * Returns the biography of an artist in the given language, falling back to
   * English. Shares the cached artist lookup with the images.
   */
  public async getArtistBiography(
    id: string,
    language = 'en'
  ): Promise<string | null> {
    try {
      const data = await this.get<TadbArtistResponse>(
        `/${API_KEY}/artist-mb.php`,
        { params: { i: id } },
        CACHE_TTL
      );
      const artist = data.artists?.[0];
      const code = language.slice(0, 2).toUpperCase();
      const biography =
        (code !== 'EN' ? artist?.[`strBiography${code}`] : null) ||
        artist?.strBiography;

      return biography?.trim() || null;
    } catch (e) {
      logger.debug('Failed to fetch artist biography', {
        label: 'TheAudioDb',
        id,
        errorMessage: getErrorMessage(e),
      });
      return null;
    }
  }

  /**
   * Returns images for several artists, keyed by MusicBrainz artist id
   */
  public async batchGetArtistImages(
    ids: string[]
  ): Promise<Record<string, ArtistImages>> {
    const uniqueIds = [...new Set(ids)];

    if (!uniqueIds.length) {
      return {};
    }

    const results: Record<string, ArtistImages> = {};
    const idsToFetch: string[] = [];

    const existingMetadata = await getRepository(MetadataArtist).find({
      where: { mbArtistId: In(uniqueIds) },
      select: ['mbArtistId', 'tadbThumb', 'tadbCover', 'tadbUpdatedAt'],
    });

    const metadataMap = new Map(
      existingMetadata.map((metadata) => [metadata.mbArtistId, metadata])
    );

    for (const id of uniqueIds) {
      const metadata = metadataMap.get(id) ?? null;

      if (metadata?.tadbThumb || metadata?.tadbCover) {
        results[id] = {
          artistThumb: metadata.tadbThumb,
          artistBackground: metadata.tadbCover,
        };
      } else if (metadata && !this.isMetadataStale(metadata)) {
        results[id] = this.createEmptyResponse();
      } else {
        idsToFetch.push(id);
      }
    }

    await Promise.allSettled(
      idsToFetch.map(async (id) => {
        results[id] = await this.fetchArtistImages(id);
      })
    );

    return results;
  }
}

export default TheAudioDb;
