import FeaturedHero from '@app/components/Allseerr/FeaturedHero';
import {
  PillTabs,
  ambientGrid,
  pillControl,
} from '@app/components/Allseerr/ListPage';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import DiscoverSliderRow from '@app/components/Discover/DiscoverSliderRow';
import SpaceLayout from '@app/components/Space';
import TitleCard from '@app/components/TitleCard';
import useComicsEnabled from '@app/hooks/useComicsEnabled';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { selectComicsPageSliders } from '@app/utils/discoverMediaFilter';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { ComicKind } from '@server/constants/media';
import { isComicKind } from '@server/constants/media';
import type DiscoverSlider from '@server/entity/DiscoverSlider';
import type { ComicResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Space.SpaceComics', {
  searchplaceholder: 'Search for a manga or comic series',
  search: 'Search',
  kinds: 'Kinds',
  all: 'All',
  comics: 'Comics',
  requested: 'Requested series',
  intro:
    'Search for a manga or comic series to request it. Talearr adds every volume and your reading app shows them as they arrive.',
  off: 'Comics are not turned on. They need book requests to go to Talearr, with its comics library set up.',
});

interface ComicSearchResponse {
  results: ComicResult[];
  notices: string[];
}

/**
 * Comics and manga in the books space: a search of Talearr's comics lookup,
 * and without a search the comic rows of Customize Discover (trending,
 * popular and new manga, popular comics) above the series requested so far. The lookup asks AniList and Hardcover,
 * so it runs when the search is sent rather than on every key.
 */
const SpaceComics = () => {
  const intl = useIntl();
  const router = useRouter();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const comicsEnabled = useComicsEnabled();
  const query =
    typeof router.query.query === 'string' ? router.query.query.trim() : '';
  const kind = isComicKind(router.query.kind) ? router.query.kind : undefined;
  const [input, setInput] = useState(query);

  useEffect(() => {
    setInput(query);
  }, [query]);

  const { data: search, isValidating } = useSWR<ComicSearchResponse>(
    comicsEnabled && query
      ? `/api/v1/comic/search?${new URLSearchParams({
          query,
          ...(kind ? { kind } : {}),
        }).toString()}`
      : null,
    { revalidateOnFocus: false }
  );
  const { data: library } = useSWR<{ results: ComicResult[] }>(
    comicsEnabled && !query ? '/api/v1/comic/library' : null
  );
  const { data: sliders } = useSWR<DiscoverSlider[]>(
    comicsEnabled && !query ? '/api/v1/settings/discover' : null
  );

  const setQuery = (next: { query?: string; kind?: ComicKind }) =>
    router.replace(
      {
        pathname: router.pathname,
        query: {
          ...(next.query ? { query: next.query } : {}),
          ...(next.kind ? { kind: next.kind } : {}),
        },
      },
      undefined,
      { shallow: true }
    );

  const kindTabs = (
    [undefined, 'manga', 'comic'] as (ComicKind | undefined)[]
  ).map((each) => ({
    key: each ?? 'all',
    label: intl.formatMessage(
      each === 'manga'
        ? globalMessages.manga
        : each === 'comic'
          ? messages.comics
          : messages.all
    ),
    active: kind === each,
    onClick: () => setQuery({ query: input.trim(), kind: each }),
  }));

  const emptyClass = ambient
    ? 'mx-auto mt-10 w-full max-w-md rounded-[22px] bg-as-surface px-6 py-8 text-center text-as-ink-faint'
    : 'mt-16 w-full text-center text-gray-400';

  let body: React.ReactNode;

  if (comicsEnabled === undefined) {
    body = <LoadingSpinner />;
  } else if (!comicsEnabled) {
    body = <div className={emptyClass}>{intl.formatMessage(messages.off)}</div>;
  } else if (query) {
    body =
      !search && isValidating ? (
        <ul className={ambient ? `${ambientGrid} pb-10` : 'cards-vertical'}>
          {[...Array(12)].map((_, i) => (
            <li key={`placeholder-${i}`}>
              <TitleCard.Placeholder canExpand />
            </li>
          ))}
        </ul>
      ) : (
        <>
          {(search?.notices ?? []).map((notice) => (
            <p
              key={notice}
              className={`mb-3 text-sm ${
                ambient ? 'text-as-ink-faint' : 'text-gray-400'
              }`}
            >
              {notice}
            </p>
          ))}
          <ListView
            items={search?.results ?? []}
            isEmpty={!!search && search.results.length === 0}
            isReachingEnd
            onScrollBottom={() => undefined}
          />
        </>
      );
  } else {
    body = (
      <>
        <p
          className={`mb-6 max-w-[640px] text-sm ${
            ambient ? 'text-as-ink-muted' : 'text-gray-400'
          }`}
        >
          {intl.formatMessage(messages.intro)}
        </p>
        {selectComicsPageSliders(sliders ?? []).map((slider) => (
          <div key={`comics-slider-${slider.id}`}>
            <DiscoverSliderRow slider={slider} onComicsPage />
          </div>
        ))}
        {!library && <LoadingSpinner />}
        {library && library.results.length > 0 && (
          <>
            <h2
              className={
                ambient
                  ? 'mb-4 font-display text-[19px] font-medium text-as-ink'
                  : 'mb-4 text-xl font-bold text-white'
              }
            >
              {intl.formatMessage(messages.requested)}
            </h2>
            <ListView
              items={library.results}
              isReachingEnd
              onScrollBottom={() => undefined}
            />
          </>
        )}
      </>
    );
  }

  return (
    <SpaceLayout
      space="books"
      section="comics"
      hero={
        ambient && comicsEnabled && !query ? (
          <FeaturedHero mediaFilter="comic" />
        ) : undefined
      }
    >
      {comicsEnabled && (
        <div className="mb-6 flex flex-col gap-3">
          <form
            role="search"
            className="flex max-w-[640px] items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({ query: input.trim(), kind });
            }}
          >
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={intl.formatMessage(messages.searchplaceholder)}
              aria-label={intl.formatMessage(messages.searchplaceholder)}
              className={
                ambient
                  ? 'h-10 min-w-0 flex-1 rounded-full border border-as-line bg-as-surface px-4 text-sm text-as-ink placeholder:text-as-ink-faint focus:border-as-line-strong focus:outline-none focus:ring-2 focus:ring-as-accent'
                  : 'min-w-0 flex-1 rounded-full'
              }
            />
            <button
              type="submit"
              aria-label={intl.formatMessage(messages.search)}
              className={
                ambient
                  ? `${pillControl} w-10`
                  : 'flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500'
              }
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
            </button>
          </form>
          {query && (
            <PillTabs
              label={intl.formatMessage(messages.kinds)}
              tabs={kindTabs}
            />
          )}
        </div>
      )}
      {body}
    </SpaceLayout>
  );
};

export default SpaceComics;
