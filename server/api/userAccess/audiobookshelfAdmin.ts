import { allowsExplicitContent } from '@server/lib/userAccess/ageLimits';
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

interface AbsUser {
  id: string;
  username: string;
  email?: string | null;
  type?: string;
  isActive?: boolean;
}

/**
 * The permissions Allseerr gives a listener: playing and downloading, no
 * changes to the library
 */
export const absPermissions = (access: AppAccess) => ({
  download: true,
  update: false,
  delete: false,
  upload: false,
  createEreader: false,
  accessAllLibraries: access.libraryIds === null,
  accessAllTags: true,
  accessExplicitContent: allowsExplicitContent(access.ageLimit),
  selectedTagsNotAccessible: false,
  librariesAccessible: access.libraryIds ?? [],
  itemTagsSelected: [],
});

/**
 * Audiobookshelf accounts, through an admin's API key
 */
export class AudiobookshelfAdminAPI implements UserAccessAppClient {
  private axios: AxiosInstance;

  constructor(options: UserAccessClientOptions) {
    this.axios = createHttpClient(options);

    if (options.apiKey) {
      this.axios.defaults.headers.common.Authorization = `Bearer ${options.apiKey}`;
    }
  }

  private async call<T>(run: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await run()).data;
    } catch (e) {
      throw new UserAccessAppError(describeAppError('Audiobookshelf', e));
    }
  }

  public async test(): Promise<AppConnectionInfo> {
    const status = await this.call(() =>
      this.axios.get<{ serverVersion?: string }>('/status')
    );
    const me = await this.call(() =>
      this.axios.get<{ type?: string }>('/api/me')
    );

    if (me?.type !== 'admin' && me?.type !== 'root') {
      throw new UserAccessAppError(
        'Audiobookshelf: the API key does not belong to an admin.'
      );
    }

    return { version: status?.serverVersion };
  }

  public async getLibraries(): Promise<AppLibrary[]> {
    const data = await this.call(() =>
      this.axios.get<{ libraries?: { id: string; name: string }[] }>(
        '/api/libraries'
      )
    );

    return (data.libraries ?? []).map(({ id, name }) => ({ id, name }));
  }

  private async getUsers(): Promise<AbsUser[]> {
    const data = await this.call(() =>
      this.axios.get<{ users?: AbsUser[] }>('/api/users')
    );

    return data.users ?? [];
  }

  public async findAccount(query: {
    remoteUserId?: string | null;
    username?: string | null;
    email?: string | null;
  }): Promise<RemoteAccount | null> {
    const user = matchAccount(await this.getUsers(), query);

    return user
      ? { id: user.id, username: user.username, email: user.email }
      : null;
  }

  public async createAccount(account: NewAppAccount): Promise<RemoteAccount> {
    const { librariesAccessible, itemTagsSelected, ...permissions } =
      absPermissions(account);
    const data = await this.call(() =>
      this.axios.post<{ user?: AbsUser }>('/api/users', {
        username: account.username,
        email: account.email || undefined,
        password: account.password,
        type: 'user',
        isActive: account.enabled,
        permissions,
        librariesAccessible,
        itemTagsSelected,
      })
    );

    if (!data.user?.id) {
      throw new UserAccessAppError(
        'Audiobookshelf did not return the new account.'
      );
    }

    return {
      id: data.user.id,
      username: data.user.username,
      email: data.user.email,
    };
  }

  public async updateAccount(
    account: RemoteAccount,
    access: AppAccess
  ): Promise<void> {
    const user = (await this.getUsers()).find((u) => u.id === account.id);

    if (!user) {
      throw new UserAccessAppError(
        'Audiobookshelf no longer has this account.'
      );
    }

    // Admins keep their own permissions, and the root user cannot be changed
    if (user.type === 'admin' || user.type === 'root') {
      return;
    }

    await this.call(() =>
      this.axios.patch(`/api/users/${encodeURIComponent(account.id)}`, {
        isActive: access.enabled,
        permissions: absPermissions(access),
      })
    );
  }

  public async setPassword(
    account: RemoteAccount,
    password: string
  ): Promise<void> {
    await this.call(() =>
      this.axios.patch(`/api/users/${encodeURIComponent(account.id)}`, {
        password,
      })
    );
  }

  public async deleteAccount(account: RemoteAccount): Promise<void> {
    await this.call(() =>
      this.axios.delete(`/api/users/${encodeURIComponent(account.id)}`)
    );
  }
}
