import { isEditionMatch } from '@server/api/audible/match';
import type { GoogleBooksVolume } from './interfaces';

export interface EbookEvidence {
  // null when Google Books has no volume of the book at all
  exists: boolean | null;
  volumeId?: string;
}

/**
 * Whether a volume says an ebook of it exists. Google often leaves isEbook
 * off on the main edition while a download format is listed, so any of the
 * three counts.
 */
export const hasEbookSign = (volume: GoogleBooksVolume): boolean =>
  !!(
    volume.saleInfo?.isEbook ||
    volume.accessInfo?.epub?.isAvailable ||
    volume.accessInfo?.pdf?.isAvailable
  );

const isLanguage = (volume: GoogleBooksVolume, language?: string): boolean =>
  !!language &&
  (volume.volumeInfo?.language ?? '').toLowerCase().split('-')[0] ===
    language.toLowerCase();

/**
 * Volumes that are editions of the book: same title and author, without
 * summaries, workbooks and study guides unless the book itself is one
 */
export const findMatchingVolumes = (
  title: string,
  authors: string[],
  volumes: GoogleBooksVolume[]
): GoogleBooksVolume[] =>
  volumes.filter((volume) =>
    isEditionMatch(title, authors, {
      title: volume.volumeInfo?.title,
      subtitle: volume.volumeInfo?.subtitle,
      authors: volume.volumeInfo?.authors ?? [],
    })
  );

/**
 * Decides whether a book has an ebook edition from every volume Google
 * returned. The data is noisy per volume, so a single matching volume with
 * an ebook sign is enough, and a volume in the preferred language is
 * reported when there is one.
 */
export const findEbookEvidence = (
  title: string,
  authors: string[],
  volumes: GoogleBooksVolume[],
  language?: string
): EbookEvidence => {
  const matching = findMatchingVolumes(title, authors, volumes);

  if (!matching.length) {
    return { exists: null };
  }

  const withEbook = matching.filter(hasEbookSign);

  if (!withEbook.length) {
    return { exists: false };
  }

  const volume =
    withEbook.find((candidate) => isLanguage(candidate, language)) ??
    withEbook[0];

  return { exists: true, volumeId: volume.id };
};
