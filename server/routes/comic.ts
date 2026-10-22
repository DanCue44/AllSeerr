import type { TalearrComicSeriesSummary } from '@server/api/servarr/talearrComics';
import { MediaStatus, MediaType, isComicKind } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MetadataComic from '@server/entity/MetadataComic';
import {
  applyLibraryStatus,
  findLibrarySeries,
  getComicsApi,
  getComicsServer,
  getComicsStatus,
  isComicId,
  mapComicResult,
  searchComics,
} from '@server/lib/comics';
import logger from '@server/logger';
import type { ComicLibraryInfo } from '@server/models/Comic';
import { mapComicDetails } from '@server/models/Comic';
import { Router } from 'express';
import { In } from 'typeorm';

const comicRoutes = Router();

/**
 * Talearr's library, or undefined when it cannot be read. A missing library
 * only leaves the volume counts off a page.
 */
const readLibrary = async (): Promise<
  TalearrComicSeriesSummary[] | undefined
> => {
  const server = getComicsServer();

  if (!server) {
    return undefined;
  }

  try {
    return await getComicsApi(server).getSeries();
  } catch (e) {
    logger.debug('Could not read the Talearr comics library', {
      label: 'Comics',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }
};

comicRoutes.get('/status', async (_req, res) => {
  return res.status(200).json(await getComicsStatus());
});

comicRoutes.get('/search', async (req, res, next) => {
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const kind = isComicKind(req.query.kind) ? req.query.kind : undefined;

  if (!query.trim()) {
    return res.status(200).json({ results: [], notices: [] });
  }

  try {
    const status = await getComicsStatus();

    if (!status.enabled) {
      return next({ status: 404, message: 'Comics are not turned on.' });
    }

    const { results, notices } = await searchComics({ query, kind });
    const media = await Media.getRelatedComics(
      results.map((result) => result.comicId)
    );
    const mediaById = new Map(media.map((m) => [m.comicId, m]));

    return res.status(200).json({
      results: results.map((result) =>
        mapComicResult(result, mediaById.get(result.comicId))
      ),
      notices,
    });
  } catch (e) {
    logger.debug('Something went wrong searching for comics', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
      query,
    });
    return next({ status: 500, message: 'Unable to search for comics.' });
  }
});

/**
 * The series in Talearr's comics library that Allseerr has facts for
 */
comicRoutes.get('/library', async (req, res, next) => {
  try {
    const status = await getComicsStatus();

    if (!status.enabled) {
      return next({ status: 404, message: 'Comics are not turned on.' });
    }

    const media = await getRepository(Media).find({
      where: { mediaType: MediaType.COMIC },
      order: { updatedAt: 'DESC' },
    });
    const comicIds = media
      .map((m) => m.comicId)
      .filter((id): id is string => !!id);
    const metadata = comicIds.length
      ? await getRepository(MetadataComic).find({
          where: { comicId: In(comicIds) },
        })
      : [];
    const metadataById = new Map(metadata.map((row) => [row.comicId, row]));

    return res.status(200).json({
      results: media.flatMap((m) => {
        const row = m.comicId ? metadataById.get(m.comicId) : undefined;

        return row && m.status !== MediaStatus.UNKNOWN
          ? [mapComicResult(row, m.filter(req.user))]
          : [];
      }),
    });
  } catch (e) {
    logger.debug('Something went wrong listing comics', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return next({ status: 500, message: 'Unable to list comics.' });
  }
});

comicRoutes.get<{ comicId: string }>('/:comicId', async (req, res, next) => {
  const { comicId } = req.params;

  if (!isComicId(comicId)) {
    return next({ status: 404, message: 'Comic not found.' });
  }

  try {
    const metadata = await getRepository(MetadataComic).findOne({
      where: { comicId },
    });

    if (!metadata) {
      return next({ status: 404, message: 'Comic not found.' });
    }

    let media = await Media.getMedia(comicId, MediaType.COMIC);
    const summary = findLibrarySeries((await readLibrary()) ?? [], comicId);
    const library: ComicLibraryInfo | undefined = summary
      ? {
          seriesId: summary.series.id,
          volumeCount: summary.volumeCount,
          downloadedCount: summary.downloadedCount,
          missingCount: summary.missingCount,
          downloadingCount: summary.downloadingCount,
        }
      : undefined;

    if (media && summary && (await applyLibraryStatus(media, summary))) {
      media = await Media.getMedia(comicId, MediaType.COMIC);
    }

    return res.status(200).json(
      mapComicDetails(metadata, {
        media: media?.filter(req.user),
        library,
      })
    );
  } catch (e) {
    logger.debug('Something went wrong retrieving comic', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
      comicId,
    });
    return next({ status: 500, message: 'Unable to retrieve comic.' });
  }
});

export default comicRoutes;
