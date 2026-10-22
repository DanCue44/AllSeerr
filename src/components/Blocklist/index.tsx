import BlocklistedTagsBadge from '@app/components/BlocklistedTagsBadge';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useDebouncedState from '@app/hooks/useDebouncedState';
import useToasts from '@app/hooks/useToasts';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import type {
  BlocklistItem,
  BlocklistResultsResponse,
} from '@server/interfaces/api/blocklistInterfaces';
import type { BookDetails } from '@server/models/Book';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Blocklist', {
  blocklistsettings: 'Blocklist Settings',
  blocklistSettingsDescription: 'Manage blocklisted media.',
  mediaName: 'Name',
  mediaType: 'Type',
  mediaTmdbId: 'tmdb Id',
  blocklistdate: 'date',
  blocklistedby: '{date} by {user}',
  blocklistNotFoundError: '<strong>{title}</strong> is not blocklisted.',
  filterManual: 'Manual',
  filterBlocklistedTags: 'Blocklisted Tags',
  showAllBlocklisted: 'Show All Blocklisted Media',
});

enum Filter {
  ALL = 'all',
  MANUAL = 'manual',
  BLOCKLISTEDTAGS = 'blocklistedTags',
}

type BlocklistedTitle = MovieDetails | TvDetails | MusicDetails | BookDetails;

/**
 * Where a blocklisted title links to and how it is shown. Albums and books
 * are named by their MusicBrainz and OpenLibrary ids in place of a TMDB id.
 */
const getBlocklistedTitleDisplay = (
  item: BlocklistItem,
  title?: BlocklistedTitle
): {
  url: string;
  href: string;
  name?: string;
  year?: string;
  poster?: string | null;
  posterType: 'tmdb' | 'music' | 'book';
  backdrop?: string | null;
  backdropType: 'tmdb' | 'music';
} => {
  switch (item.mediaType) {
    case 'music': {
      const album = title as MusicDetails | undefined;
      return {
        url: `/api/v1/music/${item.mbId}`,
        href: `/music/${item.mbId}`,
        name: album?.title ?? item.title,
        year: album?.releaseDate?.slice(0, 4),
        poster: album?.posterPath,
        posterType: 'music',
        backdrop: album?.artistBackdrop,
        backdropType: 'music',
      };
    }
    case 'book': {
      const book = title as BookDetails | undefined;
      return {
        url: `/api/v1/book/${item.olId}`,
        href: `/book/${item.olId}`,
        name: book?.title ?? item.title,
        year: book?.firstPublishYear?.toString(),
        poster: book?.posterPath,
        posterType: 'book',
        backdropType: 'tmdb',
      };
    }
    case 'movie': {
      const movie = title as MovieDetails | undefined;
      return {
        url: `/api/v1/movie/${item.tmdbId}`,
        href: `/movie/${item.tmdbId}`,
        name: movie?.title,
        year: movie?.releaseDate?.slice(0, 4),
        poster: movie?.posterPath
          ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${movie.posterPath}`
          : undefined,
        posterType: 'tmdb',
        backdrop: movie?.backdropPath
          ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${movie.backdropPath}`
          : undefined,
        backdropType: 'tmdb',
      };
    }
    default: {
      const tv = title as TvDetails | undefined;
      return {
        url: `/api/v1/tv/${item.tmdbId}`,
        href: `/tv/${item.tmdbId}`,
        name: tv?.name,
        year: tv?.firstAirDate?.slice(0, 4),
        poster: tv?.posterPath
          ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${tv.posterPath}`
          : undefined,
        posterType: 'tmdb',
        backdrop: tv?.backdropPath
          ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${tv.backdropPath}`
          : undefined,
        backdropType: 'tmdb',
      };
    }
  }
};

// The type badge colors follow the title cards
const mediaTypeBadge = {
  movie: { className: 'border-blue-500 bg-blue-600/80', message: 'movie' },
  tv: { className: 'border-purple-600 bg-purple-600/80', message: 'tvshow' },
  music: {
    className: 'border-emerald-500 bg-emerald-600/80',
    message: 'album',
  },
  book: { className: 'border-amber-500 bg-amber-600/80', message: 'book' },
  comic: { className: 'border-rose-500 bg-rose-600/80', message: 'comic' },
} as const;

const Blocklist = () => {
  const [currentPageSize, setCurrentPageSize] = useState<number>(10);
  const [searchFilter, debouncedSearchFilter, setSearchFilter] =
    useDebouncedState('');
  const [currentFilter, setCurrentFilter] = useState<Filter>(Filter.MANUAL);
  const router = useRouter();
  const intl = useIntl();

  const page = router.query.page ? Number(router.query.page) : 1;
  const pageIndex = page - 1;
  const updateQueryParams = useUpdateQueryParams({ page: page.toString() });

  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<BlocklistResultsResponse>(
    `/api/v1/blocklist/?take=${currentPageSize}&skip=${
      pageIndex * currentPageSize
    }&filter=${currentFilter}${
      debouncedSearchFilter ? `&search=${debouncedSearchFilter}` : ''
    }`,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
    }
  );

  // check if there's no data and no errors in the table
  // so as to show a spinner inside the table and not refresh the whole component
  if (!data && error) {
    return <ErrorPage statusCode={500} />;
  }

  const searchItem = (e: ChangeEvent<HTMLInputElement>) => {
    // Remove the "page" query param from the URL
    // so that the "skip" query param on line 62 is empty
    // and the search returns results without skipping items
    if (router.query.page) router.replace(router.basePath);

    setSearchFilter(e.target.value as string);
  };

  const hasNextPage = data && data.pageInfo.pages > pageIndex + 1;
  const hasPrevPage = pageIndex > 0;

  return (
    <>
      <PageTitle title={[intl.formatMessage(globalMessages.blocklist)]} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{intl.formatMessage(globalMessages.blocklist)}</Header>

        <div className="mt-2 flex flex-grow flex-col sm:flex-row lg:flex-grow-0">
          <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
              <FunnelIcon className="h-6 w-6" />
            </span>
            <select
              id="filter"
              name="filter"
              onChange={(e) => {
                setCurrentFilter(e.target.value as Filter);
                router.push({
                  pathname: router.pathname,
                  query: router.query.userId
                    ? { userId: router.query.userId }
                    : {},
                });
              }}
              value={currentFilter}
              className="rounded-r-only"
            >
              <option value="all">
                {intl.formatMessage(globalMessages.all)}
              </option>
              <option value="manual">
                {intl.formatMessage(messages.filterManual)}
              </option>
              <option value="blocklistedTags">
                {intl.formatMessage(messages.filterBlocklistedTags)}
              </option>
            </select>
          </div>

          <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 md:flex-grow-0">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
              <MagnifyingGlassIcon className="h-6 w-6" />
            </span>
            <input
              type="text"
              className="rounded-r-only"
              value={searchFilter}
              onChange={(e) => searchItem(e)}
            />
          </div>
        </div>
      </div>

      {!data ? (
        <LoadingSpinner />
      ) : data.results.length === 0 ? (
        <div className="flex w-full flex-col items-center justify-center py-24 text-white">
          <span className="text-2xl text-gray-400">
            {intl.formatMessage(globalMessages.noresults)}
          </span>
          {currentFilter !== Filter.ALL && (
            <div className="mt-4">
              <Button
                buttonType="primary"
                onClick={() => setCurrentFilter(Filter.ALL)}
              >
                {intl.formatMessage(messages.showAllBlocklisted)}
              </Button>
            </div>
          )}
        </div>
      ) : (
        data.results.map((item: BlocklistItem) => {
          return (
            <div
              className="py-2"
              key={`request-list-${item.mediaType}-${
                item.tmdbId ?? item.mbId ?? item.olId
              }`}
            >
              <BlocklistedItem item={item} revalidateList={revalidate} />
            </div>
          );
        })
      )}

      <div className="actions">
        <nav
          className="mb-3 flex flex-col items-center space-y-3 sm:flex-row sm:space-y-0"
          aria-label="Pagination"
        >
          <div className="hidden lg:flex lg:flex-1">
            <p className="text-sm">
              {data &&
                (data?.results.length ?? 0) > 0 &&
                intl.formatMessage(globalMessages.showingresults, {
                  from: pageIndex * currentPageSize + 1,
                  to:
                    data.results.length < currentPageSize
                      ? pageIndex * currentPageSize + data.results.length
                      : (pageIndex + 1) * currentPageSize,
                  total: data.pageInfo.results,
                  strong: (msg: React.ReactNode) => (
                    <span className="font-medium">{msg}</span>
                  ),
                })}
            </p>
          </div>
          <div className="flex justify-center sm:flex-1 sm:justify-start lg:justify-center">
            <span className="-mt-3 items-center truncate text-sm sm:mt-0">
              {intl.formatMessage(globalMessages.resultsperpage, {
                pageSize: (
                  <select
                    id="pageSize"
                    name="pageSize"
                    onChange={(e) => {
                      setCurrentPageSize(Number(e.target.value));
                      router
                        .push({
                          pathname: router.pathname,
                          query: router.query.userId
                            ? { userId: router.query.userId }
                            : {},
                        })
                        .then(() => window.scrollTo(0, 0));
                    }}
                    value={currentPageSize}
                    className="short inline"
                  >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                ),
              })}
            </span>
          </div>
          <div className="flex flex-auto justify-center space-x-2 sm:flex-1 sm:justify-end">
            <Button
              disabled={!hasPrevPage}
              onClick={() => updateQueryParams('page', (page - 1).toString())}
            >
              <ChevronLeftIcon />
              <span>{intl.formatMessage(globalMessages.previous)}</span>
            </Button>
            <Button
              disabled={!hasNextPage}
              onClick={() => updateQueryParams('page', (page + 1).toString())}
            >
              <span>{intl.formatMessage(globalMessages.next)}</span>
              <ChevronRightIcon />
            </Button>
          </div>
        </nav>
      </div>
    </>
  );
};

export default Blocklist;

interface BlocklistedItemProps {
  item: BlocklistItem;
  revalidateList: () => void;
}

const BlocklistedItem = ({ item, revalidateList }: BlocklistedItemProps) => {
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const { addToast } = useToasts();
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const intl = useIntl();
  const { hasPermission } = useUser();

  const { url } = getBlocklistedTitleDisplay(item);
  const { data: title, error } = useSWR<BlocklistedTitle>(inView ? url : null);
  const display = getBlocklistedTitleDisplay(item, title);
  const badge = mediaTypeBadge[item.mediaType];

  if (!title && !error) {
    return (
      <div
        className="h-64 w-full animate-pulse rounded-xl bg-gray-800 xl:h-28"
        ref={ref}
      />
    );
  }

  const removeFromBlocklist = async (title?: string) => {
    setIsUpdating(true);

    try {
      await axios.delete(
        `/api/v1/blocklist/${
          item.mediaType === 'music'
            ? item.mbId
            : item.mediaType === 'book'
              ? item.olId
              : item.tmdbId
        }?mediaType=${item.mediaType}`
      );

      addToast(
        <span>
          {intl.formatMessage(globalMessages.removeFromBlocklistSuccess, {
            title,
            strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
    } catch {
      addToast(intl.formatMessage(globalMessages.blocklistError), {
        appearance: 'error',
        autoDismiss: true,
      });
    }

    revalidateList();
    setIsUpdating(false);
  };

  return (
    <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-xl bg-gray-800 py-4 text-gray-400 shadow-md ring-1 ring-gray-700 xl:h-28 xl:flex-row">
      {display.backdrop && (
        <div className="absolute inset-0 z-0 w-full bg-cover bg-center xl:w-2/3">
          <CachedImage
            type={display.backdropType}
            src={display.backdrop}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(90deg, rgb(var(--tw-gray-800, 31 41 55) / 0.47) 0%, rgb(var(--tw-gray-800, 31 41 55) / 1) 100%)',
            }}
          />
        </div>
      )}
      <div className="relative flex w-full flex-col justify-between overflow-hidden sm:flex-row">
        <div className="relative z-10 flex w-full items-center overflow-hidden pl-4 pr-4 sm:pr-0 xl:w-7/12 2xl:w-2/3">
          <Link
            href={display.href}
            className="relative h-auto w-12 flex-shrink-0 scale-100 transform-gpu overflow-hidden rounded-md transition duration-300 hover:scale-105"
          >
            <CachedImage
              type={display.posterType}
              src={display.poster ?? '/images/allseerr_poster_not_found.png'}
              alt=""
              sizes="100vw"
              style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
              width={600}
              height={900}
            />
          </Link>
          <div className="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
            <div className="pt-0.5 text-xs font-medium text-white sm:pt-1">
              {display.year}
            </div>
            <Link href={display.href}>
              <span className="mr-2 min-w-0 truncate text-lg font-bold text-white hover:underline xl:text-xl">
                {display.name}
              </span>
            </Link>
          </div>
        </div>

        <div className="z-10 ml-4 mt-4 flex w-full flex-col justify-center overflow-hidden pr-4 text-sm sm:ml-2 sm:mt-0 xl:flex-1 xl:pr-0">
          <div className="card-field">
            <span className="card-field-name">Status</span>
            <Badge badgeType="danger">
              {intl.formatMessage(globalMessages.blocklisted)}
            </Badge>
          </div>

          {item.createdAt && (
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(globalMessages.blocklisted)}
              </span>
              <span className="flex truncate text-sm text-gray-300">
                {intl.formatMessage(messages.blocklistedby, {
                  date: (
                    <FormattedRelativeTime
                      value={Math.floor(
                        (new Date(item.createdAt).getTime() - Date.now()) / 1000
                      )}
                      updateIntervalInSeconds={1}
                      numeric="auto"
                    />
                  ),
                  user: item.user ? (
                    <Link href={`/users/${item.user.id}`}>
                      <span className="group flex items-center truncate">
                        <CachedImage
                          type="avatar"
                          src={item.user.avatar}
                          alt=""
                          className="avatar-sm ml-1.5"
                          width={20}
                          height={20}
                          style={{ objectFit: 'cover' }}
                        />
                        <span className="ml-1 truncate text-sm font-semibold group-hover:text-white group-hover:underline">
                          {item.user.displayName}
                        </span>
                      </span>
                    </Link>
                  ) : item.blocklistedTags ? (
                    <span className="ml-1">
                      <BlocklistedTagsBadge data={item} />
                    </span>
                  ) : (
                    <span className="ml-1 truncate text-sm font-semibold">
                      ???
                    </span>
                  ),
                })}
              </span>
            </div>
          )}
          <div className="card-field">
            <div
              className={`pointer-events-none z-40 self-start rounded-full border shadow-md ${badge.className}`}
            >
              <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                {intl.formatMessage(globalMessages[badge.message])}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="z-10 mt-4 flex w-full flex-col justify-center space-y-2 pl-4 pr-4 xl:mt-0 xl:w-96 xl:items-end xl:pl-0">
        {hasPermission(Permission.MANAGE_BLOCKLIST) && (
          <ConfirmButton
            onClick={() => removeFromBlocklist(display.name)}
            confirmText={intl.formatMessage(
              isUpdating ? globalMessages.deleting : globalMessages.areyousure
            )}
            className={`w-full ${
              isUpdating ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <TrashIcon />
            <span>
              {intl.formatMessage(globalMessages.removefromBlocklist)}
            </span>
          </ConfirmButton>
        )}
      </div>
    </div>
  );
};
