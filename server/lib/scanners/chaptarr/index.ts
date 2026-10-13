import { WORK_ID_REGEX } from '@server/api/openlibrary';
import type {
  ChaptarrBook,
  ChaptarrMediaType,
} from '@server/api/servarr/chaptarr';
import ChaptarrAPI, {
  getBookFileCount,
  isMonitoredFor,
} from '@server/api/servarr/chaptarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { AudiobookshelfBackfillBook } from '@server/lib/audiobookshelfItem';
import { backfillAudiobookshelfItemIds } from '@server/lib/audiobookshelfItem';
import {
  linkChaptarrBook,
  matchChaptarrLibraryBook,
} from '@server/lib/chaptarrRequests';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { syncChaptarrAvailability } from '@server/lib/scanners/chaptarr/availability';
import { applyLazyLibrarianState } from '@server/lib/scanners/lazylibrarian';
import type { ChaptarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { requestErrorLogFields } from '@server/utils/requestError';
import { uniqWith } from 'lodash';

type SyncStatus = StatusBase & {
  currentServer: ChaptarrSettings;
  servers: ChaptarrSettings[];
};

export type ChaptarrBookState = 'available' | 'processing' | 'skip';

// Unlinked books matched per scan, and how long a failed match waits
const LINK_BATCH = 10;
const LINK_RETRY_MS = 24 * 60 * 60 * 1000;
const linkAttempts = new Map<number, number>();

const STATUS_KEYS = {
  ebook: 'status',
  audiobook: 'statusAudio',
} as const;

const BOOK_ID_KEYS = {
  ebook: 'externalServiceId',
  audiobook: 'externalServiceIdAudio',
} as const;

/**
 * A format of a book is available once Chaptarr has a file for it.
 * Monitored formats without files are processing, and formats that are
 * neither are left alone.
 */
export const getChaptarrBookState = (
  book: ChaptarrBook,
  mediaType: ChaptarrMediaType
): ChaptarrBookState => {
  if (getBookFileCount(book) > 0) {
    return 'available';
  }

  return isMonitoredFor(book, mediaType) ? 'processing' : 'skip';
};

/**
 * The OpenLibrary work id of a Chaptarr book, when its metadata has one
 */
const isAvailable = (media: Media): boolean =>
  media.status === MediaStatus.AVAILABLE ||
  media.statusAudio === MediaStatus.AVAILABLE;

const getOpenLibraryId = (book: ChaptarrBook): string | undefined => {
  const olId = book.openLibraryWorkId?.replace(/^ol:/i, '');

  return olId && WORK_ID_REGEX.test(olId) ? olId : undefined;
};

/**
 * Applies a Chaptarr book to the formats of a book it holds, dating the
 * book as added to the library the first time a format becomes available.
 * Returns whether the media changed.
 */
export const applyChaptarrBook = (
  media: Media,
  book: ChaptarrBook,
  formats: ChaptarrMediaType[]
): boolean => {
  const wasAvailable = isAvailable(media);
  let changed = false;

  for (const format of formats) {
    changed =
      applyLazyLibrarianState(
        media,
        STATUS_KEYS[format],
        getChaptarrBookState(book, format)
      ) || changed;
  }

  if (!wasAvailable && isAvailable(media)) {
    media.mediaAddedAt = new Date();
  }

  return changed;
};

class ChaptarrScanner
  extends BaseScanner<ChaptarrBook>
  implements RunnableScanner<SyncStatus>
{
  private servers: ChaptarrSettings[];
  private currentServer: ChaptarrSettings;

  constructor() {
    // Most books are idle catalog books that are skipped without a lookup
    super('Chaptarr Scan', {
      bundleSize: 500,
      jobId: 'chaptarr-scan',
      service: 'chaptarr',
    });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      currentServer: this.currentServer,
      servers: this.servers,
    };
  }

  public async run(): Promise<void> {
    const settings = getSettings();
    const sessionId = this.startRun();

    try {
      this.servers = uniqWith(
        settings.chaptarr,
        (a, b) =>
          a.hostname === b.hostname &&
          a.port === b.port &&
          a.baseUrl === b.baseUrl
      );

      for (const server of this.servers) {
        this.currentServer = server;

        if (!server.syncEnabled) {
          this.log(
            `Sync not enabled. Skipping Chaptarr server: ${server.name}`
          );
          continue;
        }

        this.log(
          `Beginning to process Chaptarr server: ${server.name}`,
          'info'
        );

        const chaptarr = new ChaptarrAPI({
          apiKey: server.apiKey,
          url: ChaptarrAPI.buildUrl(server, '/api/v1'),
        });

        this.items = await chaptarr.getAllBooks();
        await this.loop((book) => this.processChaptarrBook(server, book), {
          sessionId,
        });

        // Resets formats whose files are gone, for books linked to any
        // entry of this server
        this.checkSession(sessionId);
        const serverIds = settings.chaptarr
          .filter(
            (other) =>
              other.hostname === server.hostname &&
              other.port === server.port &&
              other.baseUrl === server.baseUrl
          )
          .map((other) => other.id);
        const isCurrent = () => this.running && this.sessionId === sessionId;
        await syncChaptarrAvailability(
          chaptarr,
          serverIds,
          this.items,
          isCurrent
        );
        await this.backfillAudiobookshelfItems(serverIds, isCurrent);

        if (server.isDefault) {
          await this.linkUnlinkedBooks(chaptarr, server);
        }
      }

      this.log('Chaptarr scan complete', 'info');
      this.scanSucceeded();
    } catch (e) {
      this.scanFailed(e);
    } finally {
      this.endRun(sessionId);
    }
  }

  /**
   * Remembers the Audiobookshelf items of a few available books each scan,
   * so NoBookEnds can trace an item back to its book. The titles and
   * authors come from Chaptarr, which has the files Audiobookshelf reads.
   */
  private async backfillAudiobookshelfItems(
    serverIds: number[],
    shouldContinue: () => boolean
  ): Promise<void> {
    const audiobookshelf = getSettings().audiobookshelf;

    if (!serverIds.length || !audiobookshelf.url || !audiobookshelf.apiKey) {
      return;
    }

    try {
      const available = MediaStatus.AVAILABLE;
      const missing = await getRepository(Media)
        .createQueryBuilder('media')
        .where('media.mediaType = :type', { type: MediaType.BOOK })
        .andWhere('media.serviceId IN (:...serverIds)', { serverIds })
        .andWhere('media.olId IS NOT NULL')
        .andWhere(
          '((media.status = :available AND media.absEbookItemId IS NULL ' +
            'AND media.externalServiceId IS NOT NULL) OR ' +
            '(media.statusAudio = :available AND ' +
            'media.absAudiobookItemId IS NULL AND ' +
            'media.externalServiceIdAudio IS NOT NULL))',
          { available }
        )
        .take(200)
        .getMany();

      if (!missing.length) {
        return;
      }

      const booksById = new Map(
        this.items
          .filter((book) => book.id)
          .map((book) => [book.id as number, book])
      );
      const books: AudiobookshelfBackfillBook[] = [];

      for (const media of missing) {
        for (const format of ['ebook', 'audiobook'] as const) {
          const book = booksById.get(
            (format === 'ebook'
              ? media.externalServiceId
              : media.externalServiceIdAudio) ?? -1
          );
          const status = format === 'ebook' ? media.status : media.statusAudio;

          if (book && status === available) {
            books.push({
              media,
              format,
              title: book.title,
              authors: book.author?.authorName ? [book.author.authorName] : [],
            });
          }
        }
      }

      const found = await backfillAudiobookshelfItemIds(books, shouldContinue);

      if (found) {
        this.log(`Found ${found} books in Audiobookshelf`, 'info');
      }
    } catch (e) {
      this.log('Failed to look books up in Audiobookshelf', 'debug', {
        ...requestErrorLogFields(e),
      });
    }
  }

  /**
   * Books available from before Chaptarr (downloaded through LazyLibrarian,
   * say) have no Chaptarr ids, and Chaptarr's metadata has no OpenLibrary
   * work id to find them by. A few of them are matched by title and author
   * each scan, so their files can be managed from AllSeerr. A book that
   * cannot be matched is tried again a day later.
   */
  private async linkUnlinkedBooks(
    chaptarr: ChaptarrAPI,
    server: ChaptarrSettings
  ): Promise<void> {
    const live = [MediaStatus.AVAILABLE, MediaStatus.PARTIALLY_AVAILABLE];
    const unlinked = await getRepository(Media)
      .createQueryBuilder('media')
      .where('media.mediaType = :type', { type: MediaType.BOOK })
      .andWhere('media.olId IS NOT NULL')
      .andWhere(
        '((media.status IN (:...live) AND media.externalServiceId IS NULL) OR ' +
          '(media.statusAudio IN (:...live) AND media.externalServiceIdAudio IS NULL))',
        { live }
      )
      .orderBy('media.updatedAt', 'ASC')
      .take(200)
      .getMany();

    const now = Date.now();
    const due = unlinked
      .filter(
        (media) => now - (linkAttempts.get(media.id) ?? 0) > LINK_RETRY_MS
      )
      .slice(0, LINK_BATCH);

    for (const media of due) {
      linkAttempts.set(media.id, now);
      const formats = (['ebook', 'audiobook'] as const).filter((format) =>
        format === 'ebook'
          ? live.includes(media.status) && !media.externalServiceId
          : live.includes(media.statusAudio) && !media.externalServiceIdAudio
      );

      for (const format of formats) {
        try {
          const book = await matchChaptarrLibraryBook(
            chaptarr,
            media.olId as string,
            format
          );

          if (book?.id) {
            await linkChaptarrBook(media, server.id, format, book);
            this.log(`Linked ${format} to Chaptarr: ${book.title}`, 'info');
          }
        } catch (e) {
          this.log('Could not match a book in Chaptarr', 'debug', {
            mediaId: media.id,
            format,
            ...requestErrorLogFields(e),
          });
        }
      }
    }
  }

  private async processChaptarrBook(
    server: ChaptarrSettings,
    book: ChaptarrBook
  ): Promise<void> {
    try {
      // Readarr books have no format, they count as ebooks unless an
      // audiobook was requested as that book
      const format: ChaptarrMediaType = book.mediaType ?? 'ebook';
      const bookId = book.id;

      // Books that are neither monitored nor downloaded change nothing.
      // Most of a library is the catalogs of its authors, so these are
      // left out before looking anything up.
      if (!bookId || getChaptarrBookState(book, format) === 'skip') {
        return;
      }

      // Both formats of a work are processed one after the other
      await this.asyncLock.dispatch(book.foreignBookId, async () => {
        const mediaRepository = getRepository(Media);

        // Requested books remember their Chaptarr book ids
        const byBookId = await mediaRepository.findOne({
          where: [
            {
              serviceId: server.id,
              externalServiceId: bookId,
              mediaType: MediaType.BOOK,
            },
            {
              serviceId: server.id,
              externalServiceIdAudio: bookId,
              mediaType: MediaType.BOOK,
            },
          ],
        });

        if (byBookId) {
          const formats = (['ebook', 'audiobook'] as const).filter(
            (key) => byBookId[BOOK_ID_KEYS[key]] === bookId
          );

          if (applyChaptarrBook(byBookId, book, formats)) {
            await this.saveMedia(byBookId, book);
          } else {
            this.log(`Book already exists: ${book.title}`);
          }
          return;
        }

        // A book that was still being imported when it was requested is
        // found by its work id, a book added in Chaptarr by the OpenLibrary
        // work id of its metadata
        const olId = getOpenLibraryId(book);
        const media =
          (await mediaRepository.findOne({
            where: {
              foreignBookId: book.foreignBookId,
              mediaType: MediaType.BOOK,
            },
          })) ??
          (olId
            ? await mediaRepository.findOne({
                where: { olId, mediaType: MediaType.BOOK },
              })
            : null);

        if (!media) {
          if (!olId) {
            this.log(
              'No OpenLibrary work ID found for this book. Skipping item.',
              'debug',
              { title: book.title, foreignBookId: book.foreignBookId }
            );
            return;
          }

          const newMedia = new Media({
            olId,
            mediaType: MediaType.BOOK,
            status: MediaStatus.UNKNOWN,
            statusAudio: MediaStatus.UNKNOWN,
            serviceId: server.id,
            foreignBookId: book.foreignBookId,
            [BOOK_ID_KEYS[format]]: bookId,
          });
          applyChaptarrBook(newMedia, book, [format]);
          await this.saveMedia(newMedia, book);
          this.log(`Saved new book: ${book.title}`);
          return;
        }

        if (
          media.serviceId === server.id &&
          media[BOOK_ID_KEYS[format]] &&
          media[BOOK_ID_KEYS[format]] !== bookId
        ) {
          // Another copy of a book that is linked already
          return;
        }

        let changed = false;

        // Links the book to the media, unless the media is kept on another
        // Chaptarr server or already has a book of this format there
        if (
          (media.serviceId === null ||
            media.serviceId === undefined ||
            media.serviceId === server.id) &&
          !media[BOOK_ID_KEYS[format]]
        ) {
          media.serviceId = server.id;
          media[BOOK_ID_KEYS[format]] = bookId;
          media.foreignBookId ??= book.foreignBookId;
          changed = true;
        }

        changed = applyChaptarrBook(media, book, [format]) || changed;

        if (changed) {
          await this.saveMedia(media, book);
        } else {
          this.log(`Book already exists: ${book.title}`);
        }
      });
    } catch (e) {
      this.log('Failed to process Chaptarr book', 'error', {
        ...requestErrorLogFields(e),
        title: book.title,
      });
    }
  }

  private async saveMedia(media: Media, book: ChaptarrBook): Promise<void> {
    await getRepository(Media).save(media);
    this.log(`Media for ${book.title} exists. Changes were detected.`, 'info');
  }
}

export const chaptarrScanner = new ChaptarrScanner();
