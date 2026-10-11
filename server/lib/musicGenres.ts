import ListenBrainzAPI, {
  getListenBrainzCoverUrl,
} from '@server/api/listenbrainz';
import type {
  LbReleaseGroup,
  LbReleaseGroupMetadata,
  LbTag,
} from '@server/api/listenbrainz/interfaces';
import cacheManager from '@server/lib/cache';
import { warmCoverArt } from '@server/lib/imageWarm';
import logger from '@server/logger';

interface MusicGenre {
  // A tag is in the genre when it is one of these, or ends with one of them
  // as its last word, so "indie rock" is rock and "k-pop" is pop
  roots: string[];
  // Tags in the genre that do not end with a root
  extra?: string[];
}

/**
 * The genres with a shelf on the music Discover page, keyed by the slug used
 * in the API path
 */
export const MUSIC_GENRES = {
  rock: {
    roots: ['rock'],
    extra: [
      'grunge',
      'punk',
      'post-punk',
      'new wave',
      'emo',
      'shoegaze',
      'britpop',
      'post-hardcore',
      'neo-psychedelia',
    ],
  },
  metal: {
    roots: ['metal', 'metalcore', 'deathcore'],
    extra: ['djent'],
  },
  pop: {
    roots: ['pop'],
  },
  'hip-hop': {
    roots: ['hip hop', 'hip-hop', 'rap', 'trap'],
    extra: ['grime', 'drill', 'boom bap'],
  },
  rnb: {
    roots: ['r&b', 'soul', 'funk'],
    extra: ['new jack swing'],
  },
  electronic: {
    roots: [
      'electronic',
      'electronica',
      'house',
      'techno',
      'trance',
      'edm',
      'dubstep',
      'ambient',
      'idm',
      'synthwave',
      'downtempo',
      'trip hop',
      'drum and bass',
      'breakbeat',
    ],
  },
  jazz: {
    roots: ['jazz', 'bop'],
    extra: ['bebop', 'swing', 'jazz fusion', 'jazz-funk', 'big band'],
  },
  country: {
    roots: ['country', 'bluegrass', 'americana'],
    extra: ['country pop', 'country rock', 'country folk', 'honky tonk'],
  },
} satisfies Record<string, MusicGenre>;

export type MusicGenreSlug = keyof typeof MUSIC_GENRES;

export const isMusicGenre = (genre: string): genre is MusicGenreSlug =>
  Object.prototype.hasOwnProperty.call(MUSIC_GENRES, genre);

/**
 * Whether a tag such as "alternative rock" belongs to a genre
 */
export const isTagInGenre = (tag: string, genre: MusicGenreSlug): boolean => {
  const { roots, extra = [] } = MUSIC_GENRES[genre] as MusicGenre;
  const normalized = tag.trim().toLowerCase();

  if (extra.includes(normalized)) {
    return true;
  }

  return roots.some(
    (root) =>
      normalized === root ||
      normalized.endsWith(` ${root}`) ||
      normalized.endsWith(`-${root}`)
  );
};

// The strongest genres of a release group, a few are enough to place it
const TOP_TAG_COUNT = 3;

const topGenreTags = (tags: LbTag[]): string[] =>
  tags
    .filter((tag) => tag.genre_mbid)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TAG_COUNT)
    .map((tag) => tag.tag.toLowerCase());

/**
 * The main genres of a release group: its own genre tags, or those of its
 * artists when it has none. Free form tags such as "seen live" are left out.
 */
export const getTopGenreTags = (metadata: LbReleaseGroupMetadata): string[] => {
  const own = topGenreTags(metadata.tag?.release_group ?? []);

  if (own.length > 0) {
    return own;
  }

  // An artist tag is listed once per artist, so the counts are added up
  const artistTags = new Map<string, LbTag>();

  for (const tag of metadata.tag?.artist ?? []) {
    const existing = artistTags.get(tag.tag);
    artistTags.set(tag.tag, {
      ...tag,
      count: (existing?.count ?? 0) + tag.count,
    });
  }

  return topGenreTags([...artistTags.values()]);
};

export interface MusicGenrePoolItem {
  id: string;
  title: string;
  artistId?: string;
  artistName: string;
  posterPath: string | null;
  albumType?: string;
  releaseDate?: string;
  genres: string[];
}

// Only albums and EPs are shelved, singles and compilations make up much of
// what is listened to
const SHELVED_TYPES = ['Album', 'EP'];

/**
 * Builds the pool of popular albums with their genres, in order of
 * popularity, from the most listened release groups and their metadata. A
 * release group listed in more than one range is kept once.
 */
export const buildMusicGenrePool = (
  releaseGroups: LbReleaseGroup[],
  metadata: Record<string, LbReleaseGroupMetadata>
): MusicGenrePoolItem[] => {
  const pool: MusicGenrePoolItem[] = [];
  const seen = new Set<string>();

  for (const releaseGroup of releaseGroups) {
    const id = releaseGroup.release_group_mbid;

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    const meta = metadata[id];

    if (!meta || !SHELVED_TYPES.includes(meta.release_group.type ?? '')) {
      continue;
    }

    const genres = getTopGenreTags(meta);

    if (genres.length === 0) {
      continue;
    }

    pool.push({
      id,
      title: releaseGroup.release_group_name,
      artistId: releaseGroup.artist_mbids[0],
      artistName: releaseGroup.artist_name,
      posterPath:
        getListenBrainzCoverUrl(releaseGroup) ??
        getListenBrainzCoverUrl(meta.release_group),
      albumType: meta.release_group.type ?? undefined,
      releaseDate: meta.release_group.date ?? undefined,
      genres,
    });
  }

  return pool;
};

// So one artist with a large following does not fill a shelf
const MAX_ALBUMS_PER_ARTIST = 2;

/**
 * The albums of the pool in a genre, most popular first, with at most a
 * couple from any one artist
 */
export const selectGenreAlbums = (
  pool: MusicGenrePoolItem[],
  genre: MusicGenreSlug
): MusicGenrePoolItem[] => {
  const perArtist = new Map<string, number>();

  return pool.filter((item) => {
    if (!item.genres.some((tag) => isTagInGenre(tag, genre))) {
      return false;
    }

    const artist = item.artistId ?? item.artistName;
    const count = perArtist.get(artist) ?? 0;

    if (count >= MAX_ALBUMS_PER_ARTIST) {
      return false;
    }

    perArtist.set(artist, count + 1);
    return true;
  });
};

// Current favorites first, then the classics that are always played
const POOL_RANGES = ['month', 'year', 'all_time'];
const POOL_RANGE_SIZE = 1000;
const METADATA_BATCH_SIZE = 100;
const METADATA_CONCURRENCY = 3;
const POOL_CACHE_KEY = 'music-genre-pool';
const POOL_TTL = 86400;

let poolRequest: Promise<MusicGenrePoolItem[]> | undefined;

const fetchMusicGenrePool = async (): Promise<MusicGenrePoolItem[]> => {
  const listenbrainz = new ListenBrainzAPI();
  const releaseGroups: LbReleaseGroup[] = [];

  for (const range of POOL_RANGES) {
    const data = await listenbrainz.getTopAlbums({
      range,
      count: POOL_RANGE_SIZE,
    });
    releaseGroups.push(...data.payload.release_groups);
  }

  const ids = [
    ...new Set(
      releaseGroups
        .map((releaseGroup) => releaseGroup.release_group_mbid)
        .filter((id): id is string => !!id)
    ),
  ];
  const batches: string[][] = [];

  for (let i = 0; i < ids.length; i += METADATA_BATCH_SIZE) {
    batches.push(ids.slice(i, i + METADATA_BATCH_SIZE));
  }

  const metadata: Record<string, LbReleaseGroupMetadata> = {};

  // A few batches at a time, to stay well inside the ListenBrainz rate limit
  for (let i = 0; i < batches.length; i += METADATA_CONCURRENCY) {
    const results = await Promise.all(
      batches
        .slice(i, i + METADATA_CONCURRENCY)
        .map((batch) =>
          listenbrainz.getReleaseGroupMetadata(batch).catch(() => ({}))
        )
    );

    for (const result of results) {
      Object.assign(metadata, result);
    }
  }

  return buildMusicGenrePool(releaseGroups, metadata);
};

/**
 * The pool of popular albums the genre shelves are picked from. It takes a
 * few dozen ListenBrainz requests to build, so it is kept for a day and
 * built once for every shelf that asks at the same time.
 */
export const getMusicGenrePool = async (): Promise<MusicGenrePoolItem[]> => {
  const cache = cacheManager.getCache('listenbrainz').data;
  const cached = cache.get<MusicGenrePoolItem[]>(POOL_CACHE_KEY);

  if (cached) {
    return cached;
  }

  if (!poolRequest) {
    poolRequest = fetchMusicGenrePool()
      .then((pool) => {
        if (pool.length > 0) {
          cache.set(POOL_CACHE_KEY, pool, POOL_TTL);
          // Covers for every shelf, so scrolling them does not wait on
          // Internet Archive
          warmCoverArt(pool.map((item) => item.posterPath));
        }

        return pool;
      })
      .catch((e) => {
        logger.debug('Something went wrong building the music genre pool', {
          label: 'ListenBrainz',
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw e;
      })
      .finally(() => {
        poolRequest = undefined;
      });
  }

  return poolRequest;
};
