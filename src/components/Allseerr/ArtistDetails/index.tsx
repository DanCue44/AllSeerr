import { TitleHero } from '@app/components/Allseerr/Title';
import Biography from '@app/components/Allseerr/Title/Biography';
import {
  AlbumCoverCard,
  coverGridClass,
} from '@app/components/Allseerr/Title/CoverCard';
import {
  chip,
  pillPrimary,
  pillSecondary,
  softChip,
} from '@app/components/Allseerr/Title/styles';
import SimilarArtists from '@app/components/ArtistDetails/SimilarArtists';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { BulkRequestTransition } from '@app/components/RequestModal/BulkRequest';
import DiscographyRequestModal from '@app/components/RequestModal/DiscographyRequestModal';
import WatchlistButton from '@app/components/WatchlistButton';
import { useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { UserIcon } from '@heroicons/react/24/solid';
import { Permission } from '@server/lib/permissions';
import type { ArtistDetails as ArtistDetailsType } from '@server/models/Music';
import type { AlbumResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Allseerr.ArtistDetails', {
  biography: 'Biography',
  biographyunavailable: 'No biography is available for this artist.',
  wikipedia: 'Wikipedia',
  musicbrainz: 'MusicBrainz',
  readmore: 'Read more on Wikipedia',
  openinmusicbrainz: 'Open in MusicBrainz',
  activeyears: 'Active {beginYear} - {endYear}',
  activesince: 'Active since {beginYear}',
  nodiscography: 'MusicBrainz lists no releases for this artist.',
  showmore: 'Show {count, number} more',
  truncateddiscography:
    'Showing {shown, number} of {total, number} releases. The rest are on MusicBrainz.',
  requestdiscography: 'Request Discography',
});

// Release groups are grouped the way MusicBrainz shows discographies, with
// the main types first
const TYPE_ORDER = ['Album', 'EP', 'Single'];
const INITIAL_ITEMS_PER_TYPE = 12;

const getReleaseGroupType = (album: AlbumResult): string =>
  album.secondaryTypes?.[0] ?? album.albumType ?? 'Other';

const ArtistDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);
  const [showDiscographyModal, setShowDiscographyModal] = useState(false);
  const { hasPermission } = useUser();
  const { data, error } = useSWR<ArtistDetailsType>(
    `/api/v1/artist/${router.query.artistId}`
  );

  const groupedReleases = useMemo(() => {
    const groups = new Map<string, AlbumResult[]>();

    (data?.releaseGroups ?? []).forEach((album) => {
      const type = getReleaseGroupType(album);
      groups.set(type, [...(groups.get(type) ?? []), album]);
    });

    return [...groups.entries()].sort(([a], [b]) => {
      const indexA = TYPE_ORDER.indexOf(a);
      const indexB = TYPE_ORDER.indexOf(b);

      if (indexA !== -1 || indexB !== -1) {
        return (
          (indexA === -1 ? TYPE_ORDER.length : indexA) -
          (indexB === -1 ? TYPE_ORDER.length : indexB)
        );
      }

      return a.localeCompare(b);
    });
  }, [data?.releaseGroups]);

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const lifeSpan = data.beginDate
    ? data.endDate
      ? intl.formatMessage(messages.activeyears, {
          beginYear: data.beginDate.slice(0, 4),
          endYear: data.endDate.slice(0, 4),
        })
      : intl.formatMessage(messages.activesince, {
          beginYear: data.beginDate.slice(0, 4),
        })
    : undefined;
  const attributes = [data.area ?? data.country, lifeSpan].filter(Boolean);
  const canRequestDiscography =
    hasPermission([Permission.REQUEST, Permission.REQUEST_MUSIC], {
      type: 'or',
    }) && data.releaseGroups.length > 0;

  return (
    <div className="relative -mx-4 -mt-20 pb-10 lg:-mt-28">
      <PageTitle title={data.name} />
      <BulkRequestTransition show={showDiscographyModal}>
        <DiscographyRequestModal
          artistId={data.mbId}
          artistName={data.name}
          backdrop={data.artistBackdrop ?? undefined}
          onCancel={() => setShowDiscographyModal(false)}
          onComplete={() => setShowDiscographyModal(false)}
        />
      </BulkRequestTransition>

      <TitleHero
        imageType="music"
        backdropPath={data.artistBackdrop ?? data.artistThumb}
        blurBackdrop={!data.artistBackdrop}
        posterPath={data.artistThumb}
        posterAlt={data.name}
        posterShape="round"
        posterFallback={<UserIcon />}
      >
        <h1
          className="font-display text-3xl font-bold leading-[1.05] tracking-[-1px] text-as-ink sm:text-4xl lg:text-5xl"
          data-testid="media-title"
        >
          {data.name}
        </h1>

        {(data.type || attributes.length > 0) && (
          <div className="flex flex-wrap items-center gap-3 text-as-ink-muted">
            {data.type && (
              <span className="rounded-md border border-as-line-strong px-2 py-0.5 text-[13px] font-bold">
                {data.type}
              </span>
            )}
            {attributes.map((attribute, index) => (
              <span key={`attribute-${index}`} className="flex gap-3">
                {index > 0 && <span>·</span>}
                {attribute}
              </span>
            ))}
          </div>
        )}

        {data.disambiguation && (
          <p className="italic text-as-ink-muted">{data.disambiguation}</p>
        )}

        {data.genres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.genres.map((genre) => (
              <span key={`genre-${genre}`} className={chip}>
                {genre}
              </span>
            ))}
          </div>
        )}

        <Biography
          title={intl.formatMessage(messages.biography)}
          text={
            data.wikipedia?.content ??
            intl.formatMessage(messages.biographyunavailable)
          }
        />

        <div className="flex flex-wrap items-center gap-2.5 max-sm:justify-center">
          {canRequestDiscography && (
            <Button
              className={`${pillPrimary} max-sm:px-5`}
              onClick={() => setShowDiscographyModal(true)}
            >
              <ArrowDownTrayIcon />
              <span>{intl.formatMessage(messages.requestdiscography)}</span>
            </Button>
          )}
          <WatchlistButton
            mediaType="artist"
            id={data.mbId}
            title={data.name}
            onUserWatchlist={data.onUserWatchlist}
            ambient
          />
          {/* With the request button in the row the links move to a row of
              their own on phones, so each row stays on one line */}
          <div
            className={`flex items-center gap-2.5 max-sm:justify-center ${
              canRequestDiscography ? 'max-sm:basis-full' : ''
            }`}
          >
            {data.wikipedia?.url && (
              <a
                href={data.wikipedia.url}
                target="_blank"
                rel="noreferrer"
                aria-label={intl.formatMessage(messages.readmore)}
                className={`inline-flex items-center justify-center border transition [&_svg]:h-4 [&_svg]:w-4 ${pillSecondary}`}
              >
                <ArrowTopRightOnSquareIcon />
                <span>{intl.formatMessage(messages.wikipedia)}</span>
              </a>
            )}
            <a
              href={`https://musicbrainz.org/artist/${data.mbId}`}
              target="_blank"
              rel="noreferrer"
              aria-label={intl.formatMessage(messages.openinmusicbrainz)}
              className={`inline-flex items-center justify-center border transition [&_svg]:h-4 [&_svg]:w-4 ${pillSecondary}`}
            >
              <ArrowTopRightOnSquareIcon />
              <span>{intl.formatMessage(messages.musicbrainz)}</span>
            </a>
          </div>
        </div>
      </TitleHero>

      <div className="flex flex-col gap-[34px] px-4 pt-[34px] lg:px-10">
        {groupedReleases.length === 0 && (
          <p className="text-as-ink-muted">
            {intl.formatMessage(messages.nodiscography)}
          </p>
        )}
        {groupedReleases.map(([type, albums]) => {
          const isExpanded = expandedTypes.includes(type);
          const shownAlbums = isExpanded
            ? albums
            : albums.slice(0, INITIAL_ITEMS_PER_TYPE);

          return (
            <section key={`type-${type}`} className="flex flex-col gap-4">
              <h2 className="flex items-baseline gap-2.5 font-display text-[22px] font-medium text-as-ink">
                {type}
                <span className="text-base text-as-ink-faint">
                  {intl.formatNumber(albums.length)}
                </span>
              </h2>
              <div className={coverGridClass}>
                {shownAlbums.map((album) => (
                  <AlbumCoverCard
                    key={`album-${album.id}`}
                    album={album}
                    subtitle={album.releaseDate?.slice(0, 4)}
                    showLabel={album.albumType !== type}
                  />
                ))}
              </div>
              {albums.length > shownAlbums.length && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    className={softChip}
                    onClick={() =>
                      setExpandedTypes((types) => [...types, type])
                    }
                  >
                    {intl.formatMessage(messages.showmore, {
                      count: albums.length - shownAlbums.length,
                    })}
                  </button>
                </div>
              )}
            </section>
          );
        })}
        {data.totalReleaseGroups > data.releaseGroups.length && (
          <p className="text-sm text-as-ink-faint">
            {intl.formatMessage(messages.truncateddiscography, {
              shown: data.releaseGroups.length,
              total: data.totalReleaseGroups,
            })}
          </p>
        )}
        <SimilarArtists artistId={data.mbId} ambient />
      </div>
    </div>
  );
};

export default ArtistDetails;
