import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { getAppVersion, getCommitTag } from '@server/utils/appVersion';

/**
 * NoBookEnds is a companion app for listening to audiobooks and reading
 * ebooks from Audiobookshelf. Its universal links open the app when it is
 * installed, and otherwise a page on its site with the store links.
 */
export const NOBOOKENDS_OPEN_URL = 'https://nobookends.com/open';

export type NoBookEndsFormat = 'ebook' | 'audiobook';

const trimUrl = (url?: string | null): string | undefined =>
  url?.trim().replace(/\/+$/, '') || undefined;

/**
 * Whether book pages offer to open available books in NoBookEnds. It needs
 * Audiobookshelf's address and its API key, which finds the book's item.
 */
export const isNoBookEndsLinkEnabled = (
  settings: AudiobookshelfSettings
): boolean =>
  !!trimUrl(settings.url) &&
  !!settings.apiKey &&
  settings.showNoBookEnds !== false;

/**
 * Opens an Audiobookshelf library item in NoBookEnds
 */
export const getNoBookEndsItemUrl = (
  audiobookshelfUrl: string,
  itemId: string,
  format: NoBookEndsFormat
): string => {
  const params = new URLSearchParams({
    server: trimUrl(audiobookshelfUrl) ?? audiobookshelfUrl,
    format,
  });

  return `${NOBOOKENDS_OPEN_URL}/item/${encodeURIComponent(
    itemId
  )}?${params.toString()}`;
};

/**
 * Sets NoBookEnds up in one tap: the Audiobookshelf server to sign in to,
 * and the AllSeerr server with the personal key it requests books with
 */
export const getNoBookEndsConnectUrl = ({
  audiobookshelfUrl,
  allseerrUrl,
  apiKey,
}: {
  audiobookshelfUrl: string;
  allseerrUrl: string;
  apiKey: string;
}): string => {
  const params = new URLSearchParams({
    abs: trimUrl(audiobookshelfUrl) ?? audiobookshelfUrl,
    allseerr: trimUrl(allseerrUrl) ?? allseerrUrl,
    key: apiKey,
  });

  return `${NOBOOKENDS_OPEN_URL}/connect?${params.toString()}`;
};

/**
 * Whether a user can connect NoBookEnds: books must be requestable and
 * Audiobookshelf linked, since the app reads and listens through it
 */
export const isNoBookEndsAvailable = (): boolean => {
  const settings = getSettings();

  return !!settings.bookService && !!trimUrl(settings.audiobookshelf.url);
};

export interface NoBookEndsStatus {
  version: string;
  commitTag: string;
  applicationTitle: string;
  user: { id: number; displayName: string };
  books: {
    enabled: boolean;
    canRequest: boolean;
    autoApprove: boolean;
    defaultFormat: 'ebook' | 'audiobook' | 'both';
  };
  issues: { canCreate: boolean };
  audiobookshelf: {
    configured: boolean;
    url: string | null;
    itemLinks: boolean;
  };
  openInNoBookEnds: boolean;
}

/**
 * What the app may offer this user, so it can hide what is turned off
 */
export const getNoBookEndsStatus = (user: User): NoBookEndsStatus => {
  const settings = getSettings();
  const audiobookshelf = settings.audiobookshelf;
  const audiobookshelfUrl = trimUrl(audiobookshelf.url) ?? null;
  const booksEnabled = !!settings.bookService;

  return {
    version: getAppVersion(),
    commitTag: getCommitTag(),
    applicationTitle: settings.main.applicationTitle,
    user: { id: user.id, displayName: user.displayName },
    books: {
      enabled: booksEnabled,
      canRequest:
        booksEnabled &&
        user.hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
          type: 'or',
        }),
      autoApprove:
        booksEnabled &&
        user.hasPermission(
          [Permission.AUTO_APPROVE, Permission.MANAGE_REQUESTS],
          {
            type: 'or',
          }
        ),
      defaultFormat: settings.main.defaultBookFormat ?? 'both',
    },
    issues: {
      canCreate: user.hasPermission(
        [Permission.CREATE_ISSUES, Permission.MANAGE_ISSUES],
        { type: 'or' }
      ),
    },
    audiobookshelf: {
      configured: !!audiobookshelfUrl,
      url: audiobookshelfUrl,
      itemLinks: !!audiobookshelfUrl && !!audiobookshelf.apiKey,
    },
    openInNoBookEnds: isNoBookEndsLinkEnabled(audiobookshelf),
  };
};
