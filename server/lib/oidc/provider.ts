import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserAppAccount } from '@server/entity/UserAppAccount';
import { OidcDatabaseAdapter } from '@server/lib/oidc/adapter';
import type { OidcApp } from '@server/lib/oidc/claims';
import {
  OIDC_SCOPE_CLAIMS,
  accessAppFor,
  buildOidcClaims,
  isOidcApp,
} from '@server/lib/oidc/claims';
import { getOidcJwks } from '@server/lib/oidc/keys';
import { Permission } from '@server/lib/permissions';
import type { OidcClientSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import {
  appUsernameFor,
  getAgeLimit,
  getAppClient,
} from '@server/lib/userAccess';
import logger from '@server/logger';
import type { NextFunction, Request, Response } from 'express';
import type {
  Account,
  AccountClaims,
  ClientMetadata,
  KoaContextWithOIDC,
  default as ProviderType,
} from 'oidc-provider';
import Provider from 'oidc-provider';

// Where the provider lives, under the application's address
export const OIDC_PATH = '/oidc';

// Where the provider sends people to sign in or allow access
export const OIDC_INTERACTION_PATH = '/api/v1/auth/oidc/interaction';

let provider: { key: string; instance: ProviderType } | undefined;

export const getOidcIssuer = (): string | null => {
  const { applicationUrl } = getSettings().main;

  return applicationUrl
    ? `${applicationUrl.replace(/\/+$/, '')}${OIDC_PATH}`
    : null;
};

/**
 * The app a client signs in to, from its client settings
 */
export const getClientApp = (clientId: string): OidcApp | null => {
  const client = getSettings().userAccess.oidc.clients.find(
    (c) => c.clientId === clientId
  );

  return client && isOidcApp(client.app) ? client.app : null;
};

const toClientMetadata = (client: OidcClientSettings): ClientMetadata => ({
  client_id: client.clientId,
  client_secret: client.clientSecret,
  redirect_uris: client.redirectUris,
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  // Kavita (ASP.NET) sends the secret in the body, Audiobookshelf and
  // Komga in the Authorization header
  token_endpoint_auth_method:
    client.app === 'kavita' ? 'client_secret_post' : 'client_secret_basic',
  // Audiobookshelf's app signs in through a mobile redirect
  application_type: client.redirectUris.some((uri) => !uri.startsWith('http'))
    ? 'native'
    : 'web',
});

// Library names change rarely, Kavita roles name libraries by name
const libraryNameCache = new Map<
  string,
  { names: Record<string, string>; at: number }
>();
const LIBRARY_NAME_TTL = 5 * 60 * 1000;

const libraryNamesFor = async (
  app: OidcApp
): Promise<Record<string, string> | undefined> => {
  if (app !== 'kavita') {
    return undefined;
  }

  const cached = libraryNameCache.get(app);
  if (cached && Date.now() - cached.at < LIBRARY_NAME_TTL) {
    return cached.names;
  }

  const client = getAppClient('kavita');
  if (!client) {
    return {};
  }

  try {
    const names = Object.fromEntries(
      (await client.getLibraries()).map((library) => [library.id, library.name])
    );
    libraryNameCache.set(app, { names, at: Date.now() });
    return names;
  } catch (e) {
    logger.warn('Failed to list Kavita libraries for sign in roles', {
      label: 'OIDC',
      message: (e as Error).message,
    });
    return cached?.names ?? {};
  }
};

const absoluteUrl = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (/^https?:\/\//.test(value)) {
    return value;
  }
  const { applicationUrl } = getSettings().main;

  return applicationUrl
    ? `${applicationUrl.replace(/\/+$/, '')}${value.startsWith('/') ? '' : '/'}${value}`
    : undefined;
};

/**
 * Whether a person may sign in to an app with Allseerr: admins always, the
 * others when their access to the app is on
 */
export const canSignInTo = async (
  user: User,
  app: OidcApp
): Promise<boolean> => {
  if (user.hasPermission(Permission.ADMIN)) {
    return true;
  }

  const account = await getRepository(UserAppAccount).findOne({
    where: { user: { id: user.id }, app: accessAppFor(app) },
  });

  return !!account?.enabled;
};

const findAccount = async (
  ctx: KoaContextWithOIDC,
  sub: string
): Promise<Account | undefined> => {
  const userId = Number(sub);
  const user = Number.isInteger(userId)
    ? await getRepository(User).findOne({ where: { id: userId } })
    : null;

  if (!user) {
    return undefined;
  }

  const clientId = ctx.oidc.client?.clientId;
  const app = clientId ? getClientApp(clientId) : null;

  return {
    accountId: sub,
    claims: async () => {
      if (!app) {
        return { sub };
      }

      const account = await getRepository(UserAppAccount).findOne({
        where: { user: { id: user.id }, app: accessAppFor(app) },
      });
      const limit = await getAgeLimit(user);

      return buildOidcClaims(app, {
        userId: user.id,
        displayName: user.displayName,
        username: account?.remoteUsername || appUsernameFor(user),
        email: user.email,
        picture: absoluteUrl(user.avatar),
        isAdmin: user.hasPermission(Permission.ADMIN),
        access: account
          ? { enabled: account.enabled, libraryIds: account.libraryIds ?? null }
          : null,
        libraryNames: await libraryNamesFor(app),
        ageLimit: limit.ageLimit,
        includeUnrated: limit.includeUnrated,
      }) as AccountClaims;
    },
  };
};

const buildProvider = async (
  issuer: string,
  clients: OidcClientSettings[]
): Promise<ProviderType> => {
  const settings = getSettings();
  const instance = new Provider(issuer, {
    adapter: OidcDatabaseAdapter,
    clients: clients.map(toClientMetadata),
    clientDefaults: {
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
    },
    clientAuthMethods: ['client_secret_basic', 'client_secret_post'],
    findAccount,
    claims: OIDC_SCOPE_CLAIMS,
    scopes: ['openid', 'offline_access', ...Object.keys(OIDC_SCOPE_CLAIMS)],
    // Apps such as Kavita read the claims from the ID token, not only from
    // the user info endpoint
    conformIdTokenClaims: false,
    cookies: {
      keys: [settings.sessionSecret || settings.clientId],
    },
    jwks: (await getOidcJwks()) as unknown as { keys: never[] },
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      userinfo: { enabled: true },
      rpInitiatedLogout: { enabled: true },
    },
    pkce: {
      // Confidential apps may skip it, public ones such as the
      // Audiobookshelf app use it
      required: (_ctx, client) => client.tokenEndpointAuthMethod === 'none',
    },
    interactions: {
      url: (_ctx, interaction) => `${OIDC_INTERACTION_PATH}/${interaction.uid}`,
    },
    issueRefreshToken: async (_ctx, client, code) =>
      client.grantTypeAllowed('refresh_token') &&
      code.scopes.has('offline_access'),
    ttl: {
      AccessToken: 60 * 60,
      AuthorizationCode: 10 * 60,
      IdToken: 60 * 60,
      Interaction: 60 * 60,
      Grant: 30 * 24 * 60 * 60,
      Session: 14 * 24 * 60 * 60,
      RefreshToken: 30 * 24 * 60 * 60,
    },
    renderError: async (ctx, out) => {
      ctx.type = 'html';
      ctx.body = `<!doctype html><html><head><meta charset="utf-8"><title>Sign in failed</title></head><body style="font-family:sans-serif;padding:2rem"><h1>Sign in failed</h1><p>${String(
        out.error_description ?? out.error
      ).replace(/[<>&"]/g, '')}</p></body></html>`;
    },
  });

  // Behind a reverse proxy the address people use comes from its headers
  if (settings.network.trustProxy) {
    (instance as unknown as { proxy: boolean }).proxy = true;
  }

  instance.on('server_error', (_ctx, error) => {
    logger.error('OpenID Connect provider error', {
      label: 'OIDC',
      message: error.message,
    });
  });

  return instance;
};

/**
 * The provider, while signing in with Allseerr is on and the application
 * address is set. It is rebuilt when the clients or the address change.
 */
export const getOidcProvider = async (): Promise<ProviderType | null> => {
  const { oidc } = getSettings().userAccess;
  const issuer = getOidcIssuer();

  if (!oidc.enabled || !issuer) {
    return null;
  }

  const clients = oidc.clients.filter(
    (client) => client.enabled && isOidcApp(client.app)
  );
  const key = JSON.stringify({
    issuer,
    trustProxy: getSettings().network.trustProxy,
    clients,
  });

  if (provider?.key !== key) {
    provider = { key, instance: await buildProvider(issuer, clients) };
  }

  return provider.instance;
};

export const resetOidcProvider = (): void => {
  provider = undefined;
  libraryNameCache.clear();
};

/**
 * Express middleware that hands /oidc to the provider, or answers 404 while
 * signing in with Allseerr is off
 */
export const oidcMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const instance = await getOidcProvider();

    if (!instance) {
      res.status(404).json({ message: 'Sign in with Allseerr is off.' });
      return;
    }

    instance.callback()(req, res);
  } catch (e) {
    next(e);
  }
};
