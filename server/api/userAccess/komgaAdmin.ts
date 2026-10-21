import { toKomgaAgeRestriction } from '@server/lib/userAccess/ageLimits';
import type { AxiosInstance } from 'axios';
import type {
  AppAccess,
  AppConnectionInfo,
  AppLibrary,
  NewAppAccount,
  RemoteAccount,
  UserAccessAppClient,
  UserAccessClientOptions,
} from './types';
import {
  UserAccessAppError,
  createHttpClient,
  describeAppError,
  matchAccount,
} from './types';

interface KomgaUser {
  id: string;
  email: string;
  roles?: string[];
}

/**
 * The roles Allseerr gives a reader: reading pages and downloading. Without
 * access there are no roles and no libraries, which keeps the account and
 * its reading progress but shows nothing.
 */
export const komgaRoles = (enabled: boolean): string[] =>
  enabled ? ['PAGE_STREAMING', 'FILE_DOWNLOAD'] : [];

export const komgaSharedLibraries = (access: AppAccess) =>
  access.enabled
    ? { all: access.libraryIds === null, libraryIds: access.libraryIds ?? [] }
    : { all: false, libraryIds: [] };

/**
 * Komga accounts, through an admin's API key or email and password. Komga
 * signs people in with their email, which is also their username there.
 */
export class KomgaAdminAPI implements UserAccessAppClient {
  private axios: AxiosInstance;

  constructor(options: UserAccessClientOptions) {
    this.axios = createHttpClient(options);

    if (options.apiKey) {
      this.axios.defaults.headers.common['X-API-Key'] = options.apiKey;
    } else if (options.username && options.password) {
      this.axios.defaults.auth = {
        username: options.username,
        password: options.password,
      };
    }
  }

  private async call<T>(run: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await run()).data;
    } catch (e) {
      throw new UserAccessAppError(describeAppError('Komga', e));
    }
  }

  public async test(): Promise<AppConnectionInfo> {
    const me = await this.call(() =>
      this.axios.get<KomgaUser>('/api/v2/users/me')
    );

    if (!me?.roles?.includes('ADMIN')) {
      throw new UserAccessAppError(
        'Komga: the credentials do not belong to an admin.'
      );
    }

    let version: string | undefined;
    try {
      const info = await this.axios.get<{ build?: { version?: string } }>(
        '/actuator/info'
      );
      version = info.data?.build?.version;
    } catch {
      // The version is only shown in the settings
    }

    return { version };
  }

  public async getLibraries(): Promise<AppLibrary[]> {
    const libraries = await this.call(() =>
      this.axios.get<{ id: string; name: string }[]>('/api/v1/libraries')
    );

    return (libraries ?? []).map(({ id, name }) => ({ id, name }));
  }

  private async getUsers(): Promise<KomgaUser[]> {
    return (
      (await this.call(() => this.axios.get<KomgaUser[]>('/api/v2/users'))) ??
      []
    );
  }

  public async findAccount(query: {
    remoteUserId?: string | null;
    username?: string | null;
    email?: string | null;
  }): Promise<RemoteAccount | null> {
    const user = matchAccount(
      (await this.getUsers()).map((user) => ({
        id: user.id,
        username: user.email,
        email: user.email,
      })),
      // Komga's username is the email
      { ...query, username: query.email ?? query.username }
    );

    return user;
  }

  public async createAccount(account: NewAppAccount): Promise<RemoteAccount> {
    const email = account.email || `${account.username}@allseerr.invalid`;
    const user = await this.call(() =>
      this.axios.post<KomgaUser>('/api/v2/users', {
        email,
        password: account.password,
        roles: komgaRoles(account.enabled),
        sharedLibraries: komgaSharedLibraries(account),
        ageRestriction: toKomgaAgeRestriction(
          account.ageLimit,
          account.includeUnrated
        ),
      })
    );

    if (!user?.id) {
      throw new UserAccessAppError('Komga did not return the new account.');
    }

    return { id: user.id, username: user.email, email: user.email };
  }

  public async updateAccount(
    account: RemoteAccount,
    access: AppAccess
  ): Promise<void> {
    const user = (await this.getUsers()).find((u) => u.id === account.id);

    if (!user) {
      throw new UserAccessAppError('Komga no longer has this account.');
    }

    // An admin keeps every role and library
    if (user.roles?.includes('ADMIN')) {
      return;
    }

    await this.call(() =>
      this.axios.patch(`/api/v2/users/${encodeURIComponent(account.id)}`, {
        roles: komgaRoles(access.enabled),
        sharedLibraries: komgaSharedLibraries(access),
        ageRestriction: toKomgaAgeRestriction(
          access.ageLimit,
          access.includeUnrated
        ),
      })
    );
  }

  public async setPassword(
    account: RemoteAccount,
    password: string
  ): Promise<void> {
    await this.call(() =>
      this.axios.patch(
        `/api/v2/users/${encodeURIComponent(account.id)}/password`,
        { password }
      )
    );
  }

  public async deleteAccount(account: RemoteAccount): Promise<void> {
    await this.call(() =>
      this.axios.delete(`/api/v2/users/${encodeURIComponent(account.id)}`)
    );
  }
}
