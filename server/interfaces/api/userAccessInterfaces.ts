import type {
  UserAccessApp,
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
