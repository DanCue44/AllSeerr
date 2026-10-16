/**
 * The recordings of an audiobook a user can ask TaleArr for once the
 * audiobook is available: the unabridged or abridged reading, a reading by
 * another narrator, or one edition picked from the list TaleArr knows.
 */
export type BookRecordingKind =
  | 'unabridged'
  | 'abridged'
  | 'narrator'
  | 'edition';

export const BOOK_RECORDING_KINDS: readonly BookRecordingKind[] = [
  'unabridged',
  'abridged',
  'narrator',
  'edition',
];

export const isBookRecordingKind = (
  value: unknown
): value is BookRecordingKind =>
  typeof value === 'string' &&
  BOOK_RECORDING_KINDS.includes(value as BookRecordingKind);

// Narrator names are short, longer values are cut before they are stored
export const MAX_RECORDING_NARRATOR_LENGTH = 200;

/**
 * Whether TaleArr reads a recording as abridged, unabridged or does not know
 */
export type BookRecordingAbridged = 'abridged' | 'unabridged' | 'unknown';

/**
 * How a recording request reads in notifications and lists, such as
 * "Unabridged" or "Narrated by Scott Brick"
 */
export const describeBookRecording = (request: {
  recording?: BookRecordingKind | string | null;
  recordingNarrator?: string | null;
}): string | undefined => {
  switch (request.recording) {
    case 'unabridged':
      return request.recordingNarrator
        ? `Unabridged, narrated by ${request.recordingNarrator}`
        : 'Unabridged';
    case 'abridged':
      return request.recordingNarrator
        ? `Abridged, narrated by ${request.recordingNarrator}`
        : 'Abridged';
    case 'narrator':
      return request.recordingNarrator
        ? `Narrated by ${request.recordingNarrator}`
        : 'Another narrator';
    case 'edition':
      return request.recordingNarrator
        ? `Edition narrated by ${request.recordingNarrator}`
        : 'Another edition';
    default:
      return undefined;
  }
};
