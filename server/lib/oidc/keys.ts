import { getSettings } from '@server/lib/settings';
import { generateKeyPairSync, randomUUID } from 'crypto';

/**
 * The keys Allseerr signs OpenID Connect tokens with, made once and kept in
 * the settings next to the session secret
 */
export const getOidcJwks = async (): Promise<{
  keys: Record<string, unknown>[];
}> => {
  const settings = getSettings();

  if (settings.oidcJwks?.keys?.length) {
    return settings.oidcJwks;
  }

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' }) as Record<string, unknown>;

  settings.oidcJwks = {
    keys: [{ ...jwk, kid: randomUUID(), alg: 'RS256', use: 'sig' }],
  };
  await settings.save();

  return settings.oidcJwks;
};
