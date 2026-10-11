import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import { truncate } from 'lodash';

export interface MusicNotificationDetails {
  subject: string;
  message?: string;
  image?: string;
  artistName: string;
}

/**
 * Builds the subject, message and cover art of an album notification: the
 * album and artist names, the artist's Wikipedia summary and the front cover
 */
export const getMusicNotificationDetails = async (
  mbId: string
): Promise<MusicNotificationDetails> => {
  const musicbrainz = new MusicBrainz();
  const coverArtArchive = new CoverArtArchive();

  const album = await musicbrainz.getAlbum({ releaseGroupId: mbId });
  const artist = album['artist-credit']?.[0]?.artist;
  const artistName =
    (album['artist-credit'] ?? [])
      .map((credit) => `${credit.name}${credit.joinphrase ?? ''}`)
      .join('')
      .trim() || 'Unknown Artist';

  const [coverUrl, artistWikipedia] = await Promise.all([
    coverArtArchive.getFrontCoverUrl(mbId).catch(() => null),
    artist
      ? musicbrainz
          .getArtistWikipediaExtract({ artistMbid: artist.id })
          .catch(() => null)
      : null,
  ]);

  const year = album['first-release-date']?.slice(0, 4);

  return {
    subject: `${album.title} by ${artistName}${year ? ` (${year})` : ''}`,
    message: artistWikipedia?.content
      ? truncate(artistWikipedia.content, {
          length: 500,
          separator: /\s/,
          omission: '…',
        })
      : undefined,
    image: coverUrl ?? undefined,
    artistName,
  };
};
