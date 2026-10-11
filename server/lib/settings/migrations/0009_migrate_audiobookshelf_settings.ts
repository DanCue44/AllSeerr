import type { AllSettings } from '@server/lib/settings';

/**
 * Moves the Audiobookshelf link out of the LazyLibrarian settings into a
 * block of its own, as books are now requested through Chaptarr. Values
 * already in the new block win.
 */
const migrateAudiobookshelfSettings = (settings: any): AllSettings => {
  const lazylibrarian = settings.lazylibrarian;

  if (
    !lazylibrarian ||
    (lazylibrarian.audiobookshelfUrl === undefined &&
      lazylibrarian.audiobookshelfLibraryId === undefined)
  ) {
    return settings;
  }

  const audiobookshelf = settings.audiobookshelf ?? {};

  if (!audiobookshelf.url && lazylibrarian.audiobookshelfUrl) {
    audiobookshelf.url = lazylibrarian.audiobookshelfUrl;
  }

  if (!audiobookshelf.libraryId && lazylibrarian.audiobookshelfLibraryId) {
    audiobookshelf.libraryId = lazylibrarian.audiobookshelfLibraryId;
  }

  settings.audiobookshelf = audiobookshelf;
  delete lazylibrarian.audiobookshelfUrl;
  delete lazylibrarian.audiobookshelfLibraryId;

  return settings;
};

export default migrateAudiobookshelfSettings;
