import SimilarArtists from '@app/components/ArtistDetails/SimilarArtists';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
import { BulkRequestTransition } from '@app/components/RequestModal/BulkRequest';
import DiscographyRequestModal from '@app/components/RequestModal/DiscographyRequestModal';
import MusicTitleCard from '@app/components/TitleCard/MusicTitleCard';
import WatchlistButton from '@app/components/WatchlistButton';
import { useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { UserIcon } from '@heroicons/react/24/solid';
import { Permission } from '@server/lib/permissions';
import type { ArtistDetails as ArtistDetailsType } from '@server/models/Music';
import type { AlbumResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.ArtistDetails', {
  biography: 'Biography',
  biographyunavailable: 'No biography is available for this artist.',
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
  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MUSIC],
    { type: 'or' }
  );
  const attributes = [
    data.type,
    data.area ?? data.country,
    lifeSpan,
    data.disambiguation,
  ].filter(Boolean);

  return (
    <>
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
      {data.artistBackdrop && (
        <div className="absolute -top-16 left-0 right-0 z-0 h-96">
          <CachedImage
            type="music"
            alt=""
            src={data.artistBackdrop}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
            priority
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(180deg, rgb(var(--tw-gray-900, 17 24 39) / 0.47) 0%, rgb(var(--tw-gray-900, 17 24 39) / 1) 100%)',
            }}
          />
        </div>
      )}
      <div className="relative z-10 mb-8 mt-4 flex flex-col items-center lg:flex-row lg:items-start">
        <div className="relative mb-6 mr-0 h-36 w-36 flex-shrink-0 overflow-hidden rounded-full bg-gray-800 ring-1 ring-gray-700 lg:mb-0 lg:mr-6 lg:h-44 lg:w-44">
          {data.artistThumb ? (
            <CachedImage
              type="music"
              src={data.artistThumb}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-600">
              <UserIcon className="h-1/2 w-1/2" />
            </div>
          )}
        </div>
        <div className="text-center text-gray-300 lg:text-left">
          <h1 className="text-3xl text-white lg:text-4xl">{data.name}</h1>
          <div className="mb-2 mt-1 space-x-2 text-xs sm:text-sm lg:text-base">
            {attributes.map((attribute, index) => (
              <span key={`attribute-${index}`}>
                {index > 0 && <span className="mr-2">|</span>}
                {attribute}
              </span>
            ))}
          </div>
          <div className="mt-4">
            <h2 className="mb-2 text-lg font-bold text-white">
              {intl.formatMessage(messages.biography)}
            </h2>
            <p className="whitespace-pre-line text-sm sm:text-base">
              {data.wikipedia?.content ??
                intl.formatMessage(messages.biographyunavailable)}
            </p>
            <div className="mt-2 space-x-4 text-sm">
              {data.wikipedia?.url && (
                <a
                  href={data.wikipedia.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 transition duration-300 hover:text-gray-100"
                >
                  {intl.formatMessage(messages.readmore)}
                </a>
              )}
              <a
                href={`https://musicbrainz.org/artist/${data.mbId}`}
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 transition duration-300 hover:text-gray-100"
              >
                {intl.formatMessage(messages.openinmusicbrainz)}
              </a>
            </div>
            <div className="mt-4 flex items-center justify-center lg:justify-start">
              {canRequest && data.releaseGroups.length > 0 && (
                <Button
                  buttonType="primary"
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
              />
            </div>
          </div>
          {data.genres.length > 0 && (
            <div className="mt-4">
              {data.genres.map((genre) => (
                <span key={`genre-${genre}`} className="mb-2 mr-2 inline-flex">
                  <Tag>{genre}</Tag>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="relative z-10">
        {groupedReleases.length === 0 && (
          <p className="text-gray-400">
            {intl.formatMessage(messages.nodiscography)}
          </p>
        )}
        {groupedReleases.map(([type, albums]) => {
          const isExpanded = expandedTypes.includes(type);
          const shownAlbums = isExpanded
            ? albums
            : albums.slice(0, INITIAL_ITEMS_PER_TYPE);

          return (
            <div key={`type-${type}`} className="mb-6">
              <div className="slider-header">
                <Header>{`${type} (${albums.length})`}</Header>
              </div>
              <ul className="cards-vertical">
                {shownAlbums.map((album) => (
                  <li key={`album-${album.id}`}>
                    <MusicTitleCard
                      id={album.id}
                      mediaType="album"
                      title={album.title}
                      subtitle={album.artistName}
                      year={album.releaseDate}
                      image={album.posterPath}
                      needsCoverArt={album.needsCoverArt}
                      albumType={album.albumType}
                      status={album.mediaInfo?.status}
                      inProgress={
                        (album.mediaInfo?.downloadStatus ?? []).length > 0
                      }
                      canExpand
                    />
                  </li>
                ))}
              </ul>
              {albums.length > shownAlbums.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    className="text-sm text-gray-400 transition duration-300 hover:text-gray-100"
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
            </div>
          );
        })}
        {data.totalReleaseGroups > data.releaseGroups.length && (
          <p className="text-sm text-gray-400">
            {intl.formatMessage(messages.truncateddiscography, {
              shown: data.releaseGroups.length,
              total: data.totalReleaseGroups,
            })}
          </p>
        )}
        <SimilarArtists artistId={data.mbId} />
      </div>
      <div className="extra-bottom-space relative" />
    </>
  );
};

export default ArtistDetails;
