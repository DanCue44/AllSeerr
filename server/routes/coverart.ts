import CoverArtArchive from '@server/api/coverartarchive';
import logger from '@server/logger';
import { Router } from 'express';

const coverArtRoutes = Router();

// Bounds the Cover Art Archive lookups a single request can start
const MAX_BATCH_SIZE = 50;

/**
 * Album covers for a comma separated list of release group ids, so lists can
 * show their albums before every cover is known
 */
coverArtRoutes.get<{ ids: string }>('/batch/:ids', async (req, res) => {
  const coverArtArchive = new CoverArtArchive();
  const ids = req.params.ids
    .split(',')
    .filter(Boolean)
    .slice(0, MAX_BATCH_SIZE);

  if (!ids.length) {
    return res.status(200).json({});
  }

  try {
    const covers = await coverArtArchive.batchGetCoverArt(ids);

    return res.status(200).json(covers);
  } catch (e) {
    logger.error('Something went wrong retrieving album covers', {
      label: 'API',
      errorMessage: e.message,
      count: ids.length,
    });
    return res.status(200).json({});
  }
});

export default coverArtRoutes;
