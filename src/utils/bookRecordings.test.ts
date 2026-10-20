import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type {
  BookRecordingsResponse,
  RecordingRequestSummary,
} from '@server/lib/talearrRecordings';
import {
  canHaveRecordings,
  getBookRequestFormat,
  getCandidateParts,
  getInitialRecordingChoice,
  getRecordingRequestState,
  getVisibleRecordingRequests,
  shouldOfferUnabridged,
} from './bookRecordings';

const open = { available: true };
const closed = { available: false, reason: 'none' as const };

const info = (
  fields: Partial<BookRecordingsResponse> = {}
): BookRecordingsResponse => ({
  supported: true,
  recordings: [
    {
      bookId: 1,
      role: 'primary',
      narrators: ['D.W. Moffett'],
      abridged: 'abridged',
      runtimeMinutes: 240,
      publisher: null,
      releaseDate: null,
      asin: null,
      hasFiles: true,
      monitored: true,
      status: MediaStatus.AVAILABLE,
    },
  ],
  candidates: [],
  requests: [],
  canRequest: true,
  options: {
    unabridged: open,
    abridged: { available: false, reason: 'have' },
    narrator: { available: true, narrators: ['Scott Brick'] },
    edition: open,
  },
  ...fields,
});

const request = (
  status: MediaRequestStatus,
  updatedAt: string
): RecordingRequestSummary => ({
  id: status,
  status,
  recording: 'unabridged',
  narrator: null,
  editionId: null,
  requestedBy: { id: 1, displayName: 'Dan' },
  createdAt: new Date(updatedAt),
  updatedAt: new Date(updatedAt),
  declineReason: null,
});

describe('book recordings', () => {
  it('names the state of a recording request', () => {
    assert.strictEqual(
      getRecordingRequestState(MediaRequestStatus.PENDING),
      'pending'
    );
    assert.strictEqual(
      getRecordingRequestState(MediaRequestStatus.APPROVED),
      'approved'
    );
    assert.strictEqual(
      getRecordingRequestState(MediaRequestStatus.COMPLETED),
      'available'
    );
    assert.strictEqual(
      getRecordingRequestState(MediaRequestStatus.FAILED),
      'failed'
    );
    assert.strictEqual(
      getRecordingRequestState(MediaRequestStatus.DECLINED),
      'declined'
    );
  });

  it('picks the first open recording, or the one asked for', () => {
    assert.strictEqual(getInitialRecordingChoice(undefined), undefined);
    assert.strictEqual(getInitialRecordingChoice(info().options), 'unabridged');
    assert.strictEqual(
      getInitialRecordingChoice(info().options, 'edition'),
      'edition'
    );
    assert.strictEqual(
      getInitialRecordingChoice({ ...info().options, unabridged: closed }),
      'narrator'
    );
    assert.strictEqual(
      getInitialRecordingChoice({
        ...info().options,
        unabridged: closed,
        narrator: { ...closed, narrators: [] },
        edition: closed,
      }),
      undefined
    );
  });

  it('offers the unabridged recording for an abridged audiobook', () => {
    assert.strictEqual(shouldOfferUnabridged(info()), true);
    assert.strictEqual(shouldOfferUnabridged(undefined), false);
    assert.strictEqual(
      shouldOfferUnabridged(info({ canRequest: false })),
      false
    );
    assert.strictEqual(
      shouldOfferUnabridged(
        info({
          recordings: info().recordings.map((recording) => ({
            ...recording,
            abridged: 'unknown',
          })),
        })
      ),
      false
    );
  });

  it('shows open requests and the recently finished ones', () => {
    const now = new Date('2026-10-16T12:00:00Z').getTime();
    const visible = getVisibleRecordingRequests(
      [
        request(MediaRequestStatus.PENDING, '2025-01-01T00:00:00Z'),
        request(MediaRequestStatus.COMPLETED, '2026-10-10T00:00:00Z'),
        request(MediaRequestStatus.DECLINED, '2026-08-01T00:00:00Z'),
      ],
      now
    );

    assert.deepStrictEqual(
      visible.map((item) => item.status),
      [MediaRequestStatus.PENDING, MediaRequestStatus.COMPLETED]
    );
  });

  it('describes an edition by its narrators, year and publisher', () => {
    assert.deepStrictEqual(
      getCandidateParts({
        editionId: 3,
        narrators: ['Scott Brick', 'Kate Reading'],
        abridged: 'unabridged',
        runtimeMinutes: 1030,
        publisher: 'Random House Audio',
        releaseDate: '2009-09-16',
        asin: null,
      }),
      {
        narrators: 'Scott Brick, Kate Reading',
        abridged: 'unabridged',
        year: '2009',
        publisher: 'Random House Audio',
        runtimeMinutes: 1030,
      }
    );
  });

  it('only looks recordings up with Talearr and an audiobook', () => {
    assert.strictEqual(
      canHaveRecordings('talearr', MediaStatus.AVAILABLE),
      true
    );
    assert.strictEqual(
      canHaveRecordings('chaptarr', MediaStatus.AVAILABLE),
      false
    );
    assert.strictEqual(
      canHaveRecordings('talearr', MediaStatus.PROCESSING),
      false
    );
  });

  it('names the recording a book request is for', () => {
    assert.strictEqual(getBookRequestFormat({ isAudiobook: false }), 'ebook');
    assert.strictEqual(
      getBookRequestFormat({ isAudiobook: true, recording: null }),
      'audiobook'
    );
    assert.strictEqual(
      getBookRequestFormat({ isAudiobook: true, recording: 'unabridged' }),
      'unabridgedaudiobook'
    );
    assert.strictEqual(
      getBookRequestFormat({ isAudiobook: true, recording: 'abridged' }),
      'abridgedaudiobook'
    );
    assert.strictEqual(
      getBookRequestFormat({ isAudiobook: true, recording: 'narrator' }),
      'audiobookrecording'
    );
  });
});
