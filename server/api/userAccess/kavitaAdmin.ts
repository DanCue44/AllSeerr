import { toKavitaAgeRestriction } from '@server/lib/userAccess/ageLimits';
import type { AxiosInstance } from 'axios';
import { isAxiosError } from 'axios';
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

interface KavitaMember {
  id: number;
  username?: string | null;
  email?: string | null;
  isPending?: boolean;
  roles?: string[] | null;
  libraries?: { id: number; name: string }[] | null;
  identityProvider?: number;
}

// Kavita's own role names
export const KAVITA_LOGIN_ROLE = 'Login';
export const KAVITA_DOWNLOAD_ROLE = 'Download';
export const KAVITA_CHANGE_PASSWORD_ROLE = 'Change Password';

/**
 * The roles Allseerr gives a reader: sign in, download and change their
 * own password. Without access there is no sign in role, which keeps the
 * account and its reading progress but locks it.
 */
export const kavitaRoles = (enabled: boolean): string[] =>
  enabled
    ? [KAVITA_LOGIN_ROLE, KAVITA_DOWNLOAD_ROLE, KAVITA_CHANGE_PASSWORD_ROLE]
    : [];

/**
 * The token and email of an invite link, which looks like
 * https://kavita/registration/confirm-email?token=...&email=...
 */
export const parseKavitaInviteLink = (
  link: string
): { token: string; email: string } | null => {
  try {
    const url = new URL(link, 'http://kavita.invalid');
    const token = url.searchParams.get('token');
    const email = url.searchParams.get('email');

    return token && email ? { token, email } : null;
  } catch {
    return null;
  }
};

/**
 * Kavita accounts, through an admin's API key or sign in. Kavita has no
 * call that makes an account directly, so Allseerr invites the person and
 * confirms the invite with the password it picked.
 */
export class KavitaAdminAPI implements UserAccessAppClient {
  private axios: AxiosInstance;
  private options: UserAccessClientOptions;
  private token?: string;

  constructor(options: UserAccessClientOptions) {
    this.options = options;
    this.axios = createHttpClient(options);
  }

  private async authenticate(): Promise<string> {
    try {
      if (this.options.apiKey) {
        const response = await this.axios.post<{ token?: string }>(
          '/api/Plugin/authenticate',
          undefined,
          { params: { apiKey: this.options.apiKey, pluginName: 'Allseerr' } }
        );
        if (response.data?.token) {
          return response.data.token;
        }
      } else if (this.options.username && this.options.password) {
        const response = await this.axios.post<{ token?: string }>(
          '/api/Account/login',
          {
            username: this.options.username,
            password: this.options.password,
          }
        );
        if (response.data?.token) {
          return response.data.token;
        }
      }
    } catch (e) {
      throw new UserAccessAppError(describeAppError('Kavita', e));
    }

    throw new UserAccessAppError(
      'Kavita: set an admin API key, or an admin username and password.'
    );
  }

  /**
   * Runs a call with a valid token, signing in again once when it expired
   */
  private async call<T>(
    run: (headers: Record<string, string>) => Promise<{ data: T }>
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.token) {
        this.token = await this.authenticate();
      }

      try {
        return (await run({ Authorization: `Bearer ${this.token}` })).data;
      } catch (e) {
        if (attempt === 0 && isAxiosError(e) && e.response?.status === 401) {
          this.token = undefined;
          continue;
        }
        throw new UserAccessAppError(describeAppError('Kavita', e));
      }
    }

    throw new UserAccessAppError('Kavita refused the admin sign in.');
  }

  public async test(): Promise<AppConnectionInfo> {
    const info = await this.call((headers) =>
      this.axios.get<{ kavitaVersion?: string }>(
        '/api/Server/server-info-slim',
        { headers }
      )
    );
    // Only admins may list the users
    await this.getMembers();

    return { version: info?.kavitaVersion };
  }

  public async getLibraries(): Promise<AppLibrary[]> {
    const libraries = await this.call((headers) =>
      this.axios.get<{ id: number; name: string }[]>('/api/Library/libraries', {
        headers,
      })
    );

    return (libraries ?? []).map(({ id, name }) => ({ id: String(id), name }));
  }

  private async getMembers(): Promise<KavitaMember[]> {
    return (
      (await this.call((headers) =>
        this.axios.get<KavitaMember[]>('/api/Users', {
          headers,
          params: { includePending: true },
        })
      )) ?? []
    );
  }

  private async findMember(query: {
    remoteUserId?: string | null;
    username?: string | null;
    email?: string | null;
  }): Promise<KavitaMember | null> {
    const members = await this.getMembers();
    const match = matchAccount(
      members.map((member) => ({
        id: String(member.id),
        username: member.username ?? '',
        email: member.email,
        member,
      })),
      query
    );

    return match?.member ?? null;
  }

  public async findAccount(query: {
    remoteUserId?: string | null;
    username?: string | null;
    email?: string | null;
  }): Promise<RemoteAccount | null> {
    const member = await this.findMember(query);

    return member
      ? {
          id: String(member.id),
          username: member.username ?? '',
          email: member.email,
        }
      : null;
  }

  /**
   * The library ids to send: Kavita has no "all libraries", so all means
   * every library it has now
   */
  private async libraryIds(libraryIds: string[] | null): Promise<number[]> {
    const ids =
      libraryIds ?? (await this.getLibraries()).map((library) => library.id);

    return ids.map(Number).filter((id) => Number.isInteger(id));
  }

  public async createAccount(account: NewAppAccount): Promise<RemoteAccount> {
    const email = account.email || `${account.username}@allseerr.invalid`;
    const invite = await this.call((headers) =>
      this.axios.post<{ emailLink?: string }>(
        '/api/Account/invite',
        {
          email,
          roles: kavitaRoles(account.enabled),
          libraries: [],
          ageRestriction: toKavitaAgeRestriction(
            account.ageLimit,
            account.includeUnrated
          ),
        },
        { headers }
      )
    );
    const link = invite?.emailLink
      ? parseKavitaInviteLink(invite.emailLink)
      : null;

    if (!link) {
      throw new UserAccessAppError(
        'Kavita did not return an invite link for the new account.'
      );
    }

    try {
      await this.axios.post('/api/Account/confirm-email', {
        email: link.email,
        token: link.token,
        username: account.username,
        password: account.password,
      });
    } catch (e) {
      throw new UserAccessAppError(describeAppError('Kavita', e));
    }

    const created = await this.findAccount({
      username: account.username,
      email: link.email,
    });

    if (!created) {
      throw new UserAccessAppError(
        'Kavita made the account but it could not be found afterwards.'
      );
    }

    // The invite leaves out libraries, the update sets them with the rest
    await this.updateAccount(created, account);

    return created;
  }

  public async updateAccount(
    account: RemoteAccount,
    access: AppAccess
  ): Promise<void> {
    const member = await this.findMember({ remoteUserId: account.id });

    if (!member) {
      throw new UserAccessAppError('Kavita no longer has this account.');
    }

    // An admin keeps every role and library Kavita gives admins
    if (member.roles?.includes('Admin')) {
      return;
    }

    const libraries = access.enabled
      ? await this.libraryIds(access.libraryIds)
      : [];

    await this.call((headers) =>
      this.axios.post(
        '/api/Account/update',
        {
          userId: member.id,
          username: member.username,
          email: member.email,
          roles: kavitaRoles(access.enabled),
          libraries,
          ageRestriction: toKavitaAgeRestriction(
            access.ageLimit,
            access.includeUnrated
          ),
          // Keeps how the person signs in, so an account made by signing in
          // with Allseerr stays one
          identityProvider: member.identityProvider ?? 0,
        },
        { headers }
      )
    );
  }

  public async setPassword(
    account: RemoteAccount,
    password: string
  ): Promise<void> {
    await this.call((headers) =>
      this.axios.post(
        '/api/Account/reset-password',
        { userName: account.username, password, oldPassword: '' },
        { headers }
      )
    );
  }

  public async deleteAccount(account: RemoteAccount): Promise<void> {
    await this.call((headers) =>
      this.axios.delete('/api/Users/delete-user', {
        headers,
        params: { username: account.username },
      })
    );
  }
}
