import useEditionAvailability from '@app/hooks/useEditionAvailability';
import { pickAudiobookEdition } from '@app/utils/audiobookEdition';
import { needsEditionLookup } from '@app/utils/bookStatus';
import type { AudiobookEdition, BookDetails } from '@server/models/Book';

/**
 * The audiobook edition of a book page, for its narrators and length. Uses
 * the saved edition the book came with, else shares the audiobook lookup of
 * the page's format chips, so it never asks anything of its own.
 */
const useAudiobookEdition = (
  book?: BookDetails
): AudiobookEdition | undefined => {
  const availability = useEditionAvailability(
    'audiobook',
    book
      ? {
          olId: book.id,
          title: book.title,
          author: book.authors.map((author) => author.name).join(', '),
        }
      : undefined,
    !!book &&
      !book.audiobookEdition &&
      needsEditionLookup(book.mediaInfo?.statusAudio)
  );

  return pickAudiobookEdition(book?.audiobookEdition, availability);
};

export default useAudiobookEdition;
