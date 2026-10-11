import type MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import type OpenLibrary from '@server/api/openlibrary';
import { getOlId } from '@server/api/openlibrary';
import type { OlSearchDoc } from '@server/api/openlibrary/interfaces';

// MusicBrainz browses 100 release groups per page, at one request a second
const RELEASE_GROUP_PAGE_SIZE = 100;
// The artist page shows the first pages; a discography request reads them
// all, up to a limit that keeps the slowest artists to under half a minute
export const ARTIST_PAGE_RELEASE_GROUP_PAGES = 3;
export const DISCOGRAPHY_RELEASE_GROUP_PAGES = 25;

// OpenLibrary returns up to 100 works per search page, most published first
const WORKS_PAGE_SIZE = 100;
export const AUTHOR_CATALOG_WORK_PAGES = 10;

/**
 * The release groups of an artist, read a page at a time until all of them
 * or maxPages pages are read
 */
export const getArtistReleaseGroups = async (
  musicbrainz: MusicBrainz,
  artistId: string,
  maxPages = ARTIST_PAGE_RELEASE_GROUP_PAGES
): Promise<{ releaseGroups: MbReleaseGroup[]; total: number }> => {
  const firstPage = await musicbrainz.getArtistReleaseGroups({
    artistId,
    limit: RELEASE_GROUP_PAGE_SIZE,
  });
  const releaseGroups = [...firstPage['release-groups']];
  const total = firstPage['release-group-count'];

  for (let page = 1; page < maxPages && releaseGroups.length < total; page++) {
    const nextPage = await musicbrainz.getArtistReleaseGroups({
      artistId,
      limit: RELEASE_GROUP_PAGE_SIZE,
      offset: page * RELEASE_GROUP_PAGE_SIZE,
    });

    if (nextPage['release-groups'].length === 0) {
      break;
    }

    releaseGroups.push(...nextPage['release-groups']);
  }

  // Pages can overlap when MusicBrainz changes while they are read
  const seen = new Set<string>();

  return {
    releaseGroups: releaseGroups.filter(
      (releaseGroup) =>
        !seen.has(releaseGroup.id) && !!seen.add(releaseGroup.id)
    ),
    total,
  };
};

/**
 * The works of an author, most published first, read a page at a time until
 * all of them or maxPages pages are read
 */
export const getAuthorWorks = async (
  openLibrary: OpenLibrary,
  authorId: string,
  maxPages = 1
): Promise<{ works: OlSearchDoc[]; total: number }> => {
  const firstPage = await openLibrary.getAuthorWorks({
    authorId,
    limit: WORKS_PAGE_SIZE,
  });
  const works = [...firstPage.docs];
  const total = firstPage.numFound;

  for (let page = 2; page <= maxPages && works.length < total; page++) {
    const nextPage = await openLibrary.getAuthorWorks({
      authorId,
      page,
      limit: WORKS_PAGE_SIZE,
    });

    if (nextPage.docs.length === 0) {
      break;
    }

    works.push(...nextPage.docs);
  }

  const seen = new Set<string>();

  return {
    works: works.filter((work) => {
      const olId = getOlId(work.key);
      return !seen.has(olId) && !!seen.add(olId);
    }),
    total,
  };
};
