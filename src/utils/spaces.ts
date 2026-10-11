import type { SpaceMediaType } from './discoverMediaFilter';

/**
 * Each media type has a space of its own: Discover rows, a Browse grid, what
 * is in the library and what is coming up. The For You home at / mixes them.
 */
export const SPACE_KEYS = ['movies', 'series', 'music', 'books'] as const;

export type SpaceKey = (typeof SPACE_KEYS)[number];

export const SPACE_SECTIONS = [
  'discover',
  'browse',
  'library',
  'upcoming',
] as const;

export type SpaceSection = (typeof SPACE_SECTIONS)[number];

interface SpaceDefinition {
  mediaType: SpaceMediaType;
  /** Path of the space's Discover page; the other sections sit below it */
  path: string;
  /** Title pages and older browse pages that count as part of the space */
  matches: RegExp;
  sections: readonly SpaceSection[];
}

export const SPACES: Record<SpaceKey, SpaceDefinition> = {
  movies: {
    mediaType: 'movie',
    path: '/movies',
    // Collections are groups of movies
    matches: /^\/(movies|movie|collection|discover\/movies)(\/|$)/,
    sections: SPACE_SECTIONS,
  },
  series: {
    mediaType: 'tv',
    path: '/series',
    matches: /^\/(series|tv|discover\/tv)(\/|$)/,
    sections: SPACE_SECTIONS,
  },
  music: {
    mediaType: 'music',
    path: '/music',
    matches: /^\/(music|artist|discover\/music)(\/|$)/,
    sections: SPACE_SECTIONS,
  },
  books: {
    mediaType: 'book',
    path: '/books',
    matches: /^\/(books|book|author|discover\/books)(\/|$)/,
    sections: SPACE_SECTIONS,
  },
};

/**
 * The space a page belongs to, so the matching tab stays lit on its title
 * pages (a movie page lights Movies, an album or artist lights Music).
 * Works on both real paths and Next.js route patterns.
 */
export const getSpaceForPath = (pathname: string): SpaceKey | undefined =>
  SPACE_KEYS.find((key) => SPACES[key].matches.test(pathname));

export const getSpaceForMediaType = (mediaType: SpaceMediaType): SpaceKey =>
  SPACE_KEYS.find((key) => SPACES[key].mediaType === mediaType) ?? 'movies';

export const getSpaceSectionPath = (
  space: SpaceKey,
  section: SpaceSection
): string =>
  section === 'discover'
    ? SPACES[space].path
    : `${SPACES[space].path}/${section}`;

/** The section of a space a path is on, or undefined outside the spaces. */
export const getSpaceSectionForPath = (
  pathname: string
): { space: SpaceKey; section: SpaceSection } | undefined => {
  for (const space of SPACE_KEYS) {
    const { path, sections } = SPACES[space];

    if (pathname === path || pathname === `${path}/`) {
      return { space, section: 'discover' };
    }

    const section = sections.find(
      (candidate) =>
        candidate !== 'discover' &&
        (pathname === `${path}/${candidate}` ||
          pathname === `${path}/${candidate}/`)
    );

    if (section) {
      return { space, section };
    }
  }

  return undefined;
};

/**
 * Where the old browse pages went. The movie and series pages were filter
 * grids, so they land on Browse (keeping their filters); the music and books
 * pages were rows, so they land on the space itself.
 */
export const LEGACY_SPACE_REDIRECTS: Record<string, string> = {
  '/discover/movies': getSpaceSectionPath('movies', 'browse'),
  '/discover/tv': getSpaceSectionPath('series', 'browse'),
  '/discover/music': SPACES.music.path,
  '/discover/books': SPACES.books.path,
};

/** The spaces on offer: music needs Lidarr and books need LazyLibrarian. */
export const getAvailableSpaces = ({
  musicEnabled,
  booksEnabled,
}: {
  musicEnabled: boolean;
  booksEnabled: boolean;
}): SpaceKey[] =>
  SPACE_KEYS.filter(
    (key) =>
      (key !== 'music' || musicEnabled) && (key !== 'books' || booksEnabled)
  );

export type PhoneTabKey = 'home' | SpaceKey | 'requests' | 'library';

const PHONE_TAB_SLOTS = 5;

/**
 * The phone tab bar: For You and every space. Slots that a missing music or
 * books server leaves free go to Requests, then Library; otherwise those two
 * live in the top bar and the More sheet.
 */
export const getPhoneTabs = (spaces: SpaceKey[]): PhoneTabKey[] =>
  (['home', ...spaces, 'requests', 'library'] as PhoneTabKey[]).slice(
    0,
    PHONE_TAB_SLOTS
  );
