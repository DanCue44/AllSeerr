import {
  ambientGrid,
  listPageMessages,
  PillSelect,
} from '@app/components/Allseerr/ListPage';
import LibraryTitles from '@app/components/Library/LibraryTitles';
import ReadingAppsNudge from '@app/components/ReadingApps/ReadingAppsNudge';
import SpaceLayout, { spaceMessages } from '@app/components/Space';
import TitleCard from '@app/components/TitleCard';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { MediaLibrarySortOption } from '@app/utils/mediaLibrary';
import {
  ALBUM_TYPE_FILTERS,
  BOOK_FORMAT_FILTERS,
  getMediaLibraryQuery,
  getMediaLibrarySort,
} from '@app/utils/mediaLibrary';
import type { SpaceKey } from '@app/utils/spaces';
import { BarsArrowDownIcon, FunnelIcon } from '@heroicons/react/24/solid';
import type { MediaResultsResponse } from '@server/interfaces/api/mediaInterfaces';
import { useRouter } from 'next/router';
import type { ChangeEvent, ReactNode } from 'react';
import type { MessageDescriptor } from 'react-intl';
import { useIntl } from 'react-intl';
import useSWRInfinite from 'swr/infinite';

const messages = defineMessages('components.Space.SpaceLibrary', {
  sortMediaAddedDesc: 'Recently Added',
  sortTitleAsc: 'Title (A-Z)',
  sortTitleDesc: 'Title (Z-A)',
  sortArtistAsc: 'Artist (A-Z)',
  sortArtistDesc: 'Artist (Z-A)',
  sortAuthorAsc: 'Author (A-Z)',
  sortAuthorDesc: 'Author (Z-A)',
  sortReleaseDateDesc: 'Release Date Descending',
  sortReleaseDateAsc: 'Release Date Ascending',
  albumType: 'Album type',
  allalbumtypes: 'All Types',
  albums: 'Albums',
  eps: 'EPs',
  singles: 'Singles',
  other: 'Other',
  format: 'Format',
  allformats: 'All Formats',
  ebook: 'Ebook',
  audiobook: 'Audiobook',
  both: 'Ebook and Audiobook',
});

const SORT_TITLES: Record<
  'music' | 'book',
  Record<MediaLibrarySortOption, MessageDescriptor>
> = {
  music: {
    'mediaAdded.desc': messages.sortMediaAddedDesc,
    'title.asc': messages.sortTitleAsc,
    'title.desc': messages.sortTitleDesc,
    'creator.asc': messages.sortArtistAsc,
    'creator.desc': messages.sortArtistDesc,
    'releaseDate.desc': messages.sortReleaseDateDesc,
    'releaseDate.asc': messages.sortReleaseDateAsc,
  },
  book: {
    'mediaAdded.desc': messages.sortMediaAddedDesc,
    'title.asc': messages.sortTitleAsc,
    'title.desc': messages.sortTitleDesc,
    'creator.asc': messages.sortAuthorAsc,
    'creator.desc': messages.sortAuthorDesc,
    'releaseDate.desc': messages.sortReleaseDateDesc,
    'releaseDate.asc': messages.sortReleaseDateAsc,
  },
};

const ALBUM_TYPE_TITLES: Record<
  (typeof ALBUM_TYPE_FILTERS)[number],
  MessageDescriptor
> = {
  album: messages.albums,
  ep: messages.eps,
  single: messages.singles,
  other: messages.other,
};

const FORMAT_TITLES: Record<
  (typeof BOOK_FORMAT_FILTERS)[number],
  MessageDescriptor
> = {
  ebook: messages.ebook,
  audiobook: messages.audiobook,
  both: messages.both,
};

const PAGE_SIZE = 24;

/** A select with a leading icon, as a pill or as a classic input group. */
const LibrarySelect = ({
  id,
  label,
  icon,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) => {
  const [interfaceStyle] = useInterfaceStyle();

  if (interfaceStyle === 'ambient') {
    return (
      <PillSelect
        id={id}
        label={label}
        icon={icon}
        value={value}
        onChange={onChange}
      >
        {children}
      </PillSelect>
    );
  }

  return (
    <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
      <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
      <select
        id={id}
        name={id}
        aria-label={label}
        className="rounded-r-only"
        value={value}
        onChange={onChange}
      >
        {children}
      </select>
    </div>
  );
};

/**
 * Albums or books that are available, newest first unless sorted otherwise.
 * They have no TMDB library listing, so the media table is read directly,
 * sorted and filtered by what Lidarr and Chaptarr know.
 */
const AvailableMediaGrid = ({ mediaType }: { mediaType: 'music' | 'book' }) => {
  const intl = useIntl();
  const router = useRouter();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const sortBy = getMediaLibrarySort(router.query.sortBy);
  const filterKey = mediaType === 'music' ? 'albumType' : 'format';
  const filterValue =
    typeof router.query[filterKey] === 'string'
      ? (router.query[filterKey] as string)
      : '';
  const updateQueryParams = useUpdateQueryParams({
    sortBy: router.query.sortBy,
    [filterKey]: router.query[filterKey],
  });
  const { data, error, size, setSize, isValidating } =
    useSWRInfinite<MediaResultsResponse>(
      (index: number, previous: MediaResultsResponse | null) =>
        previous && index >= previous.pageInfo.pages
          ? null
          : `/api/v1/media?${getMediaLibraryQuery({
              mediaType,
              sortBy,
              albumType: router.query.albumType,
              format: router.query.format,
              take: PAGE_SIZE,
              skip: index * PAGE_SIZE,
            })}`,
      { revalidateFirstPage: false }
    );

  const items = (data ?? []).flatMap((page) => page.results);
  const pages = data?.[data.length - 1]?.pageInfo.pages ?? 0;
  const isLoadingMore = isValidating && size > (data?.length ?? 0);
  const isReachingEnd = !!data && size >= pages;
  const isEmpty = !!data && items.length === 0;

  useVerticalScroll(
    () => setSize(size + 1),
    !!data && !isLoadingMore && !isReachingEnd
  );

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const controls = (
    <div
      className={
        ambient
          ? 'mb-6 flex flex-wrap items-center gap-2'
          : 'mb-4 flex flex-col sm:flex-row'
      }
    >
      <LibrarySelect
        id="sortBy"
        label={intl.formatMessage(listPageMessages.sortBy)}
        icon={<BarsArrowDownIcon />}
        value={sortBy}
        onChange={(e) =>
          updateQueryParams(
            'sortBy',
            e.target.value === 'mediaAdded.desc' ? undefined : e.target.value
          )
        }
      >
        {Object.entries(SORT_TITLES[mediaType]).map(([value, title]) => (
          <option key={value} value={value}>
            {intl.formatMessage(title)}
          </option>
        ))}
      </LibrarySelect>
      <LibrarySelect
        id={filterKey}
        label={intl.formatMessage(
          mediaType === 'music' ? messages.albumType : messages.format
        )}
        icon={<FunnelIcon />}
        value={filterValue}
        onChange={(e) =>
          updateQueryParams(filterKey, e.target.value || undefined)
        }
      >
        <option value="">
          {intl.formatMessage(
            mediaType === 'music' ? messages.allalbumtypes : messages.allformats
          )}
        </option>
        {mediaType === 'music'
          ? ALBUM_TYPE_FILTERS.map((type) => (
              <option key={type} value={type}>
                {intl.formatMessage(ALBUM_TYPE_TITLES[type])}
              </option>
            ))
          : BOOK_FORMAT_FILTERS.map((format) => (
              <option key={format} value={format}>
                {intl.formatMessage(FORMAT_TITLES[format])}
              </option>
            ))}
      </LibrarySelect>
    </div>
  );

  if (isEmpty) {
    return (
      <>
        {controls}
        <div
          className={
            ambient
              ? 'mx-auto mt-16 w-full max-w-md rounded-[22px] bg-as-surface px-6 py-10 text-center font-display text-[18px] font-medium text-as-ink-faint'
              : 'mt-32 w-full text-center text-xl text-gray-400'
          }
        >
          {intl.formatMessage(spaceMessages.emptylibrary)}
        </div>
      </>
    );
  }

  return (
    <>
      {controls}
      <ul className={ambient ? `${ambientGrid} pb-10` : 'cards-vertical'}>
        {items.map((item) => (
          <li key={`library-${item.id}`}>
            <TmdbTitleCard
              id={item.id}
              tmdbId={item.tmdbId}
              tvdbId={item.tvdbId}
              mbId={item.mbId}
              olId={item.olId}
              comicId={item.comicId}
              type={item.mediaType}
              canExpand
            />
          </li>
        ))}
        {(!data || isLoadingMore) &&
          [...Array(ambient ? 12 : 10)].map((_, i) => (
            <li key={`library-placeholder-${i}`}>
              <TitleCard.Placeholder canExpand />
            </li>
          ))}
      </ul>
    </>
  );
};

/**
 * The Library section of a space: what is available on the media server.
 * Movies and series reuse the Library page grid with its sorting and genres.
 */
const SpaceLibrary = ({ space }: { space: SpaceKey }) => (
  <SpaceLayout space={space} section="library">
    {space === 'movies' ? (
      <LibraryTitles type="movie" embedded />
    ) : space === 'series' ? (
      <LibraryTitles type="tv" embedded />
    ) : (
      <>
        {space === 'books' && <ReadingAppsNudge className="mb-6" />}
        <AvailableMediaGrid mediaType={space === 'music' ? 'music' : 'book'} />
      </>
    )}
  </SpaceLayout>
);

export default SpaceLibrary;
