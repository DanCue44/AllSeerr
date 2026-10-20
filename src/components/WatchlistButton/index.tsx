import Spinner from '@app/assets/spinner.svg';
import { pillSecondaryCollapse } from '@app/components/Allseerr/Title/styles';
import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import {
  EyeIcon,
  MinusCircleIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { mutate } from 'swr';

const messages = defineMessages('components.WatchlistButton', {
  watchlistSuccess: '<strong>{title}</strong> added to watchlist successfully!',
  watchlistDeleted:
    '<strong>{title}</strong> Removed from watchlist successfully!',
  watchlistError: 'Something went wrong. Please try again.',
  removefromwatchlist: 'Remove From Watchlist',
  addtowatchlist: 'Add To Watchlist',
  watchlist: 'Watchlist',
  onwatchlist: 'On watchlist',
});

interface WatchlistButtonProps {
  mediaType: 'music' | 'book' | 'artist' | 'author';
  // The MusicBrainz release group id of an album, the OpenLibrary work id of
  // a book, or the MusicBrainz artist or OpenLibrary author id of an artist
  // or author to follow
  id: string;
  title: string;
  onUserWatchlist?: boolean;
  ambient?: boolean;
}

/**
 * Watchlist toggle for albums and books, in the style of the movie and
 * series page buttons. Plex has no albums or books, so unlike those it is
 * offered to Plex users too. On artist and author pages it follows them.
 */
const WatchlistButton = ({
  mediaType,
  id,
  title,
  onUserWatchlist = false,
  ambient,
}: WatchlistButtonProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isUpdating, setIsUpdating] = useState(false);
  const [onWatchlist, setOnWatchlist] = useState(onUserWatchlist);

  useEffect(() => {
    setOnWatchlist(onUserWatchlist);
  }, [onUserWatchlist]);

  const onClick = async (): Promise<void> => {
    setIsUpdating(true);

    try {
      if (onWatchlist) {
        await axios.delete(`/api/v1/watchlist/${id}?mediaType=${mediaType}`);
      } else {
        await axios.post('/api/v1/watchlist', {
          ...(mediaType === 'music' || mediaType === 'artist'
            ? { mbId: id }
            : { olId: id }),
          mediaType,
          title,
        });
      }

      addToast(
        <span>
          {intl.formatMessage(
            onWatchlist ? messages.watchlistDeleted : messages.watchlistSuccess,
            {
              title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            }
          )}
        </span>,
        { appearance: onWatchlist ? 'info' : 'success', autoDismiss: true }
      );
      setOnWatchlist(!onWatchlist);
      // Refresh the watchlist sliders and pages if they are cached
      mutate(
        (key) =>
          typeof key === 'string' &&
          key.startsWith('/api/v1/') &&
          key.includes('/watchlist')
      );
    } catch {
      addToast(intl.formatMessage(messages.watchlistError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (ambient) {
    return (
      <Button
        className={pillSecondaryCollapse}
        onClick={onClick}
        disabled={isUpdating}
      >
        {isUpdating ? (
          <Spinner />
        ) : onWatchlist ? (
          <MinusCircleIcon />
        ) : (
          <EyeIcon />
        )}
        <span className="max-sm:sr-only">
          {intl.formatMessage(
            onWatchlist ? messages.onwatchlist : messages.watchlist
          )}
        </span>
      </Button>
    );
  }

  return (
    <Tooltip
      content={intl.formatMessage(
        onWatchlist ? messages.removefromwatchlist : messages.addtowatchlist
      )}
    >
      <Button
        buttonType={onWatchlist ? 'default' : 'ghost'}
        className="ml-2 first:ml-0"
        onClick={onClick}
        disabled={isUpdating}
      >
        {isUpdating ? (
          <Spinner />
        ) : onWatchlist ? (
          <MinusCircleIcon className="!mr-0" />
        ) : (
          <StarIcon className="!mr-0 text-amber-300" />
        )}
      </Button>
    </Tooltip>
  );
};

export default WatchlistButton;
