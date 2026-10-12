import OpenLibrary from '@server/api/openlibrary';
import type ChaptarrAPI from '@server/api/servarr/chaptarr';
import type {
  ChaptarrAddBookOptions,
  ChaptarrBook,
  ChaptarrMediaType,
} from '@server/api/servarr/chaptarr';
import {
  getBookFileCount,
  isDuplicateBooksError,
  isMonitoredFor,
} from '@server/api/servarr/chaptarr';
import type { BookLanguage } from '@server/constants/bookLanguages';
import { BOOK_LANGUAGE_ANY } from '@server/constants/bookLanguages';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { ChaptarrLanguageTags } from '@server/lib/chaptarrLanguages';
import {
  applyChaptarrLanguageTag,
  getChaptarrLanguageTags,
  isEditionInLanguage,
} from '@server/lib/chaptarrLanguages';
import { normalizeBookTitle } from '@server/lib/lazyLibrarianRequests';
import type { ChaptarrSettings } from '@server/lib/settings';
import logger from '@server/logger';

// ISBN lookups tried before the title, each one is a Chaptarr request
const MAX_ISBN_LOOKUPS = 3;

// Author imports that took too long to wait for, by pending import id.
// Books of the same author join the import, so a bulk request does not wait
// for it again for every book.
const slowImports = new Map<number, number>();
const SLOW_IMPORT_MEMORY_MS = 30 * 60_000;

export interface ChaptarrWantedBook {
  title: string;
  authorName?: string;
  isbns: string[];
  // Of several matches, one with an edition in this language wins
  language?: BookLanguage;
}

export interface ChaptarrFormatSettings {
  qualityProfileId: number;
  metadataProfileId: number;
  rootFolderPath: string;
}

export interface ChaptarrBookRequest {
  olId: string;
  mediaType: ChaptarrMediaType;
  // Chaptarr book id of this format, remembered from an earlier request
  bookId?: number | null;
  // Chaptarr work id, remembered from an earlier request of either format
  foreignBookId?: string | null;
  add: Omit<ChaptarrAddBookOptions, 'mediaType'>;
  // The requested language and Chaptarr's language tags. The author is
  // tagged with the language before the book is searched for, and an
  // edition in the language is preferred.
  language?: { code: BookLanguage; tags?: ChaptarrLanguageTags };
  pendingImport?: { timeoutMs?: number; intervalMs?: number };
}

export interface ChaptarrBookResult {
  // Missing while Chaptarr is still importing the author
  bookId?: number;
  foreignBookId: string;
  pendingId?: number;
}

const normalizeIsbn = (isbn: string): string =>
  isbn.replace(/[^0-9Xx]/g, '').toUpperCase();

const titleKeys = (title = ''): string[] => {
  const full = normalizeBookTitle(title);
  // Subtitles are often left out by one of the sources
  const main = normalizeBookTitle(title.split(':')[0]);

  return [...new Set([full, main])].filter(Boolean);
};

const authorMatches = (book: ChaptarrBook, authorName?: string): boolean => {
  if (!authorName) {
    return true;
  }

  // Compared on the surname, as sources format given names differently
  const surname = normalizeBookTitle(authorName).split(' ').pop() ?? '';
  const bookAuthor = normalizeBookTitle(
    book.author?.authorName ?? (book.authorTitle as string | undefined) ?? ''
  );

  return !!surname && bookAuthor.split(' ').includes(surname);
};

const bookIsbns = (book: ChaptarrBook): string[] =>
  (book.editions ?? [])
    .flatMap((edition) => [edition.isbn13, edition.isbn])
    .filter((isbn): isbn is string => typeof isbn === 'string' && !!isbn)
    .map(normalizeIsbn);

const hasEditionIn = (book: ChaptarrBook, language?: BookLanguage): boolean =>
  !!language &&
  language !== BOOK_LANGUAGE_ANY &&
  (book.editions ?? []).some((edition) =>
    isEditionInLanguage(edition, language)
  );

/**
 * Picks the lookup result that is the requested book: one with an edition
 * carrying a requested ISBN, or failing that the same title by the same
 * author. Of several equal titles one with an edition in the requested
 * language wins, then the most rated one, the others are usually reprints
 * or translations.
 */
export const pickChaptarrMatch = (
  results: ChaptarrBook[],
  wanted: ChaptarrWantedBook
): ChaptarrBook | undefined => {
  const wantedIsbns = new Set(wanted.isbns.map(normalizeIsbn));
  const byIsbn = results.find((result) =>
    bookIsbns(result).some((isbn) => wantedIsbns.has(isbn))
  );

  if (byIsbn) {
    return byIsbn;
  }

  const wantedTitles = titleKeys(wanted.title);

  return results
    .filter(
      (result) =>
        authorMatches(result, wanted.authorName) &&
        titleKeys(result.title).some((key) => wantedTitles.includes(key))
    )
    .sort(
      (a, b) =>
        // An exact title beats one that only matches without its subtitle
        Number(normalizeBookTitle(b.title) === wantedTitles[0]) -
          Number(normalizeBookTitle(a.title) === wantedTitles[0]) ||
        Number(hasEditionIn(b, wanted.language)) -
          Number(hasEditionIn(a, wanted.language)) ||
        (b.ratings?.votes ?? 0) - (a.ratings?.votes ?? 0)
    )[0];
};

/**
 * Looks the book up in Chaptarr by its ISBNs, then by title and author and
 * then by title alone, as Chaptarr's metadata does not know OpenLibrary
 * work ids
 */
export const findChaptarrBook = async (
  chaptarr: ChaptarrAPI,
  wanted: ChaptarrWantedBook
): Promise<ChaptarrBook | undefined> => {
  const terms = [
    ...wanted.isbns.slice(0, MAX_ISBN_LOOKUPS).map((isbn) => `isbn:${isbn}`),
    [wanted.title, wanted.authorName].filter(Boolean).join(' '),
    wanted.title,
  ];

  for (const term of [...new Set(terms)]) {
    // Chaptarr only searches its metadata for both formats at once
    const match = pickChaptarrMatch(await chaptarr.lookupBooks(term), wanted);

    if (match) {
      return match;
    }
  }

  return undefined;
};

/**
 * The quality profile, metadata profile and root folder a server uses for
 * a format. Throws when the format is not set up.
 */
export const getChaptarrFormatSettings = (
  server: ChaptarrSettings,
  mediaType: ChaptarrMediaType
): ChaptarrFormatSettings => {
  const settings =
    mediaType === 'ebook'
      ? {
          qualityProfileId: server.activeProfileId,
          metadataProfileId: server.activeMetadataProfileId,
          rootFolderPath: server.activeDirectory,
        }
      : {
          qualityProfileId: server.activeAudiobookProfileId,
          metadataProfileId: server.activeAudiobookMetadataProfileId,
          rootFolderPath: server.activeAudiobookDirectory,
        };

  if (
    !settings.qualityProfileId ||
    !settings.metadataProfileId ||
    !settings.rootFolderPath
  ) {
    throw new Error(
      `Chaptarr server ${server.name} has no ${mediaType} profile and root folder set`
    );
  }

  return settings as ChaptarrFormatSettings;
};

/**
 * The library book of a format a lookup result points at
 */
const getLibraryBookId = (
  result: ChaptarrBook,
  mediaType: ChaptarrMediaType
): number | undefined => {
  if (result.id && (!result.mediaType || result.mediaType === mediaType)) {
    return result.id;
  }

  const local =
    mediaType === 'ebook' ? result.localEbookBooks : result.localAudiobookBooks;

  return local?.[0]?.id;
};

/**
 * Monitors only the first edition in the requested language of a book about
 * to be added, when its metadata names the language of its editions
 */
export const preferEditionInLanguage = (
  book: ChaptarrBook,
  language?: BookLanguage
): ChaptarrBook => {
  if (!language || language === BOOK_LANGUAGE_ANY || !book.editions?.length) {
    return book;
  }

  const index = book.editions.findIndex((edition) =>
    isEditionInLanguage(edition, language)
  );

  if (index < 0) {
    return book;
  }

  return {
    ...book,
    editions: book.editions.map((edition, editionIndex) => ({
      ...edition,
      monitored: editionIndex === index,
    })),
  };
};

/**
 * Tags the author of a book with the requested language, so Chaptarr's
 * release profile for it applies. A failure is only logged, the book is
 * still searched for.
 */
const tagAuthorLanguage = async (
  chaptarr: ChaptarrAPI,
  book: ChaptarrBook,
  mediaType: ChaptarrMediaType,
  languageTags?: ChaptarrLanguageTags
): Promise<void> => {
  const authorId = book.authorId || book.author?.id;

  if (!languageTags || !authorId) {
    return;
  }

  try {
    await applyChaptarrLanguageTag(chaptarr, authorId, mediaType, languageTags);
  } catch (e) {
    logger.warn('Could not tag the author with the requested language', {
      label: 'Chaptarr',
      authorId,
      title: book.title,
      mediaType,
      errorMessage: e.message,
    });
  }
};

/**
 * Monitors a library book for its format and searches for it, unless it
 * has its files already. The author is tagged with the requested language
 * first, so the search already follows it.
 */
const monitorAndSearch = async (
  chaptarr: ChaptarrAPI,
  book: ChaptarrBook,
  mediaType: ChaptarrMediaType,
  search: boolean,
  format: ChaptarrFormatSettings,
  languageTags?: ChaptarrLanguageTags
): Promise<ChaptarrBookResult> => {
  const bookId = book.id as number;

  await tagAuthorLanguage(chaptarr, book, mediaType, languageTags);

  if (!isMonitoredFor(book, mediaType)) {
    await chaptarr.setBooksMonitored([bookId], true);
  }

  // A monitored book is only grabbed automatically when its author is
  // monitored for the same format, which is off when the author was first
  // added for the other format
  if (book.authorId) {
    try {
      if (await chaptarr.enableAuthorFormat(book.authorId, mediaType, format)) {
        logger.info('Turned on the format for the author in Chaptarr', {
          label: 'Chaptarr',
          authorId: book.authorId,
          mediaType,
        });
      }
    } catch (e) {
      logger.warn('Could not turn on the format for the author in Chaptarr', {
        label: 'Chaptarr',
        authorId: book.authorId,
        mediaType,
        errorMessage: e.message,
      });
    }
  }

  if (search && getBookFileCount(book) === 0) {
    await chaptarr.searchBooks([bookId]);
  }

  logger.info('Monitored book in Chaptarr', {
    label: 'Chaptarr',
    bookId,
    title: book.title,
    mediaType,
  });

  return { bookId, foreignBookId: book.foreignBookId };
};

const getLibraryBook = async (
  chaptarr: ChaptarrAPI,
  result: ChaptarrBook,
  mediaType: ChaptarrMediaType
): Promise<ChaptarrBook | undefined> => {
  const bookId = getLibraryBookId(result, mediaType);

  return bookId ? chaptarr.getBook(bookId) : undefined;
};

const findLibraryBook = async (
  chaptarr: ChaptarrAPI,
  foreignBookId: string,
  mediaType: ChaptarrMediaType
): Promise<ChaptarrBook | undefined> => {
  const [result] = await chaptarr.lookupBooks(foreignBookId, mediaType);

  return result ? getLibraryBook(chaptarr, result, mediaType) : undefined;
};

/**
 * Waits for Chaptarr to finish adding a book it was still adding when the
 * add request timed out. Chaptarr finds a book by the work id of the lookup
 * result even when it keeps it under another provider's id.
 */
const waitForLibraryBook = async (
  chaptarr: ChaptarrAPI,
  foreignBookId: string,
  mediaType: ChaptarrMediaType,
  {
    timeoutMs = 300_000,
    intervalMs = 10_000,
  }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<ChaptarrBook | undefined> => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const book = await findLibraryBook(chaptarr, foreignBookId, mediaType);

    if (book || Date.now() + intervalMs > deadline) {
      return book;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

/**
 * Chaptarr sometimes imports an author's catalog twice when both formats of
 * a book are requested at once, and then refuses to add the book because
 * the work matches more than one of its own entries. Picks one of those
 * entries: one with files first, then the oldest.
 */
export const findDuplicateLibraryBook = async (
  chaptarr: ChaptarrAPI,
  match: ChaptarrBook,
  mediaType: ChaptarrMediaType
): Promise<ChaptarrBook | undefined> => {
  const authorId =
    (match.author?.id as number | undefined) ??
    (match.author?.foreignAuthorId
      ? (await chaptarr.getAuthorByForeignId(match.author.foreignAuthorId))?.id
      : undefined);

  if (!authorId) {
    return undefined;
  }

  const wantedKeys = titleKeys(match.title);
  const candidates = (await chaptarr.getBooksByAuthor(authorId)).filter(
    (book) =>
      book.id &&
      (!book.mediaType || book.mediaType === mediaType) &&
      titleKeys(book.title).some((key) => wantedKeys.includes(key))
  );
  const files = (book: ChaptarrBook) => (getBookFileCount(book) ? 1 : 0);

  return candidates.sort(
    (a, b) => files(b) - files(a) || (a.id ?? 0) - (b.id ?? 0)
  )[0];
};

const getWantedBook = async (olId: string): Promise<ChaptarrWantedBook> => {
  const openLibrary = new OpenLibrary();
  const summary = await openLibrary.getWorkSummary(olId);

  if (!summary) {
    throw new Error(`OpenLibrary has no work ${olId}`);
  }

  const isbns = await openLibrary.getWorkIsbns(olId).catch((e) => {
    logger.debug('Could not read the ISBNs of the work', {
      label: 'Chaptarr',
      olId,
      errorMessage: e.message,
    });
    return [];
  });

  return { title: summary.title, authorName: summary.author_name?.[0], isbns };
};

/**
 * Makes sure Chaptarr has the requested format of a book, monitored and
 * searched for. A book is found by the id remembered from an earlier
 * request, then by its Chaptarr work id, and otherwise looked up by the
 * ISBNs, title and author of its OpenLibrary work. A book Chaptarr does not
 * have yet is added with only that book of its author monitored. When
 * Chaptarr has to import the author first, this waits for the import and
 * then monitors and searches for the book; if the import takes too long,
 * Chaptarr finishes it on its own and the scan picks the book up.
 */
export const sendBookToChaptarr = async (
  chaptarr: ChaptarrAPI,
  request: ChaptarrBookRequest
): Promise<ChaptarrBookResult> => {
  const { mediaType, add } = request;
  const search = add.searchForNewBook;
  const languageTags = request.language?.tags;
  const monitor = (book: ChaptarrBook) =>
    monitorAndSearch(chaptarr, book, mediaType, search, add, languageTags);

  if (request.bookId) {
    const book = await chaptarr.getBook(request.bookId);

    if (book && (!book.mediaType || book.mediaType === mediaType)) {
      return monitor(book);
    }
  }

  let match: ChaptarrBook | undefined;

  if (request.foreignBookId) {
    match = (await chaptarr.lookupBooks(request.foreignBookId))[0];
  }

  let wanted: ChaptarrWantedBook | undefined;

  if (!match) {
    wanted = {
      ...(await getWantedBook(request.olId)),
      language: request.language?.code,
    };
    match = await findChaptarrBook(chaptarr, wanted);
  }

  if (!match) {
    throw new Error(
      `Chaptarr found no match for ${wanted?.title}${
        wanted?.authorName ? ` by ${wanted.authorName}` : ''
      }`
    );
  }

  // Metadata search results only list the library books Chaptarr matches on
  // their own ids. A lookup by the work id also finds books Chaptarr keeps
  // under another provider's id, and keeps it from adding the book twice.
  const libraryBook =
    (await getLibraryBook(chaptarr, match, mediaType)) ??
    (await findLibraryBook(chaptarr, match.foreignBookId, mediaType));

  if (libraryBook) {
    return monitor(libraryBook);
  }

  // The language tag goes along with a new author, which Chaptarr may
  // still be importing once the request returns
  let result: Awaited<ReturnType<ChaptarrAPI['addBook']>>;

  try {
    result = await chaptarr.addBook(
      preferEditionInLanguage(match, request.language?.code),
      {
        ...add,
        tags:
          languageTags?.tagId !== undefined &&
          !add.tags.includes(languageTags.tagId)
            ? [...add.tags, languageTags.tagId]
            : add.tags,
        mediaType,
      }
    );
  } catch (e) {
    const duplicate = isDuplicateBooksError(e)
      ? await findDuplicateLibraryBook(chaptarr, match, mediaType)
      : undefined;

    if (!duplicate) {
      throw e;
    }

    logger.info(
      'Chaptarr has this book more than once, using the existing entry',
      { label: 'Chaptarr', title: match.title, mediaType, bookId: duplicate.id }
    );
    return monitor(duplicate);
  }

  if (result.status === 'added') {
    // Chaptarr does not search for a book added with its author's catalog
    // on its own, whatever searchForNewBook says
    return monitor(result.book);
  }

  if (result.status === 'timeout') {
    const addedBook = await waitForLibraryBook(
      chaptarr,
      match.foreignBookId,
      mediaType,
      request.pendingImport
    );

    if (addedBook) {
      return monitor(addedBook);
    }

    throw new Error(
      `Chaptarr did not finish adding ${match.title} in time, request it again once it has`
    );
  }

  const slowSince = slowImports.get(result.pendingId);
  const outcome =
    slowSince && Date.now() - slowSince < SLOW_IMPORT_MEMORY_MS
      ? 'timeout'
      : await chaptarr.waitForPendingImport(
          result.pendingId,
          request.pendingImport
        );

  if (outcome === 'timeout') {
    slowImports.set(result.pendingId, slowSince ?? Date.now());
  } else {
    slowImports.delete(result.pendingId);
  }

  if (outcome === 'failed') {
    throw new Error(
      `Chaptarr could not import the author of ${match.title} (pending import ${result.pendingId})`
    );
  }

  if (outcome === 'succeeded') {
    const [imported] = await chaptarr.lookupBooks(
      match.foreignBookId,
      mediaType
    );
    const importedBook = imported
      ? await getLibraryBook(chaptarr, imported, mediaType)
      : undefined;

    if (importedBook) {
      return monitor(importedBook);
    }
  }

  logger.info(
    'Chaptarr is still importing the author, the book is added when it is ready',
    {
      label: 'Chaptarr',
      title: match.title,
      mediaType,
      pendingId: result.pendingId,
    }
  );

  return { foreignBookId: match.foreignBookId, pendingId: result.pendingId };
};

export interface ChaptarrBookIds {
  // Ebook and audiobook book ids
  externalServiceId?: number | null;
  externalServiceIdAudio?: number | null;
  foreignBookId?: string | null;
}

/**
 * The library book of one format, by the id the scanner stored or else by
 * looking the work up
 */
export const getChaptarrLibraryBook = async (
  chaptarr: ChaptarrAPI,
  ids: ChaptarrBookIds,
  format: ChaptarrMediaType
): Promise<ChaptarrBook | undefined> => {
  const knownId =
    format === 'ebook' ? ids.externalServiceId : ids.externalServiceIdAudio;
  const book = knownId ? await chaptarr.getBook(knownId) : undefined;

  if (book?.id && (!book.mediaType || book.mediaType === format)) {
    return book;
  }

  return ids.foreignBookId
    ? findLibraryBook(chaptarr, ids.foreignBookId, format)
    : undefined;
};

/**
 * Readies a library book for an automatic search: monitored for its format,
 * its author monitored for that format too and tagged with the language.
 * Chaptarr refuses automatic grabs otherwise, which a plain BookSearch on a
 * book added outside a request (or by LazyLibrarian before Chaptarr) runs
 * into. Each step only logs a failure, so the search still runs.
 */
export const prepareChaptarrBookSearch = async (
  chaptarr: ChaptarrAPI,
  book: ChaptarrBook,
  mediaType: ChaptarrMediaType,
  format: ChaptarrFormatSettings,
  language: BookLanguage
): Promise<void> => {
  const bookId = book.id as number;
  const languageTags =
    language === BOOK_LANGUAGE_ANY
      ? undefined
      : await getChaptarrLanguageTags(chaptarr, language, { bookId });

  await tagAuthorLanguage(chaptarr, book, mediaType, languageTags);

  if (!isMonitoredFor(book, mediaType)) {
    await chaptarr.setBooksMonitored([bookId], true);
  }

  if (book.authorId) {
    await chaptarr
      .enableAuthorFormat(book.authorId, mediaType, format)
      .catch((e) => {
        logger.warn('Could not turn on the format for the author in Chaptarr', {
          label: 'Chaptarr',
          authorId: book.authorId,
          mediaType,
          errorMessage: e.message,
        });
      });
  }
};

/**
 * Finds the book Chaptarr has for media that was never linked to it, such as
 * a book downloaded through LazyLibrarian before Chaptarr was set up, or
 * added in Chaptarr by hand. It is matched the way a new request is: by its
 * ISBNs, then by title and author. Returns undefined when Chaptarr does not
 * have that format of the book.
 */
export const matchChaptarrLibraryBook = async (
  chaptarr: ChaptarrAPI,
  olId: string,
  format: ChaptarrMediaType
): Promise<ChaptarrBook | undefined> => {
  const match = await findChaptarrBook(chaptarr, await getWantedBook(olId));

  if (!match) {
    return undefined;
  }

  return (
    (await getLibraryBook(chaptarr, match, format)) ??
    findLibraryBook(chaptarr, match.foreignBookId, format)
  );
};

/**
 * Saves the Chaptarr ids of a matched book on its media, so later scans and
 * actions find it directly
 */
export const linkChaptarrBook = async (
  media: Media,
  serverId: number,
  format: ChaptarrMediaType,
  book: ChaptarrBook
): Promise<void> => {
  const key =
    format === 'ebook' ? 'externalServiceId' : 'externalServiceIdAudio';
  const changes = {
    serviceId: serverId,
    [key]: book.id,
    foreignBookId: media.foreignBookId ?? book.foreignBookId,
  };

  // Saved without the media subscribers, nothing about the book changed
  await getRepository(Media).update(media.id, changes);
  Object.assign(media, changes);

  logger.info('Linked a book to Chaptarr', {
    label: 'Chaptarr',
    mediaId: media.id,
    bookId: book.id,
    format,
  });
};

/**
 * Deletes the files of the given formats of a book and stops monitoring
 * them, so Chaptarr does not download them again. The books stay in
 * Chaptarr. Their author is removed too when nothing else of the author is
 * monitored or has files, which leaves Chaptarr as it was before the book
 * was requested. Returns the ids of the books whose files were deleted.
 */
export const removeBookFromChaptarr = async (
  chaptarr: ChaptarrAPI,
  ids: ChaptarrBookIds,
  formats: ChaptarrMediaType[]
): Promise<{ removedBookIds: number[]; removedAuthorIds: number[] }> => {
  const removedBookIds: number[] = [];
  const authorIds = new Set<number>();
  let lookup: ChaptarrBook | undefined | null;

  for (const format of formats) {
    const knownId =
      format === 'ebook' ? ids.externalServiceId : ids.externalServiceIdAudio;
    let book = knownId ? await chaptarr.getBook(knownId) : undefined;

    if (book?.mediaType && book.mediaType !== format) {
      book = undefined;
    }

    if (!book && ids.foreignBookId) {
      if (lookup === undefined) {
        lookup = (await chaptarr.lookupBooks(ids.foreignBookId))[0] ?? null;
      }

      book = lookup
        ? await getLibraryBook(chaptarr, lookup, format)
        : undefined;
    }

    if (!book?.id) {
      logger.info('Book not in Chaptarr, nothing to remove', {
        label: 'Chaptarr',
        format,
        foreignBookId: ids.foreignBookId,
      });
      continue;
    }

    const bookFiles = await chaptarr.getBookFiles(book.id);
    await chaptarr.deleteBookFiles(bookFiles.map((bookFile) => bookFile.id));
    await chaptarr.setBooksMonitored([book.id], false);
    removedBookIds.push(book.id);

    const authorId = book.authorId || book.author?.id;
    if (authorId) {
      authorIds.add(authorId);
    }

    logger.info('Deleted book files and unmonitored the book in Chaptarr', {
      label: 'Chaptarr',
      bookId: book.id,
      title: book.title,
      format,
      bookFiles: bookFiles.length,
    });
  }

  const removedAuthorIds: number[] = [];

  for (const authorId of authorIds) {
    // The book is out already, an author that cannot be checked or removed
    // is only logged
    try {
      const authorInUse = (await chaptarr.getBooksByAuthor(authorId)).some(
        (book) =>
          !removedBookIds.includes(book.id as number) &&
          (isMonitoredFor(book, book.mediaType ?? 'ebook') ||
            getBookFileCount(book) > 0)
      );

      if (!authorInUse) {
        // The book files are already gone and no other book has any, files
        // Chaptarr does not know about are left alone
        await chaptarr.removeAuthor(authorId, { deleteFiles: false });
        removedAuthorIds.push(authorId);
        logger.info('Removed author with nothing else monitored', {
          label: 'Chaptarr',
          authorId,
        });
      }
    } catch (e) {
      logger.warn('Could not remove the author of a removed book', {
        label: 'Chaptarr',
        authorId,
        errorMessage: e.message,
      });
    }
  }

  return { removedBookIds, removedAuthorIds };
};
