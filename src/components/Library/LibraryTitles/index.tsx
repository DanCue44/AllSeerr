import {
  listPageMessages,
  PillSelect,
} from '@app/components/AllSeerr/ListPage';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import LibraryLayout, {
  messages as libraryMessages,
} from '@app/components/Library';
import useDiscover from '@app/hooks/useDiscover';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BarsArrowDownIcon, FunnelIcon } from '@heroicons/react/24/solid';
import type { TmdbGenre } from '@server/api/themoviedb/interfaces';
import type { LibrarySortOptions } from '@server/lib/library';
import type { MovieResult, TvResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Library.LibraryTitles', {
  sortMediaAddedDesc: 'Date Added Descending',
  sortMediaAddedAsc: 'Date Added Ascending',
  sortReleaseDateDesc: 'Release Date Descending',
  sortReleaseDateAsc: 'Release Date Ascending',
  sortTmdbRatingDesc: 'TMDB Rating Descending',
  sortTmdbRatingAsc: 'TMDB Rating Ascending',
  sortTitleAsc: 'Title (A-Z) Ascending',
  sortTitleDesc: 'Title (Z-A) Descending',
  allgenres: 'All Genres',
});

const SortOptions: Record<string, LibrarySortOptions> = {
  MediaAddedDesc: 'mediaAdded.desc',
  MediaAddedAsc: 'mediaAdded.asc',
  ReleaseDateDesc: 'releaseDate.desc',
  ReleaseDateAsc: 'releaseDate.asc',
  TmdbRatingDesc: 'rating.desc',
  TmdbRatingAsc: 'rating.asc',
  TitleAsc: 'title.asc',
  TitleDesc: 'title.desc',
} as const;

interface LibraryTitlesProps {
  type: 'movie' | 'tv';
  /** Shown inside a space, which brings its own title and tabs */
  embedded?: boolean;
}

const LibraryTitles = ({ type, embedded = false }: LibraryTitlesProps) => {
  const intl = useIntl();
  const router = useRouter();
  const [interfaceStyle] = useInterfaceStyle();

  const sortBy =
    (router.query.sortBy as LibrarySortOptions | undefined) ??
    SortOptions.MediaAddedDesc;
  const genre = router.query.genre as string | undefined;

  const updateQueryParams = useUpdateQueryParams({
    sortBy: router.query.sortBy,
    genre,
  });

  const { data: genres } = useSWR<TmdbGenre[]>(`/api/v1/genres/${type}`);

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<MovieResult | TvResult, unknown, Record<string, string>>(
    '/api/v1/library',
    { type, sortBy, ...(genre ? { genre } : {}) },
    // The library lists what is available, so the discover filters do not apply
    { hideAvailable: false, hideBlocklisted: false, hideRequested: false }
  );

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const sortOptions = (
    <>
      <option value={SortOptions.MediaAddedDesc}>
        {intl.formatMessage(messages.sortMediaAddedDesc)}
      </option>
      <option value={SortOptions.MediaAddedAsc}>
        {intl.formatMessage(messages.sortMediaAddedAsc)}
      </option>
      <option value={SortOptions.ReleaseDateDesc}>
        {intl.formatMessage(messages.sortReleaseDateDesc)}
      </option>
      <option value={SortOptions.ReleaseDateAsc}>
        {intl.formatMessage(messages.sortReleaseDateAsc)}
      </option>
      <option value={SortOptions.TmdbRatingDesc}>
        {intl.formatMessage(messages.sortTmdbRatingDesc)}
      </option>
      <option value={SortOptions.TmdbRatingAsc}>
        {intl.formatMessage(messages.sortTmdbRatingAsc)}
      </option>
      <option value={SortOptions.TitleAsc}>
        {intl.formatMessage(messages.sortTitleAsc)}
      </option>
      <option value={SortOptions.TitleDesc}>
        {intl.formatMessage(messages.sortTitleDesc)}
      </option>
    </>
  );

  const genreOptions = (
    <>
      <option value="">{intl.formatMessage(messages.allgenres)}</option>
      {genres?.map((g) => (
        <option key={`genre-${g.id}`} value={g.id}>
          {g.name}
        </option>
      ))}
    </>
  );

  const ambientActions = (
    <>
      <PillSelect
        id="sortBy"
        label={intl.formatMessage(listPageMessages.sortBy)}
        icon={<BarsArrowDownIcon />}
        value={sortBy}
        onChange={(e) => updateQueryParams('sortBy', e.target.value)}
      >
        {sortOptions}
      </PillSelect>
      <PillSelect
        id="genre"
        label={intl.formatMessage(listPageMessages.genre)}
        icon={<FunnelIcon />}
        value={genre ?? ''}
        onChange={(e) =>
          updateQueryParams('genre', e.target.value || undefined)
        }
      >
        {genreOptions}
      </PillSelect>
    </>
  );

  const classicActions = (
    <>
      <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
        <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
          <BarsArrowDownIcon className="h-6 w-6" />
        </span>
        <select
          id="sortBy"
          name="sortBy"
          className="rounded-r-only"
          value={sortBy}
          onChange={(e) => updateQueryParams('sortBy', e.target.value)}
        >
          {sortOptions}
        </select>
      </div>
      <div className="mb-2 flex flex-grow sm:mb-0 lg:flex-grow-0">
        <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
          <FunnelIcon className="h-6 w-6" />
        </span>
        <select
          id="genre"
          name="genre"
          className="rounded-r-only"
          value={genre ?? ''}
          onChange={(e) =>
            updateQueryParams('genre', e.target.value || undefined)
          }
        >
          {genreOptions}
        </select>
      </div>
    </>
  );

  const actions =
    interfaceStyle === 'ambient' ? ambientActions : classicActions;

  const list = (
    <ListView
      items={titles}
      isEmpty={isEmpty}
      isLoading={
        isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
      }
      isReachingEnd={isReachingEnd}
      onScrollBottom={fetchMore}
    />
  );

  if (embedded) {
    return (
      <>
        <div
          className={
            interfaceStyle === 'ambient'
              ? 'mb-6 flex flex-wrap items-center gap-2'
              : 'mb-4 flex flex-col sm:flex-row'
          }
        >
          {actions}
        </div>
        {list}
      </>
    );
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(
            type === 'movie' ? libraryMessages.movies : libraryMessages.series
          ),
          intl.formatMessage(libraryMessages.library),
        ]}
      />
      <LibraryLayout actions={actions}>{list}</LibraryLayout>
    </>
  );
};

export default LibraryTitles;
