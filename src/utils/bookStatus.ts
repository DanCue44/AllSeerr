import type { BookFormatChoice } from '@server/constants/media';
import { MediaStatus } from '@server/constants/media';

export const isBookFormatRequestable = (status?: MediaStatus): boolean =>
  !status || status === MediaStatus.UNKNOWN || status === MediaStatus.DELETED;

/**
 * Picks the format preselected in the book request modal. The configured
 * default wins while it can be requested; otherwise the only requestable
 * format is chosen.
 */
export const getInitialBookFormat = (
  defaultFormat: BookFormatChoice,
  canRequestEbook: boolean,
  canRequestAudiobook: boolean
): BookFormatChoice => {
  if (canRequestEbook && !canRequestAudiobook) {
    return 'ebook';
  }

  if (!canRequestEbook && canRequestAudiobook) {
    return 'audiobook';
  }

  return defaultFormat;
};

export type BookFormatIndicatorState =
  | 'available'
  | 'requested'
  | 'processing'
  | 'none'
  | 'missing';

/**
 * State of the ebook or audiobook icon on book cards. The format's own
 * status wins. Otherwise the icon is neutral, or faded when the catalog is
 * known to have no edition in that format. Unknown availability, null or
 * undefined, stays neutral.
 */
export const getBookFormatIndicator = (
  status?: MediaStatus,
  editionExists?: boolean | null
): BookFormatIndicatorState => {
  switch (status) {
    case MediaStatus.AVAILABLE:
    case MediaStatus.PARTIALLY_AVAILABLE:
      return 'available';
    case MediaStatus.PENDING:
      return 'requested';
    case MediaStatus.PROCESSING:
      return 'processing';
    default:
      return editionExists === false ? 'missing' : 'none';
  }
};

/**
 * The catalog of a format is only asked about while its icon would otherwise
 * be neutral, requested and available formats need no lookup
 */
export const needsEditionLookup = (status?: MediaStatus): boolean =>
  getBookFormatIndicator(status) === 'none';
