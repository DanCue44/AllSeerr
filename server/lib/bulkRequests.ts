import MusicBrainz, { UUID_REGEX } from '@server/api/musicbrainz';
import OpenLibrary, { AUTHOR_ID_REGEX, getOlId } from '@server/api/openlibrary';
import LidarrAPI from '@server/api/servarr/lidarr';
import TheAudioDb from '@server/api/theaudiodb';
import {
  getBookLanguageName,
  isBookLanguage,
} from '@server/constants/bookLanguages';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  BlocklistedMediaError,
  DuplicateMediaRequestError,
  MediaRequest,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import type {
  AuthorCatalogRequestBody,
  BulkRequestItem,
  BulkRequestResponse,
  DiscographyRequestBody,
  MediaRequestBody,
} from '@server/interfaces/api/requestInterfaces';
import { getBookFormatName } from '@server/lib/bookNotifications';
import {
  MAX_BULK_REQUEST_ITEMS,
  getBulkSkipReason,
} from '@server/lib/catalogFilters';
import {
  AUTHOR_CATALOG_WORK_PAGES,
  DISCOGRAPHY_RELEASE_GROUP_PAGES,
  getArtistReleaseGroups,
  getAuthorWorks,
} from '@server/lib/catalogs';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapAuthorDetails } from '@server/models/Book';
import { runInBackground } from '@server/utils/backgroundTasks';
import serviceQueue, { lidarrKey } from '@server/utils/serviceQueue';
import { truncate } from 'lodash';

/**
 * A bulk request that cannot be made at all, with the HTTP status to answer
 * with. Requests that fail one at a time are reported in the response.
 */
export class BulkRequestError extends Error {
  public status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type BulkItem = Pick<BulkRequestItem, 'mediaId' | 'title' | 'isAudiobook'>;

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * The user the requests are made for, checked the way a single request
 * checks it
 */
const getRequestUser = async (user: User, userId?: number): Promise<User> => {
  if (!userId) {
    return user;
  }

  if (
    !user.hasPermission([Permission.MANAGE_USERS, Permission.MANAGE_REQUESTS])
  ) {
    throw new RequestPermissionError(
      'You do not have permission to modify the request user.'
    );
  }

  const requestUser = await getRepository(User).findOne({
    where: { id: userId },
  });

  if (!requestUser) {
    throw new BulkRequestError('User not found.', 404);
  }

  return requestUser;
};

/**
 * Refuses a bulk request that needs more requests than the quota has left,
 * rather than making only the first few. Managers can bypass the quota the
 * way they can for a single request.
 */
const checkBulkQuota = async (
  user: User,
  requestUser: User,
  type: MediaType.MUSIC | MediaType.BOOK,
  count: number,
  ignoreQuota?: boolean
): Promise<void> => {
  if (ignoreQuota && !user.hasPermission(Permission.MANAGE_REQUESTS)) {
    throw new RequestPermissionError(
      'You do not have permission to bypass user quota limits.'
    );
  }

  if (ignoreQuota || count === 0) {
    return;
  }

  const quotas = await requestUser.getQuota();
  const quota = type === MediaType.MUSIC ? quotas.music : quotas.book;

  if (quota.limit && count > (quota.remaining ?? 0)) {
    throw new QuotaRestrictedError(
      `${type === MediaType.MUSIC ? 'Music' : 'Book'} Quota exceeded: this request needs ${count} requests and ${quota.remaining ?? 0} remain.`
    );
  }
};

/**
 * Makes the requests one at a time through the same path as a single
 * request, so approval, quotas and sending to Lidarr or LazyLibrarian work
 * the same. A request that cannot be made is reported and the rest go on.
 */
const createRequests = async (
  items: BulkItem[],
  user: User,
  getBody: (item: BulkItem) => MediaRequestBody,
  result: BulkRequestResponse
): Promise<MediaRequest[]> => {
  const requests: MediaRequest[] = [];

  for (const [index, item] of items.entries()) {
    try {
      const request = await MediaRequest.request(getBody(item), user, {
        skipNotification: true,
        skipMetadataLookup: true,
      });

      requests.push(request);
      result.created.push({
        ...item,
        requestId: request.id,
        status: request.status,
      });
    } catch (e) {
      if (e instanceof DuplicateMediaRequestError) {
        result.skipped.push({ ...item, reason: 'requested' });
      } else if (e instanceof BlocklistedMediaError) {
        result.skipped.push({ ...item, reason: 'blocklisted' });
      } else if (e instanceof QuotaRestrictedError) {
        // Requests made elsewhere in the meantime used up the quota, so
        // the rest would be refused too
        result.failed.push(
          ...items
            .slice(index)
            .map((rest) => ({ ...rest, reason: getErrorMessage(e) }))
        );
        break;
      } else {
        logger.warn('Request of a bulk request failed', {
          label: 'Media Request',
          mediaId: item.mediaId,
          isAudiobook: item.isAudiobook,
          errorMessage: getErrorMessage(e),
        });
        result.failed.push({ ...item, reason: getErrorMessage(e) });
      }
    }
  }

  return requests;
};

const NOTIFICATION_MESSAGE_LENGTH = 500;

interface SummaryNotificationOptions {
  // Album, Ebook or Audiobook, for the event name
  mediaType: (requests: MediaRequest[]) => string;
  // Such as "14 albums by Michael Jackson", from the number of titles
  subject: (count: number) => string;
  titles: Map<number, string>;
  image?: string | null;
  actionPath: string;
  extra?: (requests: MediaRequest[]) => { name: string; value: string }[];
  // The book format the requests cover, which can be both
  bookFormat?: (requests: MediaRequest[]) => 'ebook' | 'audiobook' | 'both';
}

/**
 * Sends one notification for the requests of a bulk request in place of
 * one per request: one for those pending approval and one for those
 * approved automatically. Failures are still notified one at a time.
 */
export const sendBulkRequestNotifications = (
  requests: MediaRequest[],
  options: SummaryNotificationOptions
): void => {
  const groups: [Notification, MediaRequest[]][] = [
    [
      Notification.MEDIA_PENDING,
      requests.filter(
        (request) => request.status === MediaRequestStatus.PENDING
      ),
    ],
    [
      Notification.MEDIA_AUTO_APPROVED,
      requests.filter(
        (request) => request.status !== MediaRequestStatus.PENDING
      ),
    ],
  ];

  for (const [type, group] of groups) {
    if (group.length === 0) {
      continue;
    }

    const first = group[0];
    const titles = [
      ...new Set(group.map((request) => options.titles.get(request.id) ?? '')),
    ].filter(Boolean);
    const subject = options.subject(
      new Set(group.map((request) => request.media.id)).size
    );
    const mediaType = options.mediaType(group);

    notificationManager.sendNotification(type, {
      event:
        type === Notification.MEDIA_PENDING
          ? `New ${mediaType} Requests`
          : `${mediaType} Requests Automatically Approved`,
      subject,
      message: truncate(
        `${first.requestedBy.displayName} requested ${subject}: ${titles.join(', ')}`,
        { length: NOTIFICATION_MESSAGE_LENGTH, separator: /,? /, omission: '…' }
      ),
      image: options.image ?? undefined,
      media: first.media,
      request: first,
      notifyAdmin: true,
      notifySystem: true,
      actionPath: options.actionPath,
      extra: options.extra?.(group),
      bookFormat: options.bookFormat?.(group),
      bulk: true,
    });
  }
};

const MONITOR_ATTEMPTS = 5;

/** How long to wait before asking Lidarr about the artist again. */
export const monitorRetryDelay = { ms: 30 * 1000 };

/**
 * Has Lidarr monitor the new releases of the artist once the albums of the
 * request are added. Returns false when there is no Lidarr server to ask.
 */
const queueMonitorNewReleases = (
  artistId: string,
  serverId?: number
): boolean => {
  const settings = getSettings();
  const lidarrSettings =
    (serverId !== undefined && serverId !== null
      ? settings.lidarr.find((lidarr) => lidarr.id === serverId)
      : undefined) ?? settings.lidarr.find((lidarr) => lidarr.isDefault);

  if (!lidarrSettings) {
    return false;
  }

  const lidarr = new LidarrAPI({
    apiKey: lidarrSettings.apiKey,
    url: LidarrAPI.buildUrl(lidarrSettings, '/api/v1'),
  });

  // Queued behind the album adds of the request, which add the artist. An
  // add can still reach the queue after this, so when the artist is not in
  // Lidarr yet it is asked again a little later.
  const attempt = (tries: number): void => {
    const monitoring = serviceQueue
      .dispatch(lidarrKey(lidarrSettings.id), () =>
        lidarr.monitorNewArtistReleases(artistId)
      )
      .then((monitored) => {
        if (monitored) {
          return;
        }

        if (tries < MONITOR_ATTEMPTS) {
          setTimeout(() => attempt(tries + 1), monitorRetryDelay.ms).unref();
          return;
        }

        logger.warn(
          'Artist is not in Lidarr yet, new releases are not monitored',
          { label: 'Media Request', artistId }
        );
      })
      .catch((e) => {
        logger.error('Failed to monitor new releases of artist in Lidarr', {
          label: 'Media Request',
          artistId,
          errorMessage: getErrorMessage(e),
        });
      });
    runInBackground(monitoring);
  };

  attempt(1);

  return true;
};

const emptyResult = (): BulkRequestResponse => ({
  created: [],
  skipped: [],
  failed: [],
});

/**
 * Requests albums of an artist's discography, one music request per album
 */
export const requestDiscography = async (
  user: User,
  body: DiscographyRequestBody
): Promise<BulkRequestResponse> => {
  if (!UUID_REGEX.test(body.artistId)) {
    throw new BulkRequestError('Artist not found.', 404);
  }

  const mbIds = [...new Set(body.mbIds ?? [])];

  if (mbIds.length > MAX_BULK_REQUEST_ITEMS) {
    throw new BulkRequestError(
      `A request can include at most ${MAX_BULK_REQUEST_ITEMS} albums.`
    );
  }

  if (mbIds.length === 0 && !body.monitorNewReleases) {
    throw new BulkRequestError('No albums were selected.');
  }

  const requestUser = await getRequestUser(user, body.userId);

  if (
    !requestUser.hasPermission([Permission.REQUEST, Permission.REQUEST_MUSIC], {
      type: 'or',
    })
  ) {
    throw new RequestPermissionError(
      'You do not have permission to make music requests.'
    );
  }

  if (
    body.monitorNewReleases &&
    !user.hasPermission(Permission.MANAGE_REQUESTS)
  ) {
    throw new RequestPermissionError(
      'You do not have permission to monitor new releases.'
    );
  }

  const musicbrainz = new MusicBrainz();
  const artist = await musicbrainz
    .getArtist({ artistId: body.artistId })
    .catch(() => {
      throw new BulkRequestError('Artist not found.', 404);
    });
  const { releaseGroups } = await getArtistReleaseGroups(
    musicbrainz,
    artist.id,
    DISCOGRAPHY_RELEASE_GROUP_PAGES
  );
  const releaseGroupMap = new Map(
    releaseGroups.map((releaseGroup) => [releaseGroup.id, releaseGroup])
  );
  const mediaMap = new Map(
    (await Media.getRelatedMusic(mbIds)).map((media) => [media.mbId, media])
  );

  const result = emptyResult();
  const items: BulkItem[] = [];

  for (const mbId of mbIds) {
    const releaseGroup = releaseGroupMap.get(mbId);

    if (!releaseGroup) {
      result.failed.push({
        mediaId: mbId,
        title: mbId,
        reason: 'Not in the discography of this artist.',
      });
      continue;
    }

    const item = { mediaId: mbId, title: releaseGroup.title };
    const reason = getBulkSkipReason(mediaMap.get(mbId)?.status);

    if (reason) {
      result.skipped.push({ ...item, reason });
    } else {
      items.push(item);
    }
  }

  await checkBulkQuota(
    user,
    requestUser,
    MediaType.MUSIC,
    items.length,
    body.ignoreQuota
  );

  const requests = await createRequests(
    items,
    user,
    (item) => ({
      mediaType: MediaType.MUSIC,
      mediaId: item.mediaId,
      serverId: body.serverId,
      profileId: body.profileId,
      rootFolder: body.rootFolder,
      tags: body.tags,
      userId: body.userId,
      ignoreQuota: body.ignoreQuota,
    }),
    result
  );

  if (body.monitorNewReleases) {
    result.monitorNewReleases = queueMonitorNewReleases(
      artist.id,
      body.serverId
    );
  }

  if (requests.length > 0) {
    const images = await new TheAudioDb()
      .getArtistImages(artist.id)
      .catch(() => null);

    sendBulkRequestNotifications(requests, {
      mediaType: () => 'Album',
      subject: (count) =>
        `${count} ${count === 1 ? 'album' : 'albums'} by ${artist.name}`,
      titles: new Map(
        result.created.map((item) => [item.requestId ?? 0, item.title])
      ),
      image: images?.artistThumb,
      actionPath: `/artist/${artist.id}`,
    });
  }

  logger.info('Requested discography of artist', {
    label: 'Media Request',
    artistId: artist.id,
    userId: requestUser.id,
    created: result.created.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
  });

  return result;
};

/**
 * Requests works of an author, one book request per work and format
 */
export const requestAuthorCatalog = async (
  user: User,
  body: AuthorCatalogRequestBody
): Promise<BulkRequestResponse> => {
  if (!AUTHOR_ID_REGEX.test(body.authorId)) {
    throw new BulkRequestError('Author not found.', 404);
  }

  const formats =
    body.format === 'both'
      ? [false, true]
      : body.format === 'audiobook'
        ? [true]
        : body.format === 'ebook'
          ? [false]
          : undefined;

  if (!formats) {
    throw new BulkRequestError('Unknown book format.');
  }

  const olIds = [...new Set(body.olIds ?? [])];

  if (olIds.length * formats.length > MAX_BULK_REQUEST_ITEMS) {
    throw new BulkRequestError(
      `A request can include at most ${MAX_BULK_REQUEST_ITEMS} books. A book requested in both formats counts twice.`
    );
  }

  if (olIds.length === 0) {
    throw new BulkRequestError('No books were selected.');
  }

  if (
    body.language !== undefined &&
    body.language !== null &&
    !isBookLanguage(body.language)
  ) {
    throw new BulkRequestError('Unknown book language.');
  }

  const requestUser = await getRequestUser(user, body.userId);

  if (
    !requestUser.hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
      type: 'or',
    })
  ) {
    throw new RequestPermissionError(
      'You do not have permission to make book requests.'
    );
  }

  const openLibrary = new OpenLibrary();
  const author = await openLibrary.getAuthor(body.authorId).catch(() => {
    throw new BulkRequestError('Author not found.', 404);
  });
  const authorId = getOlId(author.key);
  const { works } = await getAuthorWorks(
    openLibrary,
    authorId,
    AUTHOR_CATALOG_WORK_PAGES
  );
  const workMap = new Map(works.map((work) => [getOlId(work.key), work]));
  const mediaMap = new Map(
    (await Media.getRelatedBooks(olIds)).map((media) => [media.olId, media])
  );

  const result = emptyResult();
  const items: BulkItem[] = [];

  for (const olId of olIds) {
    const work = workMap.get(olId);

    for (const isAudiobook of formats) {
      if (!work) {
        result.failed.push({
          mediaId: olId,
          title: olId,
          isAudiobook,
          reason: 'Not among the works of this author.',
        });
        continue;
      }

      const media = mediaMap.get(olId);
      const item = { mediaId: olId, title: work.title, isAudiobook };
      // A blocklisted book is blocklisted in both formats
      const reason = getBulkSkipReason(
        isAudiobook ? media?.statusAudio : media?.status,
        media?.status
      );

      if (reason) {
        result.skipped.push({ ...item, reason });
      } else {
        items.push(item);
      }
    }
  }

  await checkBulkQuota(
    user,
    requestUser,
    MediaType.BOOK,
    items.length,
    body.ignoreQuota
  );

  const requests = await createRequests(
    items,
    user,
    (item) => ({
      mediaType: MediaType.BOOK,
      mediaId: item.mediaId,
      isAudiobook: item.isAudiobook,
      // Ignored for users who do not manage requests
      language: body.language,
      userId: body.userId,
      ignoreQuota: body.ignoreQuota,
    }),
    result
  );

  if (requests.length > 0) {
    const getFormats = (group: MediaRequest[]) => {
      const audiobook = group.some((request) => request.isAudiobook);
      const ebook = group.some((request) => !request.isAudiobook);

      return { audiobook, ebook };
    };

    sendBulkRequestNotifications(requests, {
      mediaType: (group) => {
        const { audiobook, ebook } = getFormats(group);
        return audiobook && ebook ? 'Book' : getBookFormatName(audiobook);
      },
      subject: (count) =>
        `${count} ${count === 1 ? 'book' : 'books'} by ${author.name}`,
      titles: new Map(
        result.created.map((item) => [item.requestId ?? 0, item.title])
      ),
      image: mapAuthorDetails(author).profilePath,
      actionPath: `/author/${authorId}`,
      bookFormat: (group) => {
        const { audiobook, ebook } = getFormats(group);
        return audiobook && ebook ? 'both' : audiobook ? 'audiobook' : 'ebook';
      },
      extra: (group) => {
        const { audiobook, ebook } = getFormats(group);

        // The requests of one bulk request share their language
        const language = group[0]?.language;

        return [
          {
            name: 'Format',
            value:
              audiobook && ebook
                ? `${getBookFormatName(false)} and ${getBookFormatName(true)}`
                : getBookFormatName(audiobook),
          },
          ...(isBookLanguage(language)
            ? [{ name: 'Language', value: getBookLanguageName(language) }]
            : []),
        ];
      },
    });
  }

  logger.info('Requested works of author', {
    label: 'Media Request',
    authorId,
    userId: requestUser.id,
    created: result.created.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
  });

  return result;
};
