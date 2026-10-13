import { getNoBookEndsStatus } from '@server/lib/nobookends';
import { Router } from 'express';

const nobookendsRoutes = Router();

/**
 * What the NoBookEnds app may offer the signed in user. The app calls it
 * with the key from its connect link to check the key and the features.
 */
nobookendsRoutes.get('/status', (req, res, next) => {
  if (!req.user) {
    return next({ status: 403, message: 'Not signed in.' });
  }

  return res.status(200).json(getNoBookEndsStatus(req.user));
});

export default nobookendsRoutes;
