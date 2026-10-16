import type { BookRecordingKind } from '@server/constants/bookRecording';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import {
  getRequestDownloadKey,
  getRequestStatusKey,
} from '@server/lib/bookRequests';
import type {
  BookRecordingCandidateSummary,
  BookRecordingsResponse,
  RecordingRequestSummary,
} from '@server/lib/talearrRecordings';

/**
 * Where a recording request is, as the book page and the app show it
 */
export type RecordingRequestState =
  | 'pending'
  | 'approved'
  | 'available'
  | 'failed'
  | 'declined';

export const getRecordingRequestState = (
  status: MediaRequestStatus
): RecordingRequestState => {
  switch (status) {
    case MediaRequestStatus.PENDING:
      return 'pending';
    case MediaRequestStatus.APPROVED:
      return 'approved';
    case MediaRequestStatus.COMPLETED:
      return 'available';
    case MediaRequestStatus.DECLINED:
      return 'declined';
    default:
      return 'failed';
  }
};

/**
 * The recording options the request dialog offers, in the order it lists
 * them, with the first open one picked
 */
export type RecordingChoice = Extract<
  BookRecordingKind,
  'unabridged' | 'narrator' | 'edition'
>;

export const RECORDING_CHOICES: RecordingChoice[] = [
  'unabridged',
  'narrator',
  'edition',
];

export const getInitialRecordingChoice = (
  options: BookRecordingsResponse['options'] | undefined,
  preferred?: RecordingChoice
): RecordingChoice | undefined => {
  if (!options) {
    return undefined;
  }

  if (preferred && options[preferred].available) {
    return preferred;
  }

  return RECORDING_CHOICES.find((choice) => options[choice].available);
};

/**
 * Whether the book page offers the unabridged recording in one tap: the
 * library's audiobook is abridged and TaleArr knows an unabridged edition
 */
export const shouldOfferUnabridged = (
  info: BookRecordingsResponse | undefined
): boolean =>
  !!info?.supported &&
  info.canRequest &&
  info.options.unabridged.available &&
  info.recordings.some(
    (recording) =>
      recording.role === 'primary' && recording.abridged === 'abridged'
  );

/**
 * Requests worth showing next to the recordings: the open ones, and the
 * finished ones from the last month
 */
export const getVisibleRecordingRequests = (
  requests: RecordingRequestSummary[],
  now = Date.now()
): RecordingRequestSummary[] => {
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  return requests.filter(
    (request) =>
      request.status === MediaRequestStatus.PENDING ||
      request.status === MediaRequestStatus.APPROVED ||
      request.status === MediaRequestStatus.FAILED ||
      new Date(request.updatedAt).getTime() >= monthAgo
  );
};

/**
 * The parts that tell an edition apart in a list: its narrators, whether
 * it is abridged, its year and its publisher
 */
export const getCandidateParts = (
  candidate: BookRecordingCandidateSummary
): {
  narrators: string;
  abridged: BookRecordingCandidateSummary['abridged'];
  year?: string;
  publisher?: string;
  runtimeMinutes?: number;
} => ({
  narrators: candidate.narrators.join(', '),
  abridged: candidate.abridged,
  year: candidate.releaseDate?.slice(0, 4) || undefined,
  publisher: candidate.publisher ?? undefined,
  runtimeMinutes: candidate.runtimeMinutes ?? undefined,
});

/**
 * Whether the book page should look up recordings at all: TaleArr is the
 * book service and the audiobook is in the library
 */
export const canHaveRecordings = (
  bookService: string | undefined,
  statusAudio: MediaStatus | undefined
): boolean =>
  bookService === 'talearr' &&
  (statusAudio === MediaStatus.AVAILABLE ||
    statusAudio === MediaStatus.PARTIALLY_AVAILABLE);

type RecordingAwareRequest = {
  recording?: string | null;
  status: MediaRequestStatus;
  is4k?: boolean;
  isAudiobook?: boolean;
  media: Media;
};

/**
 * The status a request card shows. A request for another recording waits
 * for its own recording, while the book's audiobook is available already.
 */
export const getRequestMediaStatus = (
  request: RecordingAwareRequest
): MediaStatus =>
  request.recording
    ? request.status === MediaRequestStatus.COMPLETED
      ? MediaStatus.AVAILABLE
      : MediaStatus.PROCESSING
    : request.media[getRequestStatusKey(request)];

/**
 * The downloads a request card follows. The downloads of the book's
 * audiobook are not those of another recording.
 */
export const getRequestDownloads = (
  request: Omit<RecordingAwareRequest, 'media' | 'status'> & {
    media?: Media;
  }
): Media['downloadStatus'] =>
  request.recording ? [] : request.media?.[getRequestDownloadKey(request)];

/**
 * The format a book request is shown as: the ebook, the audiobook, or for a
 * recording request the recording asked for, such as the abridged audiobook
 */
export type BookRequestFormat =
  | 'ebook'
  | 'audiobook'
  | 'unabridgedaudiobook'
  | 'abridgedaudiobook'
  | 'audiobookrecording';

export const getBookRequestFormat = (request: {
  isAudiobook?: boolean;
  recording?: string | null;
}): BookRequestFormat => {
  if (!request.isAudiobook) {
    return 'ebook';
  }

  switch (request.recording) {
    case undefined:
    case null:
    case '':
      return 'audiobook';
    case 'unabridged':
      return 'unabridgedaudiobook';
    case 'abridged':
      return 'abridgedaudiobook';
    default:
      return 'audiobookrecording';
  }
};
