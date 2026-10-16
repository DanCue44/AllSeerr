import OpenLibrary, {
  getCoverUrl,
  getOlId,
  getOlText,
} from '@server/api/openlibrary';
import { truncate } from 'lodash';

export interface BookNotificationDetails {
  subject: string;
  message?: string;
  image?: string;
  authorName: string;
}

/**
 * Builds the subject, message and cover of a book notification: the title
 * and authors, the description and the cover
 */
export const getBookNotificationDetails = async (
  olId: string
): Promise<BookNotificationDetails> => {
  const openLibrary = new OpenLibrary();

  const work = await openLibrary.getWork(olId);
  const summary = await openLibrary
    .getWorkSummary(getOlId(work.key))
    .catch(() => undefined);

  let authorName = summary?.author_name?.join(', ');

  if (!authorName && work.authors?.[0]) {
    authorName = await openLibrary
      .getAuthor(getOlId(work.authors[0].author.key))
      .then((author) => author.name)
      .catch(() => undefined);
  }

  const year = summary?.first_publish_year;
  const description = getOlText(work.description);

  return {
    subject: `${work.title} by ${authorName || 'Unknown Author'}${
      year ? ` (${year})` : ''
    }`,
    message: description
      ? truncate(description, {
          length: 500,
          separator: /\s/,
          omission: '…',
        })
      : undefined,
    image:
      getCoverUrl(
        work.covers?.find((cover) => cover > 0) ?? summary?.cover_i,
        'L'
      ) ?? undefined,
    authorName: authorName || 'Unknown Author',
  };
};

/**
 * The format a book request or notification names: an ebook, an audiobook,
 * or for a recording request the recording asked for, such as "Abridged
 * Audiobook"
 */
export const getBookFormatName = (
  isAudiobook?: boolean,
  recording?: string | null
): string => {
  if (!isAudiobook) {
    return 'Ebook';
  }

  switch (recording) {
    case undefined:
    case null:
    case '':
      return 'Audiobook';
    case 'unabridged':
      return 'Unabridged Audiobook';
    case 'abridged':
      return 'Abridged Audiobook';
    default:
      return 'Audiobook Recording';
  }
};
