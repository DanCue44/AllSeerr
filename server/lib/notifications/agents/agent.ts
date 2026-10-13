import type Issue from '@server/entity/Issue';
import type IssueComment from '@server/entity/IssueComment';
import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type RemovalRequest from '@server/entity/RemovalRequest';
import type SeasonRollover from '@server/entity/SeasonRollover';
import type { User } from '@server/entity/User';
import type { NotificationAgentConfig } from '@server/lib/settings';
import type { Notification } from '..';

export interface NotificationPayload {
  event?: string;
  subject: string;
  notifySystem: boolean;
  notifyAdmin: boolean;
  notifyUser?: User;
  media?: Media;
  image?: string;
  message?: string;
  extra?: { name: string; value: string }[];
  request?: MediaRequest;
  removal?: RemovalRequest;
  rollover?: SeasonRollover;
  issue?: Issue;
  comment?: IssueComment;
  pendingRequestsCount?: number;
  isAdmin?: boolean;
  // Page the notification links to instead of the media page, such as the
  // artist page of a discography request
  actionPath?: string;
  // Page outside the app the notification links to when it has no media
  // page, such as the queue of the service a download is stuck in
  externalLink?: { url: string; title: string };
  // Book format of a summary notification that stands for several book
  // requests, which can cover both formats
  bookFormat?: 'ebook' | 'audiobook' | 'both';
  // Set on the summary notification of a bulk request, which stands for
  // more than one request
  bulk?: boolean;
}

/**
 * Path of the media page, music is addressed by its MusicBrainz id and books
 * by their OpenLibrary work id
 */
export const getMediaPath = (media: Media): string =>
  media.mediaType === 'music'
    ? `/music/${media.mbId}`
    : media.mediaType === 'book'
      ? `/book/${media.olId}`
      : `/${media.mediaType}/${media.tmdbId}`;

/**
 * Path the notification links to: its action path, or the media page
 */
export const getPayloadPath = (payload: NotificationPayload): string =>
  payload.actionPath ?? (payload.media ? getMediaPath(payload.media) : '');

/**
 * The book format a notification is about: the format of a bulk request
 * summary, the requested format, or the format named on an issue or removal
 * request. Undefined when none was given.
 */
export const getPayloadBookFormat = (
  payload: NotificationPayload
): 'ebook' | 'audiobook' | 'both' | undefined => {
  if (payload.bookFormat) {
    return payload.bookFormat;
  }

  if (payload.request) {
    return payload.request.isAudiobook ? 'audiobook' : 'ebook';
  }

  const format = payload.issue?.bookFormat ?? payload.removal?.bookFormat;

  return format === 'ebook' || format === 'audiobook' ? format : undefined;
};

export abstract class BaseAgent<T extends NotificationAgentConfig> {
  protected settings?: T;
  public constructor(settings?: T) {
    this.settings = settings;
  }

  protected abstract getSettings(): T;
}

export interface NotificationAgent {
  shouldSend(): boolean;
  send(type: Notification, payload: NotificationPayload): Promise<boolean>;
}
