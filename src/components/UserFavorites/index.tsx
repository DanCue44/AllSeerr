import { ambientGrid } from '@app/components/Allseerr/ListPage';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import TitleCard from '@app/components/TitleCard';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import useDiscover from '@app/hooks/useDiscover';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { useUser } from '@app/hooks/useUser';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { FavoriteItem } from '@server/interfaces/api/favoriteInterfaces';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.UserFavorites', {
  yourfavorites: 'Your Favorites',
  favorites: 'Favorites',
});

const UserFavorites = () => {
  const intl = useIntl();
  const router = useRouter();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const { user } = useUser({
    id: Number(router.query.userId),
  });

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<FavoriteItem, unknown, { userId?: number }>(
    '/api/v1/favorite',
    // Without a user id the server returns the current user's favorites
    router.query.userId ? { userId: Number(router.query.userId) } : {},
    { hideAvailable: false, hideBlocklisted: false, hideRequested: false }
  );

  const isLoading =
    isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0);
  useVerticalScroll(fetchMore, !isLoading && !isEmpty && !isReachingEnd);

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = intl.formatMessage(
    router.query.userId ? messages.favorites : messages.yourfavorites
  );

  return (
    <>
      <PageTitle
        title={[title, router.query.userId ? user?.displayName : '']}
      />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            router.query.userId ? (
              <Link href={`/users/${user?.id}`} className="hover:underline">
                {user?.displayName}
              </Link>
            ) : (
              ''
            )
          }
        >
          {title}
        </Header>
      </div>
      {isEmpty &&
        (ambient ? (
          <div className="mx-auto mt-24 w-full max-w-md rounded-[22px] bg-as-surface px-6 py-10 text-center font-display text-[18px] font-medium text-as-ink-faint">
            {intl.formatMessage(globalMessages.noresults)}
          </div>
        ) : (
          <div className="mt-64 w-full text-center text-2xl text-gray-400">
            {intl.formatMessage(globalMessages.noresults)}
          </div>
        ))}
      <ul className={ambient ? `${ambientGrid} pb-10` : 'cards-vertical'}>
        {titles.map((favorite) => (
          <li key={`favorite-${favorite.id}`}>
            <TmdbTitleCard
              id={favorite.tmdbId ?? favorite.id}
              tmdbId={favorite.tmdbId ?? 0}
              mbId={favorite.mbId}
              olId={favorite.olId}
              type={favorite.mediaType}
              canExpand
            />
          </li>
        ))}
        {isLoading &&
          !isReachingEnd &&
          [...Array(20)].map((_item, i) => (
            <li key={`placeholder-${i}`}>
              <TitleCard.Placeholder canExpand />
            </li>
          ))}
      </ul>
    </>
  );
};

export default UserFavorites;
