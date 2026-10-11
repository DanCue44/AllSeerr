export type RequestStatusKey = 'status' | 'status4k' | 'statusAudio';

/**
 * The media status a request follows: a book's audiobook request follows
 * statusAudio, a 4K request status4k and every other request status
 */
export const getRequestStatusKey = (request: {
  is4k?: boolean;
  isAudiobook?: boolean;
}): RequestStatusKey =>
  request.isAudiobook ? 'statusAudio' : request.is4k ? 'status4k' : 'status';

export type RequestDownloadKey =
  | 'downloadStatus'
  | 'downloadStatus4k'
  | 'downloadStatusAudio';

/**
 * The media downloads a request follows, matching getRequestStatusKey
 */
export const getRequestDownloadKey = (request: {
  is4k?: boolean;
  isAudiobook?: boolean;
}): RequestDownloadKey =>
  request.isAudiobook
    ? 'downloadStatusAudio'
    : request.is4k
      ? 'downloadStatus4k'
      : 'downloadStatus';
