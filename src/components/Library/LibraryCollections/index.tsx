import { CollectionBanner } from '@app/components/Allseerr/Title';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import LibraryLayout, {
  messages as libraryMessages,
} from '@app/components/Library';
import useDiscover from '@app/hooks/useDiscover';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import type { CollectionResult } from '@server/models/Search';
import { useIntl } from 'react-intl';

interface CollectionBannerGridProps {
  items: CollectionResult[];
  isEmpty?: boolean;
  isLoading: boolean;
  isReachingEnd?: boolean;
  onScrollBottom: () => void;
}

/** Ambient collections: rounded banner cards with the backdrop. */
const CollectionBannerGrid = ({
  items,
  isEmpty,
  isLoading,
  isReachingEnd,
  onScrollBottom,
}: CollectionBannerGridProps) => {
  const intl = useIntl();
  useVerticalScroll(onScrollBottom, !isLoading && !isEmpty && !isReachingEnd);

  return (
    <>
      {isEmpty && (
        <div className="mx-auto mt-24 w-full max-w-md rounded-[22px] bg-as-surface px-6 py-10 text-center font-display text-[18px] font-medium text-as-ink-faint">
          {intl.formatMessage(globalMessages.noresults)}
        </div>
      )}
      <ul className="grid grid-cols-1 gap-5 pb-10 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((collection, index) => (
          <li key={`collection-${collection.id}-${index}`}>
            <CollectionBanner
              href={`/collection/${collection.id}`}
              name={collection.title}
              backdropPath={collection.backdropPath}
              description={collection.overview}
              viewLabel={intl.formatMessage(globalMessages.view)}
            />
          </li>
        ))}
        {isLoading &&
          !isReachingEnd &&
          [...Array(6)].map((_item, i) => (
            <li key={`placeholder-${i}`}>
              <div className="h-[130px] animate-pulse rounded-[22px] bg-as-tile" />
            </li>
          ))}
      </ul>
    </>
  );
};

const LibraryCollections = () => {
  const intl = useIntl();
  const [interfaceStyle] = useInterfaceStyle();

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<CollectionResult>('/api/v1/library/collections', undefined, {
    hideAvailable: false,
    hideBlocklisted: false,
    hideRequested: false,
  });

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const isLoading =
    isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0);

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(libraryMessages.collections),
          intl.formatMessage(libraryMessages.library),
        ]}
      />
      <LibraryLayout>
        {interfaceStyle === 'ambient' ? (
          <CollectionBannerGrid
            items={titles ?? []}
            isEmpty={isEmpty}
            isLoading={isLoading}
            isReachingEnd={isReachingEnd}
            onScrollBottom={fetchMore}
          />
        ) : (
          <ListView
            items={titles}
            isEmpty={isEmpty}
            isLoading={isLoading}
            isReachingEnd={isReachingEnd}
            onScrollBottom={fetchMore}
          />
        )}
      </LibraryLayout>
    </>
  );
};

export default LibraryCollections;
