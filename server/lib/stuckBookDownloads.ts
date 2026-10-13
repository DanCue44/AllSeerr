import type {
  ChaptarrMediaType,
  ChaptarrQueueItem,
} from '@server/api/servarr/chaptarr';
import ChaptarrAPI from '@server/api/servarr/chaptarr';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import type { ChaptarrSettings } from '@server/lib/settings';
import type { StuckDownload } from '@server/lib/stuckDownloads';
import {
  STUCK_DOWNLOADS_PATH,
  StuckDownloadMonitor,
  createFileStore,
} from '@server/lib/stuckDownloads';
import logger from '@server/logger';
import { truncate } from 'lodash';
import { In } from 'typeorm';

export const STUCK_MESSAGE_LENGTH = 300;

export interface StuckBookDetails {
  title: string;
  format?: ChaptarrMediaType;
  authorName?: string;
  statusMessage?: string;
  // The book in the app, linked to when known
  media?: Media;
  requesters: string[];
  // Chaptarr's queue page, linked to when the book is not known
  queueUrl?: string;
}

const FORMAT_NAMES: Record<ChaptarrMediaType, string> = {
  ebook: 'Ebook',
  audiobook: 'Audiobook',
};

/**
 * Builds the admin notification about a stuck book download: "<title>
 * (<format>) by <author>: <what Chaptarr says>", linking to the book page,
 * or to Chaptarr's queue when the book is not in the app
 */
export const buildStuckBookNotification = (
  details: StuckBookDetails
): NotificationPayload => {
  const name = `${details.title}${
    details.format ? ` (${FORMAT_NAMES[details.format]})` : ''
  }`;
  const reason = truncate(
    details.statusMessage?.replace(/\s+/g, ' ').trim() ||
      'Chaptarr cannot finish this download.',
    { length: STUCK_MESSAGE_LENGTH, separator: /\s/, omission: '...' }
  );
  const media = details.media?.olId ? details.media : undefined;

  return {
    event: 'Book Download Needs Attention',
    subject: name,
    message: `${name}${
      details.authorName ? ` by ${details.authorName}` : ''
    }: ${reason}`,
    media,
    externalLink:
      !media && details.queueUrl
        ? { url: details.queueUrl, title: 'Open Chaptarr' }
        : undefined,
    extra: details.requesters.length
      ? [{ name: 'Requested By', value: details.requesters.join(', ') }]
      : undefined,
    bookFormat: details.format,
    notifySystem: true,
    notifyAdmin: true,
  };
};

/**
 * The queue page of a Chaptarr server, on its external address when it has
 * one
 */
export const getChaptarrQueueUrl = (server: ChaptarrSettings): string =>
  `${(server.externalUrl || ChaptarrAPI.buildUrl(server, '')).replace(
    /\/+$/,
    ''
  )}/activity/queue`;

/**
 * Finds the book a Chaptarr book id belongs to, as the download tracker
 * does: the ebook's id is the media's externalServiceId, the audiobook's
 * its externalServiceIdAudio
 */
export const findStuckBookMedia = async (
  serverIds: number[],
  bookId: number
): Promise<{ media: Media; format: ChaptarrMediaType } | undefined> => {
  const media = await getRepository(Media).findOne({
    where: [
      {
        mediaType: MediaType.BOOK,
        serviceId: In(serverIds),
        externalServiceId: bookId,
      },
      {
        mediaType: MediaType.BOOK,
        serviceId: In(serverIds),
        externalServiceIdAudio: bookId,
      },
    ],
    relations: { requests: { requestedBy: true } },
  });

  if (!media) {
    return undefined;
  }

  return {
    media,
    format:
      media.externalServiceIdAudio === bookId &&
      media.externalServiceId !== bookId
        ? 'audiobook'
        : 'ebook',
  };
};

/**
 * Who asked for the format of a book that is still on its way
 */
export const getActiveRequesters = (
  media: Media | undefined,
  format: ChaptarrMediaType | undefined
): string[] => {
  const names = (media?.requests ?? [])
    .filter(
      (request) =>
        (request.status === MediaRequestStatus.PENDING ||
          request.status === MediaRequestStatus.APPROVED) &&
        (!format || !!request.isAudiobook === (format === 'audiobook'))
    )
    .map((request) => request.requestedBy?.displayName)
    .filter((name): name is string => !!name);

  return [...new Set(names)];
};

const getAuthorName = async (
  chaptarr: ChaptarrAPI,
  item: ChaptarrQueueItem
): Promise<string | undefined> => {
  if (item.book?.author?.authorName) {
    return item.book.author.authorName;
  }

  if (!item.authorId) {
    return undefined;
  }

  try {
    return (await chaptarr.getAuthor(item.authorId)).authorName || undefined;
  } catch {
    return undefined;
  }
};

export const getStuckBookDetails = async (
  server: ChaptarrSettings,
  serverIds: number[],
  chaptarr: ChaptarrAPI,
  stuck: StuckDownload<ChaptarrQueueItem>
): Promise<StuckBookDetails> => {
  const { item } = stuck;
  const found = item.bookId
    ? await findStuckBookMedia(serverIds, item.bookId)
    : undefined;
  const format = item.book?.mediaType ?? found?.format;

  return {
    title: item.book?.title || item.title,
    format,
    authorName: await getAuthorName(chaptarr, item),
    statusMessage: stuck.messages[0],
    media: found?.media,
    requesters: getActiveRequesters(found?.media, format),
    queueUrl: getChaptarrQueueUrl(server),
  };
};

export const stuckDownloadMonitor = new StuckDownloadMonitor(
  createFileStore(STUCK_DOWNLOADS_PATH)
);

/**
 * Checks the queue of a Chaptarr server for stuck downloads and tells the
 * admins about each one once. serverIds are the ids of every server setting
 * that points at this Chaptarr.
 */
export const checkStuckBookDownloads = async (
  server: ChaptarrSettings,
  serverIds: number[],
  chaptarr: ChaptarrAPI,
  queue: ChaptarrQueueItem[],
  now = Date.now()
): Promise<void> => {
  const due = stuckDownloadMonitor.update(`chaptarr:${server.id}`, queue, now);

  for (const stuck of due) {
    try {
      const details = await getStuckBookDetails(
        server,
        serverIds,
        chaptarr,
        stuck
      );

      logger.warn(`Book download needs attention: ${details.title}`, {
        label: 'Download Tracker',
        state: stuck.reason,
        message: details.statusMessage,
      });

      notificationManager.sendNotification(
        Notification.DOWNLOAD_NEEDS_ATTENTION,
        buildStuckBookNotification(details)
      );
    } catch (e) {
      logger.error('Unable to send a stuck book download notification', {
        label: 'Download Tracker',
        errorMessage: e.message,
      });
    }
  }
};
