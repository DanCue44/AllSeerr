import type { AgeLimit } from '@server/lib/userAccess/ageLimits';
import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosError, AxiosInstance } from 'axios';
import axios, { isAxiosError } from 'axios';

export interface AppLibrary {
  id: string;
  name: string;
}

export interface RemoteAccount {
  id: string;
  username: string;
  email?: string | null;
}

/**
 * An account in an app as the admin's list of accounts shows it
 */
export interface AppAccountSummary extends RemoteAccount {
  isAdmin: boolean;
}

/**
 * What a person may do in an app: use it at all, which libraries (null for
 * all of them) and up to which age
 */
export interface AppAccess {
  enabled: boolean;
  libraryIds: string[] | null;
  ageLimit: AgeLimit | null;
  includeUnrated: boolean;
}

export interface NewAppAccount extends AppAccess {
  username: string;
  email?: string | null;
  password: string;
}

export interface AppConnectionInfo {
  version?: string;
}

/**
 * A key a person signs in to an app with instead of a password, such as an
 * Audiobookshelf API key or a Kavita auth key
 */
export interface AppUserKey {
  id: string;
  key: string;
}

/**
 * Manages accounts in an app through its admin API
 */
export interface UserAccessAppClient {
  // Checks the address and that the credentials belong to an admin
  test(): Promise<AppConnectionInfo>;
  getLibraries(): Promise<AppLibrary[]>;
  findAccount(query: {
    remoteUserId?: string | null;
    username?: string | null;
    email?: string | null;
  }): Promise<RemoteAccount | null>;
  // Every account in the app, for linking people to the accounts they have
  listAccounts(): Promise<AppAccountSummary[]>;
  createAccount(account: NewAppAccount): Promise<RemoteAccount>;
  updateAccount(account: RemoteAccount, access: AppAccess): Promise<void>;
  setPassword(account: RemoteAccount, password: string): Promise<void>;
  deleteAccount(account: RemoteAccount): Promise<void>;
  // Sets the email of an account, so the app can match the person by it
  // when they sign in with Allseerr. False when the app kept the old one.
  setEmail?(account: RemoteAccount, email: string): Promise<boolean>;
  // Whether the account is an admin of the app, whose password Allseerr
  // leaves to its owner
  isAppAdmin?(account: RemoteAccount): Promise<boolean>;
  // Makes a key the person signs in with, or finds the one named so. Apps
  // that only let people make their own keys need the person's password.
  // Null when the app cannot make one.
  createUserKey?(
    account: RemoteAccount,
    name: string,
    password?: string
  ): Promise<AppUserKey | null>;
  // Whether a key still signs in as the person
  isUserKeyValid?(account: RemoteAccount, key: string): Promise<boolean>;
  deleteUserKey?(keyId: string): Promise<void>;
}

export interface UserAccessClientOptions {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number;
}

export const createHttpClient = ({
  url,
  timeout = 15000,
}: Pick<UserAccessClientOptions, 'url' | 'timeout'>): AxiosInstance => {
  const client = axios.create({
    baseURL: url.replace(/\/+$/, ''),
    timeout,
  });
  client.interceptors.request.use(proxyRequestInterceptor);
  client.interceptors.request.use(userAgentRequestInterceptor);

  return client;
};

/**
 * A short reason an app turned a call down, without credentials or bodies
 * that could hold them
 */
export const describeAppError = (app: string, e: unknown): string => {
  if (isAxiosError(e)) {
    const error = e as AxiosError<unknown>;
    const status = error.response?.status;
    const data = error.response?.data;
    let detail = '';

    if (typeof data === 'string' && data.length < 300) {
      detail = data;
    } else if (data && typeof data === 'object') {
      const message =
        (data as { message?: unknown }).message ??
        (data as { title?: unknown }).title ??
        (data as { error?: unknown }).error;
      if (typeof message === 'string') {
        detail = message;
      } else if (Array.isArray(data)) {
        detail = data
          .map((item) =>
            typeof item === 'string'
              ? item
              : typeof item?.description === 'string'
                ? item.description
                : ''
          )
          .filter(Boolean)
          .join(' ');
      }
    }

    if (status) {
      return `${app} answered ${status}${detail ? `: ${detail}` : ''}`;
    }

    return `${app} could not be reached: ${error.code ?? error.message}`;
  }

  return `${app}: ${(e as Error)?.message ?? String(e)}`;
};

export class UserAccessAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserAccessAppError';
  }
}

const sameText = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The account matching a query: by its id first, then its username, then
 * its email
 */
export const matchAccount = <T extends RemoteAccount>(
  accounts: T[],
  {
    remoteUserId,
    username,
    email,
  }: {
    remoteUserId?: string | null;
    username?: string | null;
    email?: string | null;
  }
): T | null =>
  (remoteUserId
    ? accounts.find((account) => account.id === remoteUserId)
    : undefined) ??
  accounts.find((account) => sameText(account.username, username)) ??
  accounts.find((account) => sameText(account.email, email)) ??
  null;
