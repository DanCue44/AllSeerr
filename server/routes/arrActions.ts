import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  ArrActionResponse,
  ArrGrabBody,
  ArrItemResponse,
  ArrReleasesResponse,
  ArrReplaceBody,
  ArrReplaceResponse,
  ArrSearchBody,
} from '@server/interfaces/api/arrActionInterfaces';
import {
  ArrActionError,
  getArrItemInfo,
  grabRelease,
  listReleases,
  parseArrTarget,
  replaceFile,
  searchAgain,
} from '@server/lib/arrActions';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import type { NextFunction, Request } from 'express';
import { Router } from 'express';

/**
 * Searches, manual grabs and file replacements in the arr that holds a
 * media item, mounted at /media/:mediaId/arr
 */
const arrActionRoutes = Router({ mergeParams: true });

arrActionRoutes.use(isAuthenticated(Permission.MANAGE_REQUESTS));

const loadMedia = async (req: Request<{ mediaId?: string }>) => {
  const media = await getRepository(Media).findOne({
    where: { id: Number(req.params.mediaId) },
  });

  if (!media) {
    throw new ArrActionError(404, 'Media does not exist.');
  }

  return media;
};

const requireUser = (req: Request<{ mediaId?: string }>) => {
  if (!req.user) {
    throw new ArrActionError(500, 'User missing from request.');
  }
  return req.user;
};

const toIssueFollowUp = (body: {
  issueId?: unknown;
  resolveIssue?: unknown;
}) => ({
  issueId: Number(body.issueId) > 0 ? Number(body.issueId) : undefined,
  resolveIssue: body.resolveIssue === true,
});

const handleError = (
  e: Error,
  req: Request<{ mediaId?: string }>,
  next: NextFunction,
  action: string
) => {
  if (e instanceof ArrActionError) {
    return next({ status: e.status, message: e.message });
  }

  logger.error(`Something went wrong ${action}`, {
    label: 'Arr Actions',
    mediaId: req.params.mediaId,
    errorMessage: e.message,
  });
  // The arr's own message says what went wrong, such as an expired release
  return next({ status: 502, message: e.message });
};

arrActionRoutes.get<{ mediaId: string }, ArrItemResponse>(
  '/',
  async (req, res, next) => {
    try {
      const media = await loadMedia(req);
      const target = parseArrTarget(media, req.query);

      return res.status(200).json(await getArrItemInfo(media, target));
    } catch (e) {
      return handleError(e, req, next, 'looking up the item in the arr');
    }
  }
);

arrActionRoutes.post<{ mediaId: string }, ArrActionResponse, ArrSearchBody>(
  '/search',
  async (req, res, next) => {
    try {
      const media = await loadMedia(req);
      const target = parseArrTarget(media, req.body);

      return res
        .status(200)
        .json(
          await searchAgain(
            media,
            target,
            requireUser(req),
            toIssueFollowUp(req.body)
          )
        );
    } catch (e) {
      return handleError(e, req, next, 'starting a search in the arr');
    }
  }
);

arrActionRoutes.get<{ mediaId: string }, ArrReleasesResponse>(
  '/releases',
  async (req, res, next) => {
    try {
      const media = await loadMedia(req);
      const target = parseArrTarget(media, req.query);

      return res
        .status(200)
        .json({ results: await listReleases(media, target) });
    } catch (e) {
      return handleError(e, req, next, 'searching the arr for releases');
    }
  }
);

arrActionRoutes.post<{ mediaId: string }, ArrActionResponse, ArrGrabBody>(
  '/grab',
  async (req, res, next) => {
    try {
      const media = await loadMedia(req);
      const target = parseArrTarget(media, req.body);
      const { guid, indexerId, title, replaced } = req.body;

      if (!guid || !Number.isInteger(Number(indexerId))) {
        throw new ArrActionError(
          400,
          'A release guid and indexerId are needed.'
        );
      }

      return res.status(200).json(
        await grabRelease(
          media,
          target,
          requireUser(req),
          {
            guid,
            indexerId: Number(indexerId),
            title: typeof title === 'string' ? title.slice(0, 500) : undefined,
            replaced: replaced === true,
          },
          toIssueFollowUp(req.body)
        )
      );
    } catch (e) {
      return handleError(e, req, next, 'grabbing a release in the arr');
    }
  }
);

arrActionRoutes.post<{ mediaId: string }, ArrReplaceResponse, ArrReplaceBody>(
  '/replace',
  async (req, res, next) => {
    try {
      const media = await loadMedia(req);
      const target = parseArrTarget(media, req.body);

      return res.status(200).json(
        await replaceFile(media, target, requireUser(req), {
          blocklist: req.body.blocklist !== false,
          search:
            req.body.search === 'interactive' ? 'interactive' : 'automatic',
          ...toIssueFollowUp(req.body),
        })
      );
    } catch (e) {
      return handleError(e, req, next, 'replacing the file in the arr');
    }
  }
);

export default arrActionRoutes;
