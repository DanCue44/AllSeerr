import ChaptarrAPI from '@server/api/servarr/chaptarr';
import { isTalearrService } from '@server/constants/bookService';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  SeedingResponse,
  SeedingState,
  SeedingSummary,
  SeedingTorrent,
  TalearrSeeding,
  TrackerAccount,
} from '@server/interfaces/api/downloadInterfaces';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getDefaultChaptarr, getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { In } from 'typeorm';

// Talearr asks the download client and the tracker for each answer, so it
// is asked at most this often however many admins have the page open
export const SEEDING_CACHE_MS = 30 * 1000;

const SEEDING_STATES: SeedingState[] = [
  'seeding',
  'stalled',
  'queued',
  'paused',
  'checking',
  'error',
  'downloading',
];

const UNSUPPORTED: SeedingResponse = { supported: false };

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asCount = (value: unknown): number => Math.max(0, asNumber(value) ?? 0);

const asId = (value: unknown): number | null => {
  const id = asNumber(value);
  return id !== null && id > 0 ? id : null;
};

const parseState = (value: unknown): SeedingState =>
  SEEDING_STATES.find((state) => state === String(value ?? '').toLowerCase()) ??
  'error';

export const parseSeedingTorrent = (raw: RawRecord): SeedingTorrent => {
  const mediaType = String(raw.mediaType ?? '').toLowerCase();

  return {
    downloadId: asText(raw.downloadId) ?? '',
    title: asText(raw.title) ?? '',
    bookId: asId(raw.bookId),
    bookTitle: asText(raw.bookTitle),
    authorName: asText(raw.authorName),
    mediaType:
      mediaType === 'audiobook' || mediaType === 'ebook' ? mediaType : null,
    indexer: asText(raw.indexer),
    isPrivateTracker: raw.isPrivateTracker === true,
    downloadClient: asText(raw.downloadClient),
    state: parseState(raw.state),
    size: asCount(raw.size),
    uploaded: asCount(raw.uploaded),
    ratio: asCount(raw.ratio),
    seedingSeconds: asCount(raw.seedingSeconds),
    requiredSeedingSeconds: asNumber(raw.requiredSeedingSeconds),
    seedGoalSeconds: asNumber(raw.seedGoalSeconds),
    requirementMet: raw.requirementMet === true,
    atRisk: raw.atRisk === true,
    riskReason: asText(raw.riskReason),
    addedAt: asText(raw.addedAt),
    completedAt: asText(raw.completedAt),
  };
};

const parseTrackerAccount = (raw: unknown): TrackerAccount | null =>
  isRecord(raw)
    ? {
        userClass: asText(raw.userClass),
        isVip: raw.isVip === true,
        unsatisfied: asNumber(raw.unsatisfied),
        unsatisfiedLimit: asNumber(raw.unsatisfiedLimit),
        wedges: asNumber(raw.wedges),
        bonusPoints: asNumber(raw.bonusPoints),
        checkedAt: asText(raw.checkedAt),
      }
    : null;

/**
 * Reads Talearr's seeding answer, or undefined when it is not one. Missing
 * totals are counted from the torrents.
 */
export const parseTalearrSeeding = (
  raw: unknown
): TalearrSeeding | undefined => {
  if (!isRecord(raw) || !Array.isArray(raw.torrents)) {
    return undefined;
  }

  const torrents = raw.torrents
    .filter(isRecord)
    .map(parseSeedingTorrent)
    .filter((torrent) => !!torrent.downloadId);
  const summary = isRecord(raw.summary) ? raw.summary : {};
  const counted: SeedingSummary = {
    total: torrents.length,
    seeding: torrents.filter((torrent) => torrent.state === 'seeding').length,
    atRisk: torrents.filter((torrent) => torrent.atRisk).length,
    privateUnsatisfied: torrents.filter(
      (torrent) => torrent.isPrivateTracker && !torrent.requirementMet
    ).length,
  };

  return {
    generatedAt: asText(raw.generatedAt),
    torrents,
    summary: {
      total: asNumber(summary.total) ?? counted.total,
      seeding: asNumber(summary.seeding) ?? counted.seeding,
      atRisk: asNumber(summary.atRisk) ?? counted.atRisk,
      privateUnsatisfied:
        asNumber(summary.privateUnsatisfied) ?? counted.privateUnsatisfied,
    },
    // Talearr sends the tracker account as `mam`
    trackerAccount: parseTrackerAccount(raw.mam),
  };
};

/**
 * Adds the AllSeerr book of each torrent Talearr matched to a book, for
 * its cover and link
 */
const linkBooks = async (
  server: ChaptarrSettings,
  torrents: SeedingTorrent[]
): Promise<void> => {
  const bookIds = [
    ...new Set(
      torrents
        .map((torrent) => torrent.bookId)
        .filter((id): id is number => id !== null)
    ),
  ];

  if (!bookIds.length) {
    return;
  }

  // The same server can be set up twice, such as for two profiles
  const serverIds = getSettings()
    .chaptarr.filter(
      (other) =>
        other.hostname === server.hostname &&
        other.port === server.port &&
        other.baseUrl === server.baseUrl
    )
    .map((other) => other.id);

  const medias = await getRepository(Media).find({
    where: [
      {
        mediaType: MediaType.BOOK,
        serviceId: In(serverIds),
        externalServiceId: In(bookIds),
      },
      {
        mediaType: MediaType.BOOK,
        serviceId: In(serverIds),
        externalServiceIdAudio: In(bookIds),
      },
    ],
  });

  for (const torrent of torrents) {
    const media = medias.find(
      (m) =>
        torrent.bookId !== null &&
        (torrent.mediaType === 'ebook'
          ? m.externalServiceId === torrent.bookId
          : torrent.mediaType === 'audiobook'
            ? m.externalServiceIdAudio === torrent.bookId
            : m.externalServiceId === torrent.bookId ||
              m.externalServiceIdAudio === torrent.bookId)
    );

    if (media) {
      torrent.mediaId = media.id;
      torrent.olId = media.olId ?? undefined;
    }
  }
};

/**
 * Asks Talearr what it seeds, unsupported when the book service is not
 * Talearr or the Talearr server has no seeding route yet
 */
export const collectSeeding = async (): Promise<SeedingResponse> => {
  const settings = getSettings();
  const server = isTalearrService(settings.bookService)
    ? getDefaultChaptarr(settings.chaptarr)
    : undefined;

  if (!server) {
    return UNSUPPORTED;
  }

  const api = new ChaptarrAPI({
    apiKey: server.apiKey,
    url: ChaptarrAPI.buildUrl(server, '/api/v1'),
  });
  const raw = await api.getTalearrSeeding();

  if (raw === undefined) {
    return UNSUPPORTED;
  }

  const seeding = parseTalearrSeeding(raw);

  if (!seeding) {
    throw new Error('Talearr sent a seeding answer AllSeerr cannot read');
  }

  try {
    await linkBooks(server, seeding.torrents);
  } catch (e) {
    // Covers and links are extras, the torrents are shown without them
    logger.warn('Could not match the seeding torrents to books', {
      label: 'Downloads',
      errorMessage: e.message,
    });
  }

  return { supported: true, ...seeding };
};

let cache: { at: number; data: SeedingResponse } | undefined;
let pending: Promise<SeedingResponse> | undefined;

export const clearSeedingCache = (): void => {
  cache = undefined;
};

/**
 * What Talearr seeds, answered from a 30 second cache. Callers asking at
 * the same time share one request.
 */
export const getSeeding = async ({
  maxAgeMs = SEEDING_CACHE_MS,
  now = Date.now(),
}: { maxAgeMs?: number; now?: number } = {}): Promise<SeedingResponse> => {
  if (cache && now - cache.at < maxAgeMs) {
    return cache.data;
  }

  if (!pending) {
    pending = collectSeeding()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        pending = undefined;
      });
  }

  return pending;
};
