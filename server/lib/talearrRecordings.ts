import type {
  ChaptarrBook,
  TalearrAddRecordingResult,
  TalearrRecording,
  TalearrRecordingCandidate,
  TalearrRecordings,
} from '@server/api/servarr/chaptarr';
import ChaptarrAPI, { getBookFileCount } from '@server/api/servarr/chaptarr';
import type {
  BookRecordingAbridged,
  BookRecordingKind,
} from '@server/constants/bookRecording';
import { MAX_RECORDING_NARRATOR_LENGTH } from '@server/constants/bookRecording';
import { isTalearrService } from '@server/constants/bookService';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { runInBackground } from '@server/utils/backgroundTasks';
import serviceQueue, { chaptarrKey } from '@server/utils/serviceQueue';
import { transactionSettled } from '@server/utils/transactionSettled';
import type { EntityManager } from 'typeorm';
import { In, IsNull, Not } from 'typeorm';

const LABEL = 'TaleArr Recordings';

// The name TaleArr keeps as the source of a recording request
export const RECORDING_REQUESTED_BY = 'allseerr';

// The book pages and the app wait this long for TaleArr at most
const LOOKUP_TIMEOUT_MS = 8_000;

const LIVE_STATUSES = [MediaStatus.AVAILABLE, MediaStatus.PARTIALLY_AVAILABLE];

export interface BookRecordingSummary {
  bookId: number;
  role: 'primary' | 'additional';
  narrators: string[];
  abridged: BookRecordingAbridged;
  runtimeMinutes: number | null;
  publisher: string | null;
  releaseDate: string | null;
  asin: string | null;
  hasFiles: boolean;
  monitored: boolean;
  // AVAILABLE with files, PROCESSING while TaleArr looks for them
  status: MediaStatus;
}

export interface BookRecordingCandidateSummary {
  editionId: number;
  narrators: string[];
  abridged: BookRecordingAbridged;
  runtimeMinutes: number | null;
  publisher: string | null;
  releaseDate: string | null;
  asin: string | null;
}

export interface RecordingRequestSummary {
  id: number;
  status: MediaRequestStatus;
  recording: BookRecordingKind;
  narrator: string | null;
  editionId: number | null;
  requestedBy: { id: number; displayName: string };
  createdAt: Date;
  updatedAt: Date;
  declineReason: string | null;
}

export type RecordingOptionReason = 'have' | 'none' | 'requested';

export interface RecordingOption {
  available: boolean;
  // Why the option is closed: the recording is there already, TaleArr
  // knows no such edition, or it was requested already
  reason?: RecordingOptionReason;
}

export type BookRecordingsUnsupportedReason =
  // TaleArr is not the book service
  | 'service'
  // The audiobook is not available in TaleArr yet
  | 'unavailable'
  // TaleArr could not be reached
  | 'unreachable'
  // The server has no recordings route, such as stock Chaptarr
  | 'unsupported';

export interface BookRecordingsResponse {
  supported: boolean;
  reason?: BookRecordingsUnsupportedReason;
  recordings: BookRecordingSummary[];
  candidates: BookRecordingCandidateSummary[];
  requests: RecordingRequestSummary[];
  // Whether the user may request at least one recording now
  canRequest: boolean;
  options: {
    unabridged: RecordingOption;
    abridged: RecordingOption;
    // Narrators of candidate editions that are neither a recording nor
    // requested yet
    narrator: RecordingOption & { narrators: string[] };
    edition: RecordingOption;
  };
}

export interface RecordingTarget {
  server: ChaptarrSettings;
  // TaleArr's id of the book's audiobook
  bookId: number;
}

export const isActiveRecordingRequest = (request: {
  recording?: string | null;
  status: MediaRequestStatus;
}): boolean =>
  !!request.recording &&
  request.status !== MediaRequestStatus.DECLINED &&
  request.status !== MediaRequestStatus.COMPLETED;

const normalizeNarrator = (narrator?: string | null): string =>
  (narrator ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

export const cleanNarrator = (narrator?: string | null): string | null => {
  const clean = narrator?.replace(/\s+/g, ' ').trim();

  return clean ? clean.slice(0, MAX_RECORDING_NARRATOR_LENGTH) : null;
};

/**
 * Whether two recording requests ask for the same recording. One unabridged
 * and one abridged request at a time, narrators and editions each on their
 * own.
 */
export const isSameRecording = (
  a: {
    recording?: string | null;
    recordingNarrator?: string | null;
    recordingEditionId?: number | null;
  },
  b: {
    recording?: string | null;
    recordingNarrator?: string | null;
    recordingEditionId?: number | null;
  }
): boolean => {
  if (!a.recording || a.recording !== b.recording) {
    return false;
  }

  if (a.recording === 'edition') {
    return a.recordingEditionId === b.recordingEditionId;
  }

  if (a.recording === 'narrator') {
    return (
      normalizeNarrator(a.recordingNarrator) ===
      normalizeNarrator(b.recordingNarrator)
    );
  }

  return true;
};

/**
 * The TaleArr server and book a recording of a book is asked for on: the
 * server holding the book's audiobook, once that is available
 */
export const getRecordingTarget = (
  media?: Pick<
    Media,
    'serviceId' | 'statusAudio' | 'externalServiceIdAudio'
  > | null
): RecordingTarget | undefined => {
  const settings = getSettings();

  if (
    !isTalearrService(settings.bookService) ||
    !media ||
    !LIVE_STATUSES.includes(media.statusAudio) ||
    !media.externalServiceIdAudio ||
    media.serviceId === null ||
    media.serviceId === undefined
  ) {
    return undefined;
  }

  const server = settings.chaptarr.find(
    (chaptarr) => chaptarr.id === media.serviceId
  );

  return server ? { server, bookId: media.externalServiceIdAudio } : undefined;
};

const createClient = (server: ChaptarrSettings): ChaptarrAPI =>
  new ChaptarrAPI({
    apiKey: server.apiKey,
    url: ChaptarrAPI.buildUrl(server, '/api/v1'),
  });

const summarizeRecording = (
  recording: TalearrRecording
): BookRecordingSummary => ({
  bookId: recording.bookId,
  role: recording.role,
  narrators: recording.narrators,
  abridged: recording.abridged,
  runtimeMinutes: recording.runtimeMinutes ?? null,
  publisher: recording.publisher ?? null,
  releaseDate: recording.releaseDate ?? null,
  asin: recording.asin ?? null,
  hasFiles: recording.hasFiles,
  monitored: recording.monitored,
  status: recording.hasFiles
    ? MediaStatus.AVAILABLE
    : recording.monitored
      ? MediaStatus.PROCESSING
      : MediaStatus.UNKNOWN,
});

const summarizeCandidate = (
  candidate: TalearrRecordingCandidate
): BookRecordingCandidateSummary => ({
  editionId: candidate.editionId,
  narrators: candidate.narrators,
  abridged: candidate.abridged,
  runtimeMinutes: candidate.runtimeMinutes ?? null,
  publisher: candidate.publisher ?? null,
  releaseDate: candidate.releaseDate ?? null,
  asin: candidate.asin ?? null,
});

export const summarizeRecordingRequest = (
  request: MediaRequest
): RecordingRequestSummary => ({
  id: request.id,
  status: request.status,
  recording: request.recording as BookRecordingKind,
  narrator: request.recordingNarrator ?? null,
  editionId: request.recordingEditionId ?? null,
  requestedBy: {
    id: request.requestedBy?.id,
    displayName: request.requestedBy?.displayName,
  },
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  declineReason: request.declineReason ?? null,
});

const closedOptions = (): BookRecordingsResponse['options'] => ({
  unabridged: { available: false },
  abridged: { available: false },
  narrator: { available: false, narrators: [] },
  edition: { available: false },
});

/**
 * Which recordings a user could still ask for, from what TaleArr has and
 * knows and what was requested already
 */
export const getRecordingOptions = (
  view: Pick<TalearrRecordings, 'recordings' | 'candidates'>,
  requests: Pick<
    MediaRequest,
    'recording' | 'recordingNarrator' | 'recordingEditionId' | 'status'
  >[]
): BookRecordingsResponse['options'] => {
  const active = requests.filter(isActiveRecordingRequest);
  const abridgedOption = (kind: 'unabridged' | 'abridged'): RecordingOption => {
    if (view.recordings.some((recording) => recording.abridged === kind)) {
      return { available: false, reason: 'have' };
    }

    if (!view.candidates.some((candidate) => candidate.abridged === kind)) {
      return { available: false, reason: 'none' };
    }

    if (active.some((request) => request.recording === kind)) {
      return { available: false, reason: 'requested' };
    }

    return { available: true };
  };

  const recorded = new Set(
    view.recordings.flatMap((recording) =>
      recording.narrators.map(normalizeNarrator)
    )
  );
  const requested = new Set(
    active
      .filter((request) => request.recording === 'narrator')
      .map((request) => normalizeNarrator(request.recordingNarrator))
  );
  const seen = new Set<string>();
  const narrators = view.candidates
    .flatMap((candidate) => candidate.narrators)
    .filter((narrator) => {
      const key = normalizeNarrator(narrator);

      if (!key || seen.has(key) || recorded.has(key) || requested.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  const hasCandidates = view.candidates.length > 0;
  const openEditions = view.candidates.filter(
    (candidate) =>
      !active.some(
        (request) =>
          request.recording === 'edition' &&
          request.recordingEditionId === candidate.editionId
      )
  );

  return {
    unabridged: abridgedOption('unabridged'),
    abridged: abridgedOption('abridged'),
    narrator: narrators.length
      ? { available: true, narrators }
      : {
          available: false,
          reason: hasCandidates ? 'requested' : 'none',
          narrators: [],
        },
    edition: openEditions.length
      ? { available: true }
      : { available: false, reason: hasCandidates ? 'requested' : 'none' },
  };
};

const canUserRequest = (user: User): boolean =>
  user.hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
    type: 'or',
  });

/**
 * The recordings of a book's audiobook in TaleArr, the editions that could
 * become one, the recording requests made for it and what the user may
 * still ask for. TaleArr is asked each time, so the answer is current.
 */
export const getBookRecordings = async (
  media: Media | null | undefined,
  user: User,
  { timeoutMs = LOOKUP_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<BookRecordingsResponse> => {
  const requests = media
    ? await getRepository(MediaRequest).find({
        where: { media: { id: media.id }, recording: Not(IsNull()) },
        order: { createdAt: 'DESC' },
      })
    : [];
  const unsupported = (
    reason: BookRecordingsUnsupportedReason
  ): BookRecordingsResponse => ({
    supported: false,
    reason,
    recordings: [],
    candidates: [],
    requests: requests.map(summarizeRecordingRequest),
    canRequest: false,
    options: closedOptions(),
  });

  if (!isTalearrService(getSettings().bookService)) {
    return unsupported('service');
  }

  const target = getRecordingTarget(media);

  if (!target) {
    return unsupported('unavailable');
  }

  let view: TalearrRecordings | undefined;

  try {
    view = await createClient(target.server).getTalearrRecordings(
      target.bookId,
      { timeoutMs }
    );
  } catch (e) {
    logger.debug('Could not read the recordings of a book from TaleArr', {
      label: LABEL,
      mediaId: media?.id,
      bookId: target.bookId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return unsupported('unreachable');
  }

  if (!view) {
    return unsupported('unsupported');
  }

  const options = getRecordingOptions(view, requests);
  const canRequest =
    canUserRequest(user) &&
    media?.status !== MediaStatus.BLOCKLISTED &&
    Object.values(options).some((option) => option.available);

  return {
    supported: true,
    recordings: view.recordings.map(summarizeRecording),
    candidates: view.candidates.map(summarizeCandidate),
    requests: requests.map(summarizeRecordingRequest),
    canRequest,
    options,
  };
};

/**
 * Keeps what TaleArr answered on the request without running the request
 * subscriber again, which would send the request a second time
 */
const rememberRecording = async (
  requestId: number,
  recording: TalearrRecording,
  narrator?: string | null
): Promise<void> => {
  await getRepository(MediaRequest)
    .createQueryBuilder()
    .update(MediaRequest)
    .set({
      recordingBookId: recording.bookId,
      recordingNarrator:
        narrator ?? cleanNarrator(recording.narrators.join(', ')) ?? null,
    })
    .where('id = :id', { id: requestId })
    .callListeners(false)
    .execute();
};

/**
 * Marks a recording request done once its recording has files. Saving it
 * sends the availability notification.
 */
const completeRecordingRequest = async (requestId: number): Promise<void> => {
  const requestRepository = getRepository(MediaRequest);
  const request = await requestRepository.findOne({
    where: { id: requestId },
  });

  if (request && request.status === MediaRequestStatus.APPROVED) {
    request.status = MediaRequestStatus.COMPLETED;
    await requestRepository.save(request);
  }
};

const failRecordingRequest = async (
  entity: MediaRequest,
  reason: string
): Promise<void> => {
  try {
    if (entity.status !== MediaRequestStatus.FAILED) {
      entity.status = MediaRequestStatus.FAILED;
      await getRepository(MediaRequest).save(entity);
    }
  } catch (saveError) {
    logger.error('Failed to mark request as FAILED', {
      label: LABEL,
      requestId: entity.id,
      errorMessage:
        saveError instanceof Error ? saveError.message : String(saveError),
    });
  }

  logger.warn(`TaleArr did not add the recording: ${reason}`, {
    label: LABEL,
    requestId: entity.id,
    mediaId: entity.media?.id,
    recording: entity.recording,
  });

  const media = entity.media?.id
    ? await getRepository(Media).findOne({ where: { id: entity.media.id } })
    : null;

  if (media) {
    MediaRequest.sendNotification(entity, media, Notification.MEDIA_FAILED);
  }
};

const describeRefusal = (
  result: Extract<TalearrAddRecordingResult, { candidates: unknown }>
): string =>
  result.message ??
  (result.status === 'nomatch'
    ? 'no edition fits the request'
    : result.status === 'ambiguous'
      ? 'several editions fit the request'
      : 'TaleArr refused the request');

/**
 * Sends an approved recording request to TaleArr's recordings route, with
 * the request id as TaleArr's external reference. When several editions
 * fit equally well, the first of them is asked for by its edition, as the
 * book page would pick it.
 */
export const sendRecordingToTalearr = async (
  entity: MediaRequest,
  manager: EntityManager
): Promise<void> => {
  if (entity.status !== MediaRequestStatus.APPROVED || !entity.recording) {
    return;
  }

  const media = await manager
    .getRepository(Media)
    .findOne({ where: { id: entity.media.id } });
  const target = getRecordingTarget(media);

  if (!media || !target) {
    // Waits for the request's own save to end before marking it failed
    runInBackground(
      transactionSettled(manager).then(() =>
        failRecordingRequest(
          entity,
          isTalearrService(getSettings().bookService)
            ? 'the audiobook is not available in TaleArr'
            : 'TaleArr is not the book service'
        )
      )
    );
    return;
  }

  dispatchRecording(entity, target, media, () => transactionSettled(manager));
};

/**
 * Sends a recording request to TaleArr on the server's queue and keeps
 * what TaleArr answers. Writes back only once `settled` resolves, such as
 * when the transaction that saved the request has ended.
 */
const dispatchRecording = (
  entity: MediaRequest,
  { server, bookId }: RecordingTarget,
  media: Media,
  settled: () => Promise<void>
): void => {
  const kind = entity.recording as BookRecordingKind;
  const narrator = cleanNarrator(entity.recordingNarrator);
  const body = {
    bookId,
    kind,
    ...(kind === 'narrator' && narrator ? { narrator } : {}),
    ...(kind === 'edition' && entity.recordingEditionId
      ? { editionId: entity.recordingEditionId }
      : {}),
    search: !server.preventSearch,
    requestedBy: RECORDING_REQUESTED_BY,
    externalRef: String(entity.id),
  };

  const sent = serviceQueue
    .dispatch(chaptarrKey(server.id), async () => {
      const talearr = createClient(server);
      let result = await talearr.addTalearrRecording(body);

      if (
        result.status === 'ambiguous' &&
        kind !== 'edition' &&
        result.candidates[0]?.editionId
      ) {
        logger.info('Several editions fit, asking for the first of them', {
          label: LABEL,
          requestId: entity.id,
          editionId: result.candidates[0].editionId,
        });
        result = await talearr.addTalearrRecording({
          ...body,
          kind: 'edition',
          editionId: result.candidates[0].editionId,
        });
      }

      return result;
    })
    // Writes back only once the request's transaction has ended
    .finally(settled)
    .then(async (result) => {
      if (!('searchQueued' in result)) {
        await failRecordingRequest(entity, describeRefusal(result));
        return;
      }

      if (!result.recording?.bookId) {
        await failRecordingRequest(
          entity,
          'TaleArr did not answer with the recording'
        );
        return;
      }

      await rememberRecording(
        entity.id,
        result.recording,
        kind === 'narrator' ? narrator : null
      );

      logger.info('TaleArr added the recording', {
        label: LABEL,
        requestId: entity.id,
        mediaId: media.id,
        recording: kind,
        action: result.status,
        recordingBookId: result.recording.bookId,
        searchQueued: result.searchQueued,
      });

      if (result.recording.hasFiles) {
        await completeRecordingRequest(entity.id);
      }
    })
    .catch(async (e) => {
      await failRecordingRequest(
        entity,
        e instanceof Error ? e.message : String(e)
      );
    });

  runInBackground(sent);
  logger.info('Sent recording request to TaleArr', {
    label: LABEL,
    requestId: entity.id,
    mediaId: media.id,
    recording: kind,
  });
};

/**
 * Completes the recording requests whose recordings have files now, from
 * the books a TaleArr scan read. A recording TaleArr no longer has fails
 * its request, which an admin can retry to add it again.
 */
export const syncRecordingRequests = async (
  serverIds: number[],
  books: ChaptarrBook[]
): Promise<number> => {
  if (
    !isTalearrService(getSettings().bookService) ||
    !serverIds.length ||
    !books.length
  ) {
    return 0;
  }

  const requests = await getRepository(MediaRequest).find({
    where: {
      status: MediaRequestStatus.APPROVED,
      recording: Not(IsNull()),
      recordingBookId: Not(IsNull()),
      serverId: In(serverIds),
    },
  });

  if (!requests.length) {
    return 0;
  }

  const booksById = new Map(
    books.filter((book) => book.id).map((book) => [book.id as number, book])
  );
  let completed = 0;

  for (const request of requests) {
    const book = booksById.get(request.recordingBookId as number);

    try {
      if (!book) {
        await failRecordingRequest(
          request,
          'TaleArr no longer has the recording'
        );
      } else if (getBookFileCount(book) > 0) {
        await completeRecordingRequest(request.id);
        completed++;
      }
    } catch (e) {
      logger.error('Failed to update a recording request', {
        label: LABEL,
        requestId: request.id,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return completed;
};

/**
 * Asks TaleArr for the abridged recording of an audiobook it was just sent,
 * as a recording request of its own linked to the audiobook request: same
 * requester, approved with it and not counted against the quota again. It
 * then reads, completes and notifies like any abridged recording request.
 * Nothing is asked for when TaleArr knows no abridged edition, keeps one
 * already, or one was requested already.
 */
export const requestAbridgedRecording = async (
  parent: MediaRequest,
  target: RecordingTarget
): Promise<MediaRequest | undefined> => {
  const requestRepository = getRepository(MediaRequest);
  const media = await getRepository(Media).findOne({
    where: { id: parent.media.id },
  });

  if (!media) {
    return undefined;
  }

  const requests = await requestRepository.find({
    where: { media: { id: media.id }, recording: Not(IsNull()) },
  });
  let view: TalearrRecordings | undefined;

  try {
    view = await createClient(target.server).getTalearrRecordings(
      target.bookId
    );
  } catch (e) {
    logger.warn('Could not read the recordings of a book from TaleArr', {
      label: LABEL,
      requestId: parent.id,
      bookId: target.bookId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }

  const option = view
    ? getRecordingOptions(view, requests).abridged
    : { available: false, reason: 'none' as const };

  if (!option.available) {
    logger.info('Not asking TaleArr for the abridged recording', {
      label: LABEL,
      requestId: parent.id,
      mediaId: media.id,
      reason: view ? option.reason : 'no recordings route',
    });
    return undefined;
  }

  // Saved without the request subscriber, which would send it as a
  // recording of an audiobook that is available already, and without the
  // pending and approved notifications the audiobook request sent
  const linked = await requestRepository.save(
    new MediaRequest({
      type: MediaType.BOOK,
      media,
      requestedBy: parent.requestedBy,
      modifiedBy: parent.modifiedBy,
      status: MediaRequestStatus.APPROVED,
      is4k: false,
      isAudiobook: true,
      language: parent.language,
      serverId: target.server.id,
      recording: 'abridged',
      isAutoRequest: parent.isAutoRequest,
      ignoreQuota: true,
    }),
    { listeners: false }
  );

  logger.info('Asking TaleArr for the abridged recording too', {
    label: LABEL,
    requestId: parent.id,
    recordingRequestId: linked.id,
    mediaId: media.id,
  });
  dispatchRecording(linked, target, media, () => Promise.resolve());

  return linked;
};
