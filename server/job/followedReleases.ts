import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import OpenLibrary, { getCoverUrl, getOlId } from '@server/api/openlibrary';
import { FollowType, MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { Watchlist } from '@server/entity/Watchlist';
import notificationManager, { Notification } from '@server/lib/notifications';
import logger from '@server/logger';
import { In } from 'typeorm';

// Releases from the last three months count as recent. Each check
// remembers the recent releases it saw, so a release that MusicBrainz or
// OpenLibrary lists late is still announced.
const RECENT_DAYS = 90;
// Artists and authors looked up per run, the ones checked longest ago
// first, so a long list is covered over several days
export const MAX_FOLLOWS_PER_RUN = 100;
// MusicBrainz allows one request a second
const MUSICBRAINZ_DELAY_MS = 1100;

export interface FollowedRelease {
  // MusicBrainz release group id, or OpenLibrary work id
  id: string;
  title: string;
  image?: string | null;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const toDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Records a check of a followed artist or author and returns the releases
 * it had not seen before. The first check only records what is there, so
 * following someone does not announce their latest releases.
 */
export const applyReleaseCheck = (
  follow: Watchlist,
  releases: FollowedRelease[],
  now = new Date()
): FollowedRelease[] => {
  const known = new Set(follow.knownReleaseIds ?? []);
  const isFirstCheck = !follow.releasesCheckedAt;

  follow.releasesCheckedAt = now;
  follow.knownReleaseIds = releases.map((release) => release.id);

  return isFirstCheck
    ? []
    : releases.filter((release) => !known.has(release.id));
};

/**
 * Followed artists and authors, each with the watchlist entries of the users
 * following them, the ones checked longest ago first
 */
export const getFollowGroups = (
  follows: Watchlist[]
): { followType: FollowType; id: string; follows: Watchlist[] }[] => {
  const groups = new Map<
    string,
    { followType: FollowType; id: string; follows: Watchlist[] }
  >();

  for (const follow of follows) {
    const followType = follow.mediaType as FollowType;
    const id = followType === FollowType.ARTIST ? follow.mbId : follow.olId;

    if (!id) {
      continue;
    }

    const key = `${followType}:${id}`;
    const group = groups.get(key) ?? { followType, id, follows: [] };
    group.follows.push(follow);
    groups.set(key, group);
  }

  const lastChecked = (group: { follows: Watchlist[] }) =>
    Math.min(
      ...group.follows.map((follow) => follow.releasesCheckedAt?.getTime() ?? 0)
    );

  return [...groups.values()].sort((a, b) => lastChecked(a) - lastChecked(b));
};

/**
 * Looks up the new releases of followed artists and authors on MusicBrainz
 * and OpenLibrary, and tells their followers. Nothing is requested.
 */
class FollowedReleases {
  public running = false;
  private cancelled = false;

  public cancel(): void {
    this.cancelled = true;
  }

  public async run(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.cancelled = false;

    try {
      const follows = await getRepository(Watchlist).find({
        where: { mediaType: In([FollowType.ARTIST, FollowType.AUTHOR]) },
      });
      const groups = getFollowGroups(follows).slice(0, MAX_FOLLOWS_PER_RUN);
      let announced = 0;
      let usedMusicBrainz = false;

      for (const group of groups) {
        if (this.cancelled) {
          break;
        }

        try {
          if (group.followType === FollowType.ARTIST) {
            if (usedMusicBrainz) {
              await sleep(MUSICBRAINZ_DELAY_MS);
            }
            usedMusicBrainz = true;
          }

          const releases =
            group.followType === FollowType.ARTIST
              ? await this.getArtistReleases(group.id)
              : await this.getAuthorReleases(group.id);

          for (const follow of group.follows) {
            const newReleases = applyReleaseCheck(follow, releases);

            for (const release of newReleases) {
              await this.notify(follow, release);
              announced++;
            }
          }

          // Only the check is written, a follow removed meanwhile stays gone
          for (const follow of group.follows) {
            await getRepository(Watchlist).update(follow.id, {
              releasesCheckedAt: follow.releasesCheckedAt,
              knownReleaseIds: follow.knownReleaseIds,
            });
          }
        } catch (e) {
          logger.warn('Failed to look up new releases', {
            label: 'Followed Releases',
            followType: group.followType,
            id: group.id,
            errorMessage: e.message,
          });
        }
      }

      logger.info('Followed releases checked', {
        label: 'Followed Releases',
        checked: groups.length,
        announced,
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * Release groups of the artist first released in the recent window, up
   * to today
   */
  private async getArtistReleases(
    artistId: string
  ): Promise<FollowedRelease[]> {
    const today = toDate(new Date());
    const from = toDate(new Date(Date.now() - RECENT_DAYS * 86400000));

    const releaseGroups = await new MusicBrainz().searchAlbum({
      query: `arid:${artistId} AND firstreleasedate:[${from} TO ${today}]`,
      limit: 50,
    });

    return releaseGroups
      .filter((releaseGroup) => {
        const date = releaseGroup['first-release-date'] ?? '';
        return date >= from && date <= today;
      })
      .map((releaseGroup) => ({
        id: releaseGroup.id,
        title: releaseGroup.title,
      }));
  }

  /**
   * Works of the author first published this year or last year.
   * OpenLibrary only has the year.
   */
  private async getAuthorReleases(
    authorId: string
  ): Promise<FollowedRelease[]> {
    const year = new Date().getFullYear();

    const { docs } = await new OpenLibrary().searchBooks({
      query: `author_key:${authorId} AND first_publish_year:[${year - 1} TO ${year}]`,
      limit: 50,
    });

    return docs.map((doc) => ({
      id: getOlId(doc.key),
      title: doc.title,
      image: getCoverUrl(doc.cover_i, 'L'),
    }));
  }

  private async notify(
    follow: Watchlist,
    release: FollowedRelease
  ): Promise<void> {
    const isArtist = follow.mediaType === FollowType.ARTIST;
    const image = isArtist
      ? await new CoverArtArchive()
          .getFrontCoverUrl(release.id)
          .catch(() => null)
      : release.image;

    notificationManager.sendNotification(Notification.MEDIA_AVAILABLE, {
      event: isArtist ? 'Followed Artist' : 'Followed Author',
      subject: `New release from ${follow.title}: ${release.title}`,
      image: image ?? undefined,
      // Not saved, it only links the notification to the album or book page
      media: new Media({
        mediaType: isArtist ? MediaType.MUSIC : MediaType.BOOK,
        ...(isArtist ? { mbId: release.id } : { olId: release.id }),
        status: MediaStatus.UNKNOWN,
        statusAudio: MediaStatus.UNKNOWN,
      }),
      notifyAdmin: false,
      notifySystem: false,
      notifyUser: follow.requestedBy,
    });
  }
}

const followedReleases = new FollowedReleases();

export default followedReleases;
