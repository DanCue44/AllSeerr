import type { User } from '@server/entity/User';
import { getNoBookEndsSyncPublicUrl } from '@server/lib/nobookendsSync';
import { Permission } from '@server/lib/permissions';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { getAppVersion, getCommitTag } from '@server/utils/appVersion';
import { isIP } from 'net';

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
 * and the AllSeerr server with the personal key it requests books with. The
 * values go in the fragment, which browsers never send, so the key does not
 * reach the NoBookEnds site or its logs when the app is not installed.
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

  return `${NOBOOKENDS_OPEN_URL}/connect#${params.toString()}`;
};

const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT, Tailscale
];
const PRIVATE_SUFFIXES = ['.local', '.lan', '.home', '.internal', '.home.arpa'];

/**
 * Whether a host can only be reached at home: localhost, a private address,
 * a single label name or a local domain. A phone away from home cannot.
 */
export const isPrivateHost = (hostname: string): boolean => {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  const ipVersion = isIP(host);

  if (ipVersion === 4) {
    return PRIVATE_IPV4.some((range) => range.test(host));
  }

  if (ipVersion === 6) {
    const mappedV4 = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

    return mappedV4
      ? isPrivateHost(mappedV4[1])
      : host === '::1' ||
          host === '::' ||
          /^f[cd]/.test(host) ||
          /^fe[89ab]/.test(host);
  }

  return (
    !host.includes('.') ||
    PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
};

/**
 * The AllSeerr address the app connects to: the Application URL, or the
 * address AllSeerr was opened at when that is reachable from anywhere.
 * Undefined when neither is, and the Application URL must be set first.
 */
export const getNoBookEndsAllSeerrUrl = (request: {
  protocol: string;
  hostname: string;
  host?: string;
}): string | undefined => {
  const applicationUrl = trimUrl(getSettings().main.applicationUrl);

  if (applicationUrl) {
    return applicationUrl;
  }

  if (!request.host || isPrivateHost(request.hostname)) {
    return undefined;
  }

  return `${request.protocol}://${request.host}`;
};

/**
 * Whether a user can connect NoBookEnds: books must be requestable and
 * Audiobookshelf linked, since the app reads and listens through it
 */
export const isNoBookEndsAvailable = (): boolean => {
  const settings = getSettings();

  return !!settings.bookService && !!trimUrl(settings.audiobookshelf.url);
};

/**
 * A request quota as the app shows it: how many requests are allowed in
 * how many days (null days counts every request ever made)
 */
export interface NoBookEndsQuota {
  limit: number;
  days: number | null;
  used: number;
  remaining: number;
  restricted: boolean;
}

/**
 * The user's book quota, from the same count the request endpoint enforces.
 * Null when the user may request without a limit. Ebook and audiobook
 * requests share the quota, a book requested in both formats counts twice.
 */
export const getNoBookEndsQuota = async (
  user: User
): Promise<NoBookEndsQuota | null> => {
  const { book } = await user.getQuota();

  if (!book.limit) {
    return null;
  }

  return {
    limit: book.limit,
    days: book.days || null,
    used: book.used,
    remaining: book.remaining ?? Math.max(0, book.limit - book.used),
    restricted: book.restricted,
  };
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
    quota: NoBookEndsQuota | null;
  };
  issues: { canCreate: boolean };
  // Whether the user may approve, decline and edit everyone's requests
  requests: { canManage: boolean };
  // Whether the user may see and fix book downloads Chaptarr is stuck on
  downloads: { canManage: boolean };
  audiobookshelf: {
    configured: boolean;
    url: string | null;
    itemLinks: boolean;
  };
  openInNoBookEnds: boolean;
  // The NoBookEnds Sync server the apps fetch Listen and Read alignments
  // from, only while it is enabled and has a public address
  nobookendsSync?: { url: string };
}

/**
 * What the app may offer this user, so it can hide what is turned off
 */
export const getNoBookEndsStatus = async (
  user: User
): Promise<NoBookEndsStatus> => {
  const settings = getSettings();
  const audiobookshelf = settings.audiobookshelf;
  const audiobookshelfUrl = trimUrl(audiobookshelf.url) ?? null;
  const booksEnabled = !!settings.bookService;
  const canManageRequests = user.hasPermission(Permission.MANAGE_REQUESTS);
  const syncUrl = getNoBookEndsSyncPublicUrl(settings.nobookendsSync);

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
      quota: booksEnabled ? await getNoBookEndsQuota(user) : null,
    },
    issues: {
      canCreate: user.hasPermission(
        [Permission.CREATE_ISSUES, Permission.MANAGE_ISSUES],
        { type: 'or' }
      ),
    },
    requests: {
      canManage: canManageRequests,
    },
    downloads: {
      // Only Chaptarr's queue can be read for stuck downloads
      canManage: canManageRequests && settings.bookService === 'chaptarr',
    },
    audiobookshelf: {
      configured: !!audiobookshelfUrl,
      url: audiobookshelfUrl,
      itemLinks: !!audiobookshelfUrl && !!audiobookshelf.apiKey,
    },
    openInNoBookEnds: isNoBookEndsLinkEnabled(audiobookshelf),
    ...(syncUrl ? { nobookendsSync: { url: syncUrl } } : {}),
  };
};
