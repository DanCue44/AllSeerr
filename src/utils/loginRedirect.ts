/**
 * Where sign in may send the user back to. Only pages that are opened from
 * outside Allseerr and need a signed in user are allowed, so a crafted link
 * can never send someone elsewhere after they sign in.
 */
const NEXT_PATH_PREFIXES = ['/nobookends/', '/signin/', '/invite/'];

const NEXT_MAX_LENGTH = 512;

// Kept for the tab while a sign in method leaves the login page
const NEXT_STORAGE_KEY = 'allseerr-login-next';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const isSafePath = (path: string): boolean =>
  NEXT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
  !path.includes('//') &&
  !path.includes('\\') &&
  !path.split('/').some((segment) => segment === '..' || segment === '.');

/**
 * The page to go to after sign in, or null when the value is missing or not
 * a relative path on the allowlist
 */
export const getSafeNextPath = (value: unknown): string | null => {
  const next = Array.isArray(value) ? value[0] : value;

  if (
    typeof next !== 'string' ||
    next.length > NEXT_MAX_LENGTH ||
    !next.startsWith('/') ||
    next.includes('\\') ||
    CONTROL_CHARACTERS.test(next)
  ) {
    return null;
  }

  const path = next.split(/[?#]/, 1)[0];

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return null;
  }

  if (
    !isSafePath(path) ||
    !isSafePath(decodedPath) ||
    CONTROL_CHARACTERS.test(decodedPath)
  ) {
    return null;
  }

  // The browser has to read it as a path on this site, too
  try {
    const base = 'http://allseerr.invalid';
    const url = new URL(next, base);

    if (url.origin !== base || !isSafePath(url.pathname)) {
      return null;
    }
  } catch {
    return null;
  }

  return next;
};

/**
 * The login page, with a way back to the page asked for when it is allowed
 */
export const getLoginPath = (returnTo?: string | null): string => {
  const next = getSafeNextPath(returnTo);

  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
};

/**
 * Keeps the page to return to for this tab, for sign in methods that leave
 * the login page and come back without its query
 */
export const rememberLoginNext = (value: unknown): void => {
  const next = getSafeNextPath(value);

  try {
    if (next) {
      window.sessionStorage.setItem(NEXT_STORAGE_KEY, next);
    }
  } catch {
    // Storage can be off, the query still works
  }
};

/**
 * The page to go to after sign in: the query's when it is allowed, else the
 * one kept for this tab, else the home page. Forgets the kept one.
 */
export const takeLoginNext = (value: unknown): string => {
  let stored: string | null = null;

  try {
    stored = window.sessionStorage.getItem(NEXT_STORAGE_KEY);
    window.sessionStorage.removeItem(NEXT_STORAGE_KEY);
  } catch {
    stored = null;
  }

  return getSafeNextPath(value) ?? getSafeNextPath(stored) ?? '/';
};
