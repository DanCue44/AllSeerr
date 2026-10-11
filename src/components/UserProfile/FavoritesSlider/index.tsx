import Slider from '@app/components/Slider';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { FavoriteResultsResponse } from '@server/interfaces/api/favoriteInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.UserProfile.FavoritesSlider', {
  favorites: "{username}'s Favorites",
  emptyfavorites:
    'Use the heart button on a movie, series, album or book to add it to your favorites.',
});

interface FavoritesSliderProps {
  user: User;
}

const FavoritesSlider = ({ user }: FavoritesSliderProps) => {
  const intl = useIntl();
  const { user: currentUser, hasPermission: currentHasPermission } = useUser();

  const isOwnProfile = user.id === currentUser?.id;
  const canView =
    isOwnProfile ||
    currentHasPermission(
      [Permission.MANAGE_REQUESTS, Permission.WATCHLIST_VIEW],
      { type: 'or' }
    );

  const { data, error } = useSWR<FavoriteResultsResponse>(
    canView ? `/api/v1/favorite?userId=${user.id}` : null,
    { revalidateOnMount: true }
  );

  // Other users' empty favorites are hidden instead of showing a hint
  if (
    !canView ||
    error ||
    (data && data.results.length === 0 && !isOwnProfile)
  ) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <Link
          href={
            isOwnProfile ? '/profile/favorites' : `/users/${user.id}/favorites`
          }
          className="slider-title"
        >
          <span>
            {intl.formatMessage(messages.favorites, {
              username: user.displayName,
            })}
          </span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey="favorites"
        isLoading={!data}
        isEmpty={!!data && data.results.length === 0}
        emptyMessage={intl.formatMessage(messages.emptyfavorites)}
        items={data?.results.map((item) => (
          <TmdbTitleCard
            id={item.tmdbId ?? item.id}
            key={`favorites-slider-item-${item.id}`}
            tmdbId={item.tmdbId ?? 0}
            mbId={item.mbId}
            olId={item.olId}
            type={item.mediaType}
          />
        ))}
      />
    </>
  );
};

export default FavoritesSlider;
