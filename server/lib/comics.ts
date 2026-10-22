import ChaptarrAPI from '@server/api/servarr/chaptarr';
import type {
  TalearrComicLookupResult,
  TalearrComicRootFolder,
  TalearrComicSeriesSummary,
} from '@server/api/servarr/talearrComics';
import TalearrComicsAPI from '@server/api/servarr/talearrComics';
import { isTalearrService } from '@server/constants/bookService';
import type { ComicKind } from '@server/constants/media';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MetadataComic from '@server/entity/MetadataComic';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getDefaultChaptarr, getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import type { ComicResult } from '@server/models/Search';
import { truncate } from 'lodash';
import { In } from 'typeorm';

// How long the answer to whether comics are on is kept. The comics pages
// and the search ask on every load.
const STATUS_TTL_MS = 60_000;
// A failed answer is asked again sooner, so a restarted Talearr shows up
const STATUS_ERROR_TTL_MS = 15_000;

/**
 * Whether comics can be requested, and why not when they cannot
 */
export interface ComicsStatus {
  enabled: boolean;
  reason?: 'notTalearr' | 'noServer' | 'unavailable';
  message?: string;
}

/**
 * Comic ids: al-<AniList id> for series AniList knows, as most manga, and
 * hc-<Hardcover series id> for the rest. AniList wins when a series has both,
 * as Talearr matches series on it first.
 */
export const comicIdOf = (series: {
  aniListId?: number | null;
  hardcoverSeriesId?: number | null;
}): string | undefined =>
  series.aniListId
    ? `al-${series.aniListId}`
    : series.hardcoverSeriesId
      ? `hc-${series.hardcoverSeriesId}`
      : undefined;

const COMIC_ID_REGEX = /^(al|hc)-([1-9][0-9]{0,9})$/;

export const isComicId = (value: unknown): value is string =>
  typeof value === 'string' && COMIC_ID_REGEX.test(value);

export const parseComicId = (
  comicId: string
): { aniListId?: number; hardcoverSeriesId?: number } | undefined => {
  const match = COMIC_ID_REGEX.exec(comicId);

  if (!match) {
    return undefined;
  }

  const id = Number(match[2]);
  return match[1] === 'al' ? { aniListId: id } : { hardcoverSeriesId: id };
};

/**
 * The Talearr server comics go to: the default book server, only while book
 * requests go to Talearr
 */
export const getComicsServer = (): ChaptarrSettings | undefined => {
  const settings = getSettings();

  return isTalearrService(settings.bookService)
    ? getDefaultChaptarr(settings.chaptarr)
    : undefined;
};

export const getComicsApi = (server: ChaptarrSettings): TalearrComicsAPI =>
  new TalearrComicsAPI({
    apiKey: server.apiKey,
    url: ChaptarrAPI.buildUrl(server, '/api/v1'),
  });

let cachedStatus: { status: ComicsStatus; until: number; key: string } | null =
  null;

export const resetComicsStatusCache = (): void => {
  cachedStatus = null;
};

/**
 * Whether comics are on: book requests go to Talearr and Talearr's comics
 * library answers. Kept for a minute, see STATUS_TTL_MS.
 */
export const getComicsStatus = async (): Promise<ComicsStatus> => {
  const settings = getSettings();

  if (!isTalearrService(settings.bookService)) {
    return { enabled: false, reason: 'notTalearr' };
  }

  const server = getComicsServer();

  if (!server) {
    return { enabled: false, reason: 'noServer' };
  }

  // A changed server is asked again at once
  const key = `${server.id}:${server.hostname}:${server.port}`;
  if (
    cachedStatus &&
    cachedStatus.key === key &&
    cachedStatus.until > Date.now()
  ) {
    return cachedStatus.status;
  }

  let status: ComicsStatus;
  try {
    const answer = await getComicsApi(server).getStatus();
    status = answer.available
      ? { enabled: true }
      : { enabled: false, reason: 'unavailable', message: answer.reason };
  } catch (e) {
    status = {
      enabled: false,
      reason: 'unavailable',
      message: e instanceof Error ? e.message : String(e),
    };
  }

  cachedStatus = {
    status,
    key,
    until: Date.now() + (status.enabled ? STATUS_TTL_MS : STATUS_ERROR_TTL_MS),
  };

  return status;
};

const toMetadata = (
  comicId: string,
  result: TalearrComicLookupResult
): MetadataComic =>
  new MetadataComic({
    comicId,
    kind: result.kind,
    title: result.title,
    alternateTitles: result.alternateTitles.length
      ? result.alternateTitles
      : null,
    year: result.year ?? null,
    status: result.status ?? null,
    volumes: result.volumes ?? null,
    authors: result.authors ?? null,
    overview: result.overview ?? null,
    coverUrl: result.coverUrl ?? null,
    ageRating: result.ageRating ?? null,
    isAdult: result.isAdult,
    aniListId: result.aniListId ?? null,
    hardcoverSeriesId: result.hardcoverSeriesId ?? null,
  });

/**
 * Keeps what the lookup said about each series, so its page can be shown
 * later. Talearr has no lookup by id.
 */
export const saveComicMetadata = async (
  results: TalearrComicLookupResult[]
): Promise<MetadataComic[]> => {
  const repository = getRepository(MetadataComic);
  const byId = new Map<string, TalearrComicLookupResult>();

  results.forEach((result) => {
    const comicId = comicIdOf(result);
    if (comicId && !byId.has(comicId)) {
      byId.set(comicId, result);
    }
  });

  if (byId.size === 0) {
    return [];
  }

  const existing = await repository.find({
    where: { comicId: In([...byId.keys()]) },
  });
  const existingById = new Map(existing.map((row) => [row.comicId, row]));

  const rows = [...byId.entries()].map(([comicId, result]) => {
    const row = toMetadata(comicId, result);
    const saved = existingById.get(comicId);

    if (saved) {
      row.id = saved.id;
      row.createdAt = saved.createdAt;
    }

    return row;
  });

  return repository.save(rows);
};

export const mapComicResult = (
  metadata: MetadataComic,
  media?: Media
): ComicResult => ({
  id: metadata.comicId,
  mediaType: 'comic',
  kind: metadata.kind,
  title: metadata.title,
  authors: metadata.authors ?? undefined,
  year: metadata.year ?? undefined,
  volumes: metadata.volumes ?? undefined,
  ageRating: metadata.ageRating ?? undefined,
  isAdult: metadata.isAdult,
  posterPath: metadata.coverUrl,
  mediaInfo: media,
});

/**
 * Finds a series in Talearr's library, matched on the ids it was added with
 */
export const findLibrarySeries = (
  library: TalearrComicSeriesSummary[],
  comicId: string
): TalearrComicSeriesSummary | undefined => {
  const ids = parseComicId(comicId);

  if (!ids) {
    return undefined;
  }

  return library.find((summary) =>
    ids.aniListId
      ? summary.series.aniListId === ids.aniListId
      : summary.series.hardcoverSeriesId === ids.hardcoverSeriesId
  );
};

/**
 * The status a requested series has from what Talearr holds of it: every
 * volume, some of them or none yet
 */
export const getLibraryStatus = (
  summary: TalearrComicSeriesSummary
): MediaStatus =>
  summary.volumeCount > 0 && summary.downloadedCount >= summary.volumeCount
    ? MediaStatus.AVAILABLE
    : summary.downloadedCount > 0
      ? MediaStatus.PARTIALLY_AVAILABLE
      : MediaStatus.PROCESSING;

// Statuses a requested series is followed in, until every volume is in
const FOLLOWED_STATUSES = [
  MediaStatus.PENDING,
  MediaStatus.PROCESSING,
  MediaStatus.PARTIALLY_AVAILABLE,
];

/**
 * Moves a requested series on to partly or fully available once Talearr
 * has its volumes, never back. Answers whether the media changed. The media
 * subscriber completes the requests once every volume is in.
 */
export const applyLibraryStatus = async (
  media: Media,
  summary: TalearrComicSeriesSummary
): Promise<boolean> => {
  const status = getLibraryStatus(summary);

  if (
    !FOLLOWED_STATUSES.includes(media.status) ||
    status === media.status ||
    status === MediaStatus.PROCESSING
  ) {
    return false;
  }

  // Saved without its requests, so the save does not cascade into them
  const repository = getRepository(Media);
  const plain = await repository.findOneOrFail({ where: { id: media.id } });
  plain.status = status;
  plain.externalServiceId = plain.externalServiceId ?? summary.series.id;
  await repository.save(plain);

  return true;
};

/**
 * Follows the requested series in Talearr's library, as part of the
 * Chaptarr scan. Answers how many changed.
 */
export const syncComicAvailability = async (): Promise<number> => {
  const server = getComicsServer();

  if (!server) {
    return 0;
  }

  const media = await getRepository(Media).find({
    where: { mediaType: MediaType.COMIC, status: In(FOLLOWED_STATUSES) },
  });

  if (media.length === 0) {
    return 0;
  }

  const library = await getComicsApi(server).getSeries();
  let changed = 0;

  for (const item of media) {
    const summary = item.comicId
      ? findLibrarySeries(library, item.comicId)
      : undefined;

    if (summary && (await applyLibraryStatus(item, summary))) {
      changed++;
    }
  }

  return changed;
};

const kindMatches = (folder: TalearrComicRootFolder, kind: ComicKind) =>
  folder.kind?.toLowerCase() === kind || folder.kind?.toLowerCase() === 'any';

/**
 * The comics root folder a series is filed in. A folder of the series' kind
 * beats one for any kind. A person with an age limit gets the kids library
 * when there is one, everyone else the main library.
 */
export const pickComicRootFolder = (
  folders: TalearrComicRootFolder[],
  kind: ComicKind,
  { preferKids = false }: { preferKids?: boolean } = {}
): TalearrComicRootFolder | undefined => {
  const candidates = folders.filter((folder) => kindMatches(folder, kind));
  const rank = (folder: TalearrComicRootFolder) =>
    (folder.isKids === preferKids ? 0 : 2) +
    (folder.kind?.toLowerCase() === kind ? 0 : 1);

  return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
};

/**
 * Searches Talearr for comic or manga series. Without a kind both are
 * searched and mixed. Talearr searches Hardcover the same way for both
 * kinds, so a series only Hardcover knows comes back twice; it is kept as a
 * comic, and the person requesting it can file it as manga instead. Series
 * from AniList are manga.
 */
export const searchComics = async ({
  query,
  kind,
}: {
  query: string;
  kind?: ComicKind;
}): Promise<{ results: MetadataComic[]; notices: string[] }> => {
  const server = getComicsServer();

  if (!server) {
    return { results: [], notices: [] };
  }

  const api = getComicsApi(server);
  const kinds: ComicKind[] = kind ? [kind] : ['manga', 'comic'];
  const answers = await Promise.all(
    kinds.map((each) =>
      api.lookup(query, each).catch((e) => {
        logger.debug('Talearr comics lookup failed', {
          label: 'Comics',
          kind: each,
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        return { results: [], notices: [] };
      })
    )
  );

  const results = answers.flatMap((answer) => answer.results);
  const ordered = kind
    ? results
    : [
        ...results.filter((result) => !!result.aniListId),
        ...results.filter(
          (result) => !result.aniListId && result.kind === 'comic'
        ),
        ...results.filter(
          (result) => !result.aniListId && result.kind !== 'comic'
        ),
      ];
  const saved = await saveComicMetadata(ordered);

  return {
    results: saved,
    notices: [...new Set(answers.flatMap((answer) => answer.notices))],
  };
};

export interface ComicNotificationDetails {
  subject: string;
  message?: string;
  image?: string;
  ageRating?: string;
}

// AniList descriptions carry simple markup, such as <br> and <i>
export const comicPlainText = (text: string): string =>
  text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Builds the subject, message and cover of a comic notification from what
 * the lookup saved of the series
 */
export const getComicNotificationDetails = async (
  comicId: string
): Promise<ComicNotificationDetails> => {
  const metadata = await getRepository(MetadataComic).findOne({
    where: { comicId },
  });

  if (!metadata) {
    return { subject: comicId };
  }

  const overview = metadata.overview ? comicPlainText(metadata.overview) : '';

  return {
    subject: `${metadata.title}${
      metadata.authors ? ` by ${metadata.authors}` : ''
    }${metadata.year ? ` (${metadata.year})` : ''}`,
    message: overview
      ? truncate(overview, { length: 500, separator: /\s/, omission: '…' })
      : undefined,
    image: metadata.coverUrl ?? undefined,
    ageRating:
      metadata.ageRating && metadata.ageRating !== 'Unknown'
        ? metadata.ageRating
        : undefined,
  };
};

/**
 * Adds a requested series to Talearr's comics library, monitoring every
 * volume, and has Talearr search for them. Talearr searches by itself when
 * its comics settings say so, so it is only asked to when they do not.
 * Answers Talearr's id of the series.
 */
export const sendComicToTalearr = async (
  server: ChaptarrSettings,
  {
    comicId,
    kind,
    preferKids = false,
  }: { comicId: string; kind: ComicKind; preferKids?: boolean }
): Promise<{ seriesId: number; alreadyInLibrary: boolean }> => {
  const ids = parseComicId(comicId);

  if (!ids) {
    throw new Error(`Unknown comic id ${comicId}`);
  }

  const api = getComicsApi(server);
  const library = await api.getSeries();
  const existing = findLibrarySeries(library, comicId);

  if (existing) {
    return { seriesId: existing.series.id, alreadyInLibrary: true };
  }

  const folder = pickComicRootFolder(await api.getRootFolders(), kind, {
    preferKids,
  });

  if (!folder) {
    throw new Error(
      `Talearr has no comics root folder for ${kind}. Add one in Talearr under Comics > Settings.`
    );
  }

  const series = await api.addSeries({
    ...ids,
    kind,
    rootFolderId: folder.id,
    monitor: 'all',
  });

  if (!(await api.searchesOnAdd().catch(() => true))) {
    await api.searchSeries(series.id);
  }

  return { seriesId: series.id, alreadyInLibrary: false };
};
