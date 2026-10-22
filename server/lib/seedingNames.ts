import type { SeedingMediaType } from '@server/interfaces/api/downloadInterfaces';

const AUDIO_EXTENSIONS = ['m4b', 'mp3', 'm4a', 'flac', 'aac', 'ogg', 'opus'];
const EBOOK_EXTENSIONS = ['epub', 'azw3', 'azw', 'mobi', 'pdf'];
const COMIC_EXTENSIONS = ['cbz', 'cbr', 'cb7'];

export interface SeedingFileName {
  title: string;
  author: string | null;
  mediaType: SeedingMediaType | null;
}

const mediaTypeFor = (extension: string): SeedingMediaType | null => {
  if (AUDIO_EXTENSIONS.includes(extension)) {
    return 'audiobook';
  }

  if (EBOOK_EXTENSIONS.includes(extension)) {
    return 'ebook';
  }

  if (COMIC_EXTENSIONS.includes(extension)) {
    return 'comic';
  }

  return null;
};

// An author part like "D K Furutani", "M. Never" or "Ali Hazelwood": a few
// words of letters, initials and punctuation, without digits or brackets
const looksLikeAuthor = (text: string): boolean => {
  const words = text.split(/\s+/).filter(Boolean);

  return (
    words.length >= 1 &&
    words.length <= 5 &&
    !/[\d[\](){}]/.test(text) &&
    words.every((word) => /^[\p{L}][\p{L}.'-]*$/u.test(word))
  );
};

/**
 * Reads a seeding torrent's release name when Talearr has no book for it,
 * such as "When Mikan Road Was Ours - D K Furutani.m4b": the format from the
 * file extension, and the title and author when the name is "Title - Author".
 */
export const parseSeedingFileName = (name: string): SeedingFileName => {
  let base = name.trim();
  let mediaType: SeedingMediaType | null = null;

  const extension = /\.([a-z0-9]{2,4})$/i.exec(base);

  if (extension) {
    const fromExtension = mediaTypeFor(extension[1].toLowerCase());

    if (fromExtension) {
      mediaType = fromExtension;
      base = base.slice(0, -extension[0].length).trim();
    }
  }

  const separator = base.lastIndexOf(' - ');

  if (separator > 0) {
    const title = base.slice(0, separator).trim();
    const author = base.slice(separator + 3).trim();

    if (title && looksLikeAuthor(author)) {
      return { title, author, mediaType };
    }
  }

  return { title: base, author: null, mediaType };
};
