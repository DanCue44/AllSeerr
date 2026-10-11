import Spinner from '@app/assets/spinner.svg';
import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { HeartIcon } from '@heroicons/react/24/outline';
import { HeartIcon as FilledHeartIcon } from '@heroicons/react/24/solid';
import type { FavoriteResultsResponse } from '@server/interfaces/api/favoriteInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.FavoriteButton', {
  addtofavorites: 'Add To Favorites',
  removefromfavorites: 'Remove From Favorites',
  favoriteSuccess: '<strong>{title}</strong> added to favorites!',
  favoriteDeleted: '<strong>{title}</strong> removed from favorites.',
  favoriteError: 'Something went wrong. Please try again.',
});

type FavoriteButtonProps = {
  title: string;
  className?: string;
} & (
  | { mediaType: 'movie' | 'tv'; tmdbId: number }
  // The MusicBrainz release group id of an album, or the OpenLibrary work id
  // of a book
  | { mediaType: 'music' | 'book'; id: string }
);

const FavoriteButton = ({
  title,
  className = 'z-40 mr-2',
  ...props
}: FavoriteButtonProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isUpdating, setIsUpdating] = useState(false);

  const { mediaType } = props;
  // Albums are favorited by mbId and books by olId, in place of tmdbId
  const idField =
    mediaType === 'music' ? 'mbId' : mediaType === 'book' ? 'olId' : 'tmdbId';
  const id = 'tmdbId' in props ? props.tmdbId : props.id;

  const favoriteKey = `/api/v1/favorite?${idField}=${encodeURIComponent(
    id
  )}&mediaType=${mediaType}`;
  const { data, mutate: revalidate } =
    useSWR<FavoriteResultsResponse>(favoriteKey);

  const isFavorite = (data?.totalResults ?? 0) > 0;

  const onClick = async (): Promise<void> => {
    setIsUpdating(true);

    try {
      if (isFavorite) {
        await axios.delete(
          `/api/v1/favorite/${encodeURIComponent(id)}?mediaType=${mediaType}`
        );
      } else {
        await axios.post('/api/v1/favorite', { [idField]: id, mediaType });
      }

      addToast(
        <span>
          {intl.formatMessage(
            isFavorite ? messages.favoriteDeleted : messages.favoriteSuccess,
            {
              title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            }
          )}
        </span>,
        { appearance: isFavorite ? 'info' : 'success', autoDismiss: true }
      );
    } catch {
      addToast(intl.formatMessage(messages.favoriteError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      await revalidate();
      // Refresh the favorites slider and page if they are cached
      mutate(
        (key) => typeof key === 'string' && key.startsWith('/api/v1/favorite?')
      );
      setIsUpdating(false);
    }
  };

  return (
    <Tooltip
      content={intl.formatMessage(
        isFavorite ? messages.removefromfavorites : messages.addtofavorites
      )}
    >
      <Button
        buttonType="ghost"
        className={className}
        buttonSize="md"
        onClick={onClick}
        disabled={!data || isUpdating}
      >
        {isUpdating ? (
          <Spinner />
        ) : isFavorite ? (
          <FilledHeartIcon className="text-red-500" />
        ) : (
          <HeartIcon className="text-red-500" />
        )}
      </Button>
    </Tooltip>
  );
};

export default FavoriteButton;
