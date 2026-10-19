export const NOBOOKENDS_DEVICE_LABEL_MAX_LENGTH = 60;

// Control characters, and the marks that reorder text
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * Cleans the device name the app sends, such as "iPhone 16", to plain
 * printable text of a sensible length. Null when nothing is left.
 */
export const sanitizeNoBookEndsDeviceLabel = (
  label: unknown
): string | null => {
  if (typeof label !== 'string') {
    return null;
  }

  const clean = Array.from(
    label
      .replace(UNSAFE_CHARACTERS, ' ')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
    .slice(0, NOBOOKENDS_DEVICE_LABEL_MAX_LENGTH)
    .join('')
    .trim();

  return clean || null;
};
