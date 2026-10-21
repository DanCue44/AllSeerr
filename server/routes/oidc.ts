import { USER_ACCESS_APP_NAMES } from '@server/constants/userAccess';
import { accessAppFor, OIDC_SCOPE_CLAIMS } from '@server/lib/oidc/claims';
import {
  canSignInTo,
  getClientApp,
  getOidcProvider,
} from '@server/lib/oidc/provider';
import logger from '@server/logger';
import { Router } from 'express';

const oidcRoutes = Router();

/**
 * Where an app's "Sign in with Allseerr" lands. Without an Allseerr session
 * the person signs in first and comes back here. With one, Allseerr checks
 * that they may use the app and sends them back to it, signed in.
 */
oidcRoutes.get<{ uid: string }>('/interaction/:uid', async (req, res, next) => {
  const provider = await getOidcProvider();

  if (!provider) {
    return next({ status: 404, message: 'Sign in with Allseerr is off.' });
  }

  try {
    const details = await provider.interactionDetails(req, res);

    if (details.uid !== req.params.uid) {
      return next({ status: 400, message: 'This sign in has expired.' });
    }

    if (!req.user) {
      return res.redirect(
        `/login?next=${encodeURIComponent(`/signin/${details.uid}`)}`
      );
    }

    const clientId = String(details.params.client_id ?? '');
    const app = getClientApp(clientId);

    if (!app) {
      return provider.interactionFinished(req, res, {
        error: 'unauthorized_client',
        error_description: 'This app is not set up to sign in with Allseerr.',
      });
    }

    if (!(await canSignInTo(req.user, app))) {
      logger.info('Refused a sign in with Allseerr', {
        label: 'OIDC',
        userId: req.user.id,
        app,
      });

      return provider.interactionFinished(req, res, {
        error: 'access_denied',
        error_description: `${req.user.displayName} does not have access to ${
          app === 'nobookends'
            ? 'NoBookEnds'
            : USER_ACCESS_APP_NAMES[accessAppFor(app)]
        }. Ask the admin for access.`,
      });
    }

    // A person who signs in to Allseerr already said who they are, and the
    // apps are the admin's own, so there is no consent screen
    const accountId = String(req.user.id);
    let grant = details.grantId
      ? await provider.Grant.find(details.grantId)
      : undefined;

    if (!grant || grant.accountId !== accountId) {
      grant = new provider.Grant({ accountId, clientId });
    }

    const requested = String(details.params.scope ?? 'openid').split(' ');
    const allowed = requested.filter(
      (scope) => scope === 'offline_access' || scope in OIDC_SCOPE_CLAIMS
    );
    grant.addOIDCScope(allowed.join(' '));

    const claims = details.prompt.details.missingOIDCClaims;
    if (Array.isArray(claims) && claims.length) {
      grant.addOIDCClaims(claims as string[]);
    }

    const grantId = await grant.save();

    return provider.interactionFinished(
      req,
      res,
      {
        login: { accountId },
        consent: { grantId },
      },
      { mergeWithLastSubmission: false }
    );
  } catch (e) {
    logger.warn('Failed to finish a sign in with Allseerr', {
      label: 'OIDC',
      message: (e as Error).message,
    });

    return next({
      status: 400,
      message: 'This sign in has expired. Start it again from the app.',
    });
  }
});

export default oidcRoutes;
