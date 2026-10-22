import type {
  ReadingAppChoices,
  ReadingAppState,
  ReadingKind,
  UserAccessApp,
  UserAppAccountGrant,
  UserAppAccountStatus,
} from '@server/constants/userAccess';

// Kept free of server code, so the settings pages can use them too

export type AgeLimit = 'none' | 'teen' | 'tween' | 'kids';

export type OidcApp = 'audiobookshelf' | 'kavita' | 'komga' | 'nobookends';

export interface AppLibrary {
  id: string;
  name: string;
}

export interface UserAccessAppConnectionResponse {
  url: string;
  publicUrl: string;
  username: string;
  apiKeySet: boolean;
  passwordSet: boolean;
}

export interface UserAccessSettingsResponse {
  audiobookshelf: UserAccessAppConnectionResponse;
  kavita: UserAccessAppConnectionResponse;
  komga: UserAccessAppConnectionResponse;
  emailPasswords: boolean;
}

export interface PlexDefaultAppSettings {
  enabled: boolean;
  libraryIds: string[] | null;
}

export interface PlexDefaultAccessResponse {
  enabled: boolean;
  apps: Record<UserAccessApp, PlexDefaultAppSettings>;
  ageLimit: AgeLimit | null;
  includeUnrated: boolean;
}

export interface PlexDefaultChange {
  userId: number;
  displayName: string;
  app: UserAccessApp;
  change: 'granted' | 'removed';
}

export interface UserAccessAppInfo {
  app: UserAccessApp;
  name: string;
  connected: boolean;
  publicUrl: string | null;
  libraries: AppLibrary[];
  error: string | null;
}

export interface PersonAppAccess {
  enabled: boolean;
  libraryIds: string[] | null;
  status: UserAppAccountStatus;
  remoteUsername: string | null;
  lastError: string | null;
  syncedAt: Date | null;
  // admin, plex (the default for Plex users) or null for older accounts
  grantedBy: UserAppAccountGrant | null;
  // When the person asked for access and no admin has answered yet
  accessRequestedAt: Date | null;
}

export interface PersonAccess {
  userId: number;
  displayName: string;
  email: string;
  avatar: string;
  userType: number;
  isAdmin: boolean;
  ageLimit: AgeLimit | null;
  includeUnrated: boolean;
  apps: Record<UserAccessApp, PersonAppAccess>;
}

export interface NewAppPassword {
  username: string;
  password: string;
  emailed: boolean;
}

/**
 * New passwords made while saving, keyed by app. They are shown once and
 * never stored.
 */
export type NewPasswords = Partial<Record<UserAccessApp, NewAppPassword>>;

export interface PersonUpdateResult {
  person: PersonAccess;
  passwords: NewPasswords;
}

export type InviteApps = Partial<
  Record<UserAccessApp, { libraryIds: string[] | null }>
>;

export interface InviteSummary {
  id: number;
  label: string | null;
  apps: InviteApps;
  ageLimit: AgeLimit | null;
  includeUnrated: boolean;
  expiresAt: Date;
  redeemedAt: Date | null;
  redeemedBy: { id: number; displayName: string } | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: { id: number; displayName: string } | null;
}

export interface OidcClientResponse {
  app: OidcApp;
  clientId: string;
  redirectUris: string[];
  enabled: boolean;
}

export interface OidcSettingsResponse {
  enabled: boolean;
  // The issuer apps are given, null until the application address is set
  issuer: string | null;
  clients: OidcClientResponse[];
  // Redirect addresses each app uses, from its public address
  defaultRedirectUris: Record<OidcApp, string[]>;
}

/**
 * Where a person stands in a reading app, for their Reading apps settings
 * and NoBookEnds
 */
export interface ReadingAppStatus {
  app: UserAccessApp;
  name: string;
  // What the app is for, such as "Audiobooks and ebooks"
  purpose: string;
  // The kinds of books the admin picked this app for
  kinds: ReadingKind[];
  state: ReadingAppState;
  // The person's username in the app, once their account is ready
  username?: string;
  publicUrl?: string;
  message?: string;
  // Whether the app offers "Sign in with Allseerr"
  signInWithAllseerr: boolean;
}

export interface ReadingAppsResponse {
  apps: ReadingAppStatus[];
  // The app each kind of book is read or heard in
  readingApps: ReadingAppChoices;
}

export interface ReadingAppSetupResult {
  app: ReadingAppStatus;
  // The new password, shown once, when an account was made
  password?: NewAppPassword;
}
