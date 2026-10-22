import { getSettings } from '@server/lib/settings';
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';

// Marks a value this module sealed, so older plain values can be told apart
const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const keyFor = (secret: string): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, 'allseerr', 'app-sign-in-keys', 32));

/**
 * Seals a secret, such as a key an app made for a person, with AES-256-GCM
 * under a key derived from Allseerr's own secret, so a copy of the database
 * alone does not give it away
 */
export const sealSecret = (
  plain: string,
  secret: string = getSettings().appKeySecret
): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64')}`;
};

/**
 * Opens a sealed secret. A value from before sealing comes back as it is,
 * marked legacy so it can be sealed. Null when it was sealed under another
 * secret or changed.
 */
export const openSecret = (
  value: string,
  secret: string = getSettings().appKeySecret
): { plain: string; legacy: boolean } | null => {
  if (!value.startsWith(PREFIX)) {
    return { plain: value, legacy: true };
  }

  try {
    const data = Buffer.from(value.slice(PREFIX.length), 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFor(secret),
      data.subarray(0, IV_BYTES)
    );
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));

    return {
      plain: Buffer.concat([
        decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8'),
      legacy: false,
    };
  } catch {
    return null;
  }
};
