import type { UserAccessApp } from '@server/constants/userAccess';
import type { AgeLimit } from '@server/lib/userAccess/ageLimits';
import {
  allowsExplicitContent,
  toKavitaAgeRoles,
} from '@server/lib/userAccess/ageLimits';

// Apps that can sign people in with Allseerr
export const OIDC_APPS = [
  'audiobookshelf',
  'kavita',
  'komga',
  'nobookends',
] as const;

export type OidcApp = (typeof OIDC_APPS)[number];

export const isOidcApp = (value: unknown): value is OidcApp =>
  typeof value === 'string' && (OIDC_APPS as readonly string[]).includes(value);

/**
 * The app whose access decides who may sign in to a client. NoBookEnds
 * reads from Audiobookshelf, so it follows Audiobookshelf access.
 */
export const accessAppFor = (app: OidcApp): UserAccessApp =>
  app === 'nobookends' ? 'audiobookshelf' : app;

// The claims each scope adds to the tokens and the user info
export const OIDC_SCOPE_CLAIMS: Record<string, string[]> = {
  openid: ['sub'],
  profile: ['name', 'preferred_username', 'picture'],
  email: ['email', 'email_verified'],
  // Kavita reads its roles, libraries and age rating from these
  roles: ['role'],
  groups: ['groups', 'age_limit'],
  // Audiobookshelf asks for scopes named after its group and permission
  // claims
  abs_groups: ['abs_groups'],
  abs_permissions: ['abs_permissions'],
};

export interface OidcClaimsInput {
  userId: number;
  displayName: string;
  username: string;
  email: string;
  picture?: string;
  isAdmin: boolean;
  // Access to the app the client signs in to, null when there is none
  access: { enabled: boolean; libraryIds: string[] | null } | null;
  // Library names by id, for apps that grant libraries by name
  libraryNames?: Record<string, string>;
  ageLimit: AgeLimit | null;
  includeUnrated: boolean;
}

const hasAccess = (input: OidcClaimsInput): boolean =>
  input.isAdmin || !!input.access?.enabled;

/**
 * Kavita's roles: sign in, download and change password, a library-<name>
 * role per library and the age restriction. Kavita reads them when its
 * OpenID Connect setting "Sync user settings" is on.
 */
export const kavitaRoleClaims = (input: OidcClaimsInput): string[] => {
  if (input.isAdmin) {
    return ['Admin', 'Login', 'Download', 'Change Password'];
  }
  if (!hasAccess(input)) {
    return [];
  }

  const names = input.libraryNames ?? {};
  const ids =
    input.access?.libraryIds === null || input.access?.libraryIds === undefined
      ? Object.keys(names)
      : input.access.libraryIds;
  const libraries = ids
    .map((id) => names[id])
    .filter((name): name is string => !!name)
    .map((name) => `library-${name}`);

  return [
    'Login',
    'Download',
    'Change Password',
    ...libraries,
    ...toKavitaAgeRoles(input.ageLimit, input.includeUnrated),
  ];
};

/**
 * Audiobookshelf's advanced permissions claim, for listeners
 */
export const absPermissionsClaim = (input: OidcClaimsInput) => ({
  canDownload: true,
  canUpload: false,
  canDelete: false,
  canUpdate: false,
  canAccessExplicitContent: allowsExplicitContent(input.ageLimit),
  canAccessAllLibraries:
    input.access?.libraryIds === null || input.access?.libraryIds === undefined,
  canAccessAllTags: true,
  canCreateEReader: false,
  tagsAreDenylist: false,
  allowedLibraries: input.access?.libraryIds ?? [],
  allowedTags: [],
});

export const hasRealEmail = (email: string): boolean =>
  email.includes('@') && !email.endsWith('@allseerr.invalid');

/**
 * Every claim Allseerr can give for a person signing in to an app. The
 * provider hands out only the ones the requested scopes name.
 */
export const buildOidcClaims = (
  app: OidcApp,
  input: OidcClaimsInput
): Record<string, unknown> => {
  const claims: Record<string, unknown> = {
    sub: String(input.userId),
    name: input.displayName,
    preferred_username: input.username,
    groups: [
      input.isAdmin ? 'allseerr-admin' : 'allseerr-user',
      ...(hasAccess(input) ? [`allseerr-${app}`] : []),
    ],
    age_limit: input.isAdmin ? 'none' : (input.ageLimit ?? 'none'),
  };

  if (input.picture) {
    claims.picture = input.picture;
  }

  if (hasRealEmail(input.email)) {
    claims.email = input.email;
    // Plex and Jellyfin addresses are verified there, local ones by an admin
    claims.email_verified = true;
  }

  if (app === 'kavita') {
    claims.role = kavitaRoleClaims(input);
  }

  if (app === 'audiobookshelf' || app === 'nobookends') {
    claims.abs_groups = input.isAdmin
      ? ['admin']
      : hasAccess(input)
        ? ['user']
        : [];
    claims.abs_permissions = absPermissionsClaim(input);
  }

  return claims;
};
