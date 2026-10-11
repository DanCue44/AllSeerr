import { createHash, randomBytes } from 'crypto';

// Personal keys carry a prefix so they can never collide with the
// application API key and are easy to spot in a config file
export const USER_API_KEY_PREFIX = 'asu_';

export const generateUserApiKey = (): string =>
  `${USER_API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;

export const hashUserApiKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

export const isUserApiKey = (key: string | undefined): key is string =>
  !!key && key.startsWith(USER_API_KEY_PREFIX) && key.length > 20;
