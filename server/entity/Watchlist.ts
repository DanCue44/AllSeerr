import MusicBrainz from '@server/api/musicbrainz';
import OpenLibrary, { getOlId } from '@server/api/openlibrary';
import TheMovieDb from '@server/api/themoviedb';
import type { WatchlistType } from '@server/constants/media';
import { FollowType, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
import type { MediaListKey } from '@server/lib/mediaListKeys';
import { getMediaListKey } from '@server/lib/mediaListKeys';
import logger from '@server/logger';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export class DuplicateWatchlistRequestError extends Error {}
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

@Entity()
@Unique('UNIQUE_USER_DB', ['tmdbId', 'mediaType', 'requestedBy'])
@Unique('UNIQUE_USER_MBID', ['mbId', 'mediaType', 'requestedBy'])
@Unique('UNIQUE_USER_OLID', ['olId', 'mediaType', 'requestedBy'])
export class Watchlist implements WatchlistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  public ratingKey = '';

  @Column({ type: 'varchar' })
  public mediaType: WatchlistType;

  @Column({ type: 'varchar' })
  title = '';

  // Albums and books have no TMDB id, they are keyed on mbId and olId
  @Column({ type: 'int', nullable: true })
  @Index()
  public tmdbId: number;

  @Column({ type: 'varchar', nullable: true })
  public mbId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public olId?: string | null;

  // When the new releases of a followed artist or author were last looked
  // up, and the recent releases seen then, so only newer ones are announced
  @DbAwareColumn({ type: 'datetime', nullable: true })
  public releasesCheckedAt?: Date | null;

  @Column({ type: 'simple-array', nullable: true })
  public knownReleaseIds?: string[] | null;

  @ManyToOne(() => User, (user) => user.watchlists, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public requestedBy: User;

  // Left empty for followed artists and authors, which have no media
  @ManyToOne(() => Media, (media) => media.watchlists, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public media: Media;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<Watchlist>) {
    Object.assign(this, init);
  }

  public static async createWatchlist({
    watchlistRequest,
    user,
  }: {
    watchlistRequest: {
      mediaType: WatchlistType;
      ratingKey?: string;
      title?: string;
      tmdbId?: number;
      mbId?: string;
      olId?: string;
    };
    user: User;
  }): Promise<Watchlist> {
    const watchlistRepository = getRepository(this);
    const mediaRepository = getRepository(Media);
    const { key, title, newMedia } =
      await this.lookupWatchlistMedia(watchlistRequest);

    const existing = await watchlistRepository.exist({
      where: {
        ...key,
        mediaType: watchlistRequest.mediaType,
        requestedBy: { id: user.id },
      },
    });

    if (existing) {
      logger.warn('Duplicate request for watchlist blocked', {
        ...key,
        mediaType: watchlistRequest.mediaType,
        label: 'Watchlist',
      });

      throw new DuplicateWatchlistRequestError();
    }

    const media: Media | null = newMedia
      ? ((await mediaRepository.findOne({
          where: {
            ...key,
            mediaType: newMedia.mediaType,
          },
        })) ?? newMedia)
      : null;

    const watchlist = new this({
      ratingKey: watchlistRequest.ratingKey ?? '',
      mediaType: watchlistRequest.mediaType,
      title: watchlistRequest.title ?? title,
      ...key,
      requestedBy: user,
      ...(media ? { media } : {}),
    });

    if (media) {
      await mediaRepository.save(media);
    }
    await watchlistRepository.save(watchlist);
    return watchlist;
  }

  /**
   * Makes sure the title exists before it is saved, and settles the id it is
   * stored under. A merged MusicBrainz release group or OpenLibrary work is
   * watchlisted as the one it was merged into. Followed artists and authors
   * have no media.
   */
  private static async lookupWatchlistMedia(watchlistRequest: {
    mediaType: WatchlistType;
    tmdbId?: number;
    mbId?: string;
    olId?: string;
  }): Promise<{ key: MediaListKey; title: string; newMedia: Media | null }> {
    const { mediaType } = watchlistRequest;

    if (mediaType === FollowType.ARTIST) {
      const artist = await new MusicBrainz().getArtist({
        artistId: watchlistRequest.mbId ?? '',
      });

      return { key: { mbId: artist.id }, title: artist.name, newMedia: null };
    }

    if (mediaType === FollowType.AUTHOR) {
      const author = await new OpenLibrary().getAuthor(
        watchlistRequest.olId ?? ''
      );

      return {
        key: { olId: getOlId(author.key) },
        title: author.name,
        newMedia: null,
      };
    }

    if (mediaType === MediaType.MUSIC) {
      const releaseGroup = await new MusicBrainz().getAlbum({
        releaseGroupId: watchlistRequest.mbId ?? '',
      });

      return {
        key: { mbId: releaseGroup.id },
        title: releaseGroup.title,
        newMedia: new Media({ mbId: releaseGroup.id, mediaType }),
      };
    }

    if (mediaType === MediaType.BOOK) {
      const work = await new OpenLibrary().getWork(watchlistRequest.olId ?? '');
      const olId = getOlId(work.key);

      return {
        key: { olId },
        title: work.title,
        newMedia: new Media({ olId, mediaType }),
      };
    }

    const tmdb = new TheMovieDb();
    const tmdbMedia =
      mediaType === MediaType.MOVIE
        ? await tmdb.getMovie({ movieId: Number(watchlistRequest.tmdbId) })
        : await tmdb.getTvShow({ tvId: Number(watchlistRequest.tmdbId) });

    return {
      key: { tmdbId: tmdbMedia.id },
      title: 'title' in tmdbMedia ? tmdbMedia.title : tmdbMedia.name,
      newMedia: new Media({
        tmdbId: tmdbMedia.id,
        tvdbId: tmdbMedia.external_ids.tvdb_id,
        mediaType,
      }),
    };
  }

  public static async deleteWatchlist(
    id: number | string,
    mediaType: WatchlistType,
    user: User
  ): Promise<Watchlist | null> {
    const watchlistRepository = getRepository(this);
    const watchlist = await watchlistRepository.findOneBy({
      ...getMediaListKey(mediaType, id),
      mediaType,
      requestedBy: { id: user.id },
    });
    if (!watchlist) {
      throw new NotFoundError('not Found');
    }

    if (watchlist) {
      await watchlistRepository.delete(watchlist.id);
    }

    return watchlist;
  }
}
