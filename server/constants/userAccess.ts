// Apps whose accounts Allseerr can manage for the people it knows
export const USER_ACCESS_APPS = ['audiobookshelf', 'kavita', 'komga'] as const;

export type UserAccessApp = (typeof USER_ACCESS_APPS)[number];

export const isUserAccessApp = (value: unknown): value is UserAccessApp =>
  typeof value === 'string' &&
  (USER_ACCESS_APPS as readonly string[]).includes(value);

export const USER_ACCESS_APP_NAMES: Record<UserAccessApp, string> = {
  audiobookshelf: 'Audiobookshelf',
  kavita: 'Kavita',
  komga: 'Komga',
};

/**
 * Where an account in an app stands: none yet, working, turned off because
 * access was taken away, or failed to sync
 */
export enum UserAppAccountStatus {
  NONE = 'none',
  ACTIVE = 'active',
  DISABLED = 'disabled',
  ERROR = 'error',
}

/**
 * Who gave a person an app: an admin, on purpose, or the default access for
 * everyone with access to the Plex server. Explicit choices always win.
 */
export enum UserAppAccountGrant {
  ADMIN = 'admin',
  PLEX = 'plex',
}

// How long an invite link can be used, unless the admin picks another time
export const DEFAULT_INVITE_DAYS = 7;
export const MAX_INVITE_DAYS = 90;
