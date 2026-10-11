import ExternalAPI from '@server/api/externalapi';
import { getRepository } from '@server/datasource';
import MetadataAlbum from '@server/entity/MetadataAlbum';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import { getContactUserAgent } from '@server/utils/userAgent';
import { In } from 'typeorm';
import type { CoverArtResponse } from './interfaces';

const CACHE_TTL = 43200;
// Albums without artwork are asked again after this long
const STALE_THRESHOLD = 30 * 24 * 60 * 60 * 1000;

const UUID_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

/**
 * Larger variant of a stored 250px cover, used on the album page
 */
export const getLargeCoverUrl = (url: string): string =>
  url.replace(/_thumb250\.jpg$/, '_thumb500.jpg');

class CoverArtArchive extends ExternalAPI {
  constructor() {
    super(
      'https://coverartarchive.org',
      {},
      {
        headers: { 'User-Agent': getContactUserAgent() },
        nodeCache: cacheManager.getCache('coverartarchive').data,
        rateLimit: {
          maxRequests: 20,
          maxRPS: 50,
        },
      }
    );
  }

  private isMetadataStale(metadata: MetadataAlbum | null): boolean {
    if (!metadata) {
      return true;
    }

    return Date.now() - metadata.updatedAt.getTime() > STALE_THRESHOLD;
  }

  private createEmptyResponse(id: string): CoverArtResponse {
    return { images: [], release: `/release/${id}` };
  }

  private createCachedResponse(url: string, id: string): CoverArtResponse {
    return {
      images: [
        {
          approved: true,
          front: true,
          id: 0,
          thumbnails: { 250: url },
        },
      ],
      release: `/release/${id}`,
    };
  }

  /**
   * Returns the front cover of a release group, from metadata_album when it
   * was looked up before
   */
  public async getCoverArt(id: string): Promise<CoverArtResponse> {
    try {
      const metadata = await getRepository(MetadataAlbum).findOne({
        where: { mbAlbumId: id },
        select: ['caaUrl', 'updatedAt'],
      });

      if (metadata?.caaUrl) {
        return this.createCachedResponse(metadata.caaUrl, id);
      }

      if (metadata && !this.isMetadataStale(metadata)) {
        return this.createEmptyResponse(id);
      }

      return await this.fetchCoverArt(id);
    } catch (e) {
      logger.error('Failed to get cover art', {
        label: 'CoverArtArchive',
        id,
        errorMessage: getErrorMessage(e),
      });
      return this.createEmptyResponse(id);
    }
  }

  /**
   * Returns the front cover url of a release group, or null without one
   */
  public async getFrontCoverUrl(id: string): Promise<string | null> {
    const response = await this.getCoverArt(id);

    return (
      response.images.find((image) => image.front)?.thumbnails[250] ?? null
    );
  }

  private async fetchCoverArt(id: string): Promise<CoverArtResponse> {
    try {
      const data = await this.get<CoverArtResponse>(
        `/release-group/${id}`,
        undefined,
        CACHE_TTL
      );

      const releaseMbId = data.release.split('/').pop();

      // Link to the archive.org thumbnail directly, coverartarchive.org only
      // redirects there
      const images = data.images.map((image) => ({
        approved: image.approved,
        front: image.front,
        id: image.id,
        thumbnails: {
          250: `https://archive.org/download/mbid-${releaseMbId}/mbid-${releaseMbId}-${image.id}_thumb250.jpg`,
        },
      }));

      const front = images.find((image) => image.front);

      await getRepository(MetadataAlbum)
        .upsert(
          { mbAlbumId: id, caaUrl: front?.thumbnails[250] ?? null },
          { conflictPaths: ['mbAlbumId'] }
        )
        .catch((e) => {
          logger.error('Failed to save album metadata', {
            label: 'CoverArtArchive',
            errorMessage: getErrorMessage(e),
          });
        });

      return { ...data, images };
    } catch {
      // Remember albums without artwork so they are not asked again until stale
      await getRepository(MetadataAlbum)
        .upsert(
          { mbAlbumId: id, caaUrl: null },
          { conflictPaths: ['mbAlbumId'] }
        )
        .catch(() => undefined);

      return this.createEmptyResponse(id);
    }
  }

  /**
   * Returns cover urls for several release groups, keyed by release group id
   */
  public async batchGetCoverArt(
    ids: string[]
  ): Promise<Record<string, string | null>> {
    const validIds = [...new Set(ids.filter((id) => UUID_REGEX.test(id)))];

    if (!validIds.length) {
      return {};
    }

    const results: Record<string, string | null> = {};
    const idsToFetch: string[] = [];

    const existingMetadata = await getRepository(MetadataAlbum).find({
      where: { mbAlbumId: In(validIds) },
      select: ['mbAlbumId', 'caaUrl', 'updatedAt'],
    });

    const metadataMap = new Map(
      existingMetadata.map((metadata) => [metadata.mbAlbumId, metadata])
    );

    for (const id of validIds) {
      const metadata = metadataMap.get(id) ?? null;

      if (metadata?.caaUrl) {
        results[id] = metadata.caaUrl;
      } else if (metadata && !this.isMetadataStale(metadata)) {
        results[id] = null;
      } else {
        idsToFetch.push(id);
      }
    }

    await Promise.allSettled(
      idsToFetch.map(async (id) => {
        const response = await this.fetchCoverArt(id);
        results[id] =
          response.images.find((image) => image.front)?.thumbnails[250] ?? null;
      })
    );

    return results;
  }
}

export default CoverArtArchive;
