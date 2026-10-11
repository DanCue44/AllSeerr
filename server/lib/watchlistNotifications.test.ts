import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import { getWatchlistRecipients } from '@server/lib/watchlistNotifications';
import { setupTestDb } from '@server/test/db';

setupTestDb();

const seed = async () => {
  const userRepo = getRepository(User);
  const admin = await userRepo.findOneOrFail({
    where: { email: 'admin@seerr.dev' },
  });
  const demo = await userRepo.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });

  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MOVIE,
      tmdbId: 777,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    })
  );

  return { admin, demo, media };
};

const watch = (user: User, media: Media) =>
  getRepository(Watchlist).save(
    new Watchlist({
      ratingKey: '',
      title: 'Test',
      mediaType: MediaType.MOVIE,
      tmdbId: media.tmdbId,
      requestedBy: user,
      media,
    })
  );

describe('getWatchlistRecipients', () => {
  it('includes users who watchlisted the title', async () => {
    const { demo, media } = await seed();
    await watch(demo, media);

    const recipients = await getWatchlistRecipients(media, MediaType.MOVIE);

    assert.deepEqual(
      recipients.map((user) => user.id),
      [demo.id]
    );
  });

  it('leaves out users who requested it themselves', async () => {
    const { admin, demo, media } = await seed();
    await watch(admin, media);
    await watch(demo, media);
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.COMPLETED,
        media,
        requestedBy: admin,
        is4k: false,
      })
    );

    const recipients = await getWatchlistRecipients(media, MediaType.MOVIE);

    assert.deepEqual(
      recipients.map((user) => user.id),
      [demo.id]
    );
  });

  it('returns nobody when no one watchlisted it', async () => {
    const { media } = await seed();

    assert.deepEqual(await getWatchlistRecipients(media, MediaType.MOVIE), []);
  });

  it('finds the watchers of an album by its mbId', async () => {
    const { admin, demo } = await seed();
    const album = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        mbId: '1dc4c347-a1db-32aa-b14f-bc9cc507b843',
        status: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(Watchlist).save(
      new Watchlist({
        title: 'OK Computer',
        mediaType: MediaType.MUSIC,
        mbId: album.mbId,
        requestedBy: demo,
        media: album,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.COMPLETED,
        media: album,
        requestedBy: admin,
        is4k: false,
      })
    );

    const recipients = await getWatchlistRecipients(album, MediaType.MUSIC);

    assert.deepEqual(
      recipients.map((user) => user.id),
      [demo.id]
    );
  });

  it('finds the watchers of a book by its olId', async () => {
    const { demo } = await seed();
    const book = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.BOOK,
        olId: 'OL45804W',
        status: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(Watchlist).save(
      new Watchlist({
        title: 'Fantastic Mr Fox',
        mediaType: MediaType.BOOK,
        olId: book.olId,
        requestedBy: demo,
        media: book,
      })
    );

    const recipients = await getWatchlistRecipients(book, MediaType.BOOK);

    assert.deepEqual(
      recipients.map((user) => user.id),
      [demo.id]
    );
    // The movie watchers of a TMDB id are not mixed in
    assert.deepEqual(await getWatchlistRecipients(book, MediaType.MOVIE), []);
  });
});
