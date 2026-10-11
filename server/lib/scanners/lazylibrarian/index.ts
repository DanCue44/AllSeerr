import type {
  LazyLibrarianBook,
  LazyLibrarianState,
} from '@server/api/lazylibrarian';
import LazyLibrarianAPI, {
  getLazyLibrarianState,
  isLazyLibrarianConfigured,
} from '@server/api/lazylibrarian';
import { WORK_ID_REGEX } from '@server/api/openlibrary';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import { requestErrorLogFields } from '@server/utils/requestError';

type SyncStatus = StatusBase;

type BookStatusKey = 'status' | 'statusAudio';

/**
 * Applies a LazyLibrarian state to one format of a book. A format becomes
 * available once LazyLibrarian has its file. LazyLibrarian only moves unknown
 * or pending formats to processing, a declined or deleted format waits for
 * a new request. Returns whether the status changed.
 */
export const applyLazyLibrarianState = (
  media: Media,
  statusKey: BookStatusKey,
  state: LazyLibrarianState
): boolean => {
  const current = media[statusKey];

  if (state === 'available' && current !== MediaStatus.AVAILABLE) {
    media[statusKey] = MediaStatus.AVAILABLE;
    return true;
  }

  if (
    state === 'processing' &&
    (current === MediaStatus.UNKNOWN || current === MediaStatus.PENDING)
  ) {
    media[statusKey] = MediaStatus.PROCESSING;
    return true;
  }

  return false;
};

class LazyLibrarianScanner
  extends BaseScanner<LazyLibrarianBook>
  implements RunnableScanner<SyncStatus>
{
  constructor() {
    super('LazyLibrarian Scan', {
      bundleSize: 50,
      jobId: 'lazylibrarian-scan',
      service: 'lazylibrarian',
    });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
    };
  }

  public async run(): Promise<void> {
    const settings = getSettings();
    const sessionId = this.startRun();

    try {
      if (!isLazyLibrarianConfigured(settings.lazylibrarian)) {
        this.log('LazyLibrarian is not configured. Skipping scan.');
        return;
      }

      const lazyLibrarian = new LazyLibrarianAPI(settings.lazylibrarian);

      this.items = await lazyLibrarian.getAllBooks();
      await this.loop(this.processLazyLibrarianBook.bind(this), { sessionId });

      this.log('LazyLibrarian scan complete', 'info');
      this.scanSucceeded();
    } catch (e) {
      this.scanFailed(e);
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processLazyLibrarianBook(
    book: LazyLibrarianBook
  ): Promise<void> {
    try {
      const ebookState = getLazyLibrarianState(book.status);
      const audiobookState = getLazyLibrarianState(book.audioStatus);

      if (ebookState === 'skip' && audiobookState === 'skip') {
        return;
      }

      await this.asyncLock.dispatch(book.bookId, async () => {
        const mediaRepository = getRepository(Media);
        const isOpenLibraryId = WORK_ID_REGEX.test(book.bookId);

        // Requested books remember their LazyLibrarian book id, books added
        // in LazyLibrarian are matched on their OpenLibrary work id
        const media =
          (await mediaRepository.findOne({
            where: {
              externalServiceSlug: book.bookId,
              mediaType: MediaType.BOOK,
            },
          })) ??
          (isOpenLibraryId
            ? await mediaRepository.findOne({
                where: { olId: book.bookId, mediaType: MediaType.BOOK },
              })
            : null);

        if (!media) {
          if (!isOpenLibraryId) {
            this.log(
              'No OpenLibrary work ID found for this book. Skipping item.',
              'debug',
              { title: book.title, bookId: book.bookId }
            );
            return;
          }

          const newMedia = new Media({
            olId: book.bookId,
            mediaType: MediaType.BOOK,
            status: MediaStatus.UNKNOWN,
            statusAudio: MediaStatus.UNKNOWN,
            externalServiceSlug: book.bookId,
          });
          applyLazyLibrarianState(newMedia, 'status', ebookState);
          applyLazyLibrarianState(newMedia, 'statusAudio', audiobookState);
          if (
            newMedia.status === MediaStatus.AVAILABLE ||
            newMedia.statusAudio === MediaStatus.AVAILABLE
          ) {
            newMedia.mediaAddedAt = new Date();
          }

          await mediaRepository.save(newMedia);
          this.log(`Saved new book: ${book.title}`);
          return;
        }

        const wasAvailable =
          media.status === MediaStatus.AVAILABLE ||
          media.statusAudio === MediaStatus.AVAILABLE;
        let changed = applyLazyLibrarianState(media, 'status', ebookState);
        changed =
          applyLazyLibrarianState(media, 'statusAudio', audiobookState) ||
          changed;

        if (
          !wasAvailable &&
          (media.status === MediaStatus.AVAILABLE ||
            media.statusAudio === MediaStatus.AVAILABLE)
        ) {
          media.mediaAddedAt = new Date();
        }

        if (media.externalServiceSlug !== book.bookId) {
          media.externalServiceSlug = book.bookId;
          changed = true;
        }

        if (changed) {
          await mediaRepository.save(media);
          this.log(
            `Media for ${book.title} exists. Changes were detected.`,
            'info'
          );
        } else {
          this.log(`Book already exists: ${book.title}`);
        }
      });
    } catch (e) {
      this.log('Failed to process LazyLibrarian book', 'error', {
        ...requestErrorLogFields(e),
        title: book.title,
      });
    }
  }
}

export const lazyLibrarianScanner = new LazyLibrarianScanner();
