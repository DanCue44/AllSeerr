import Modal from '@app/components/Common/Modal';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';

import type { BookDetails } from '@server/models/Book';
import type { Collection } from '@server/models/Collection';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

interface BlocklistModalProps {
  tmdbId?: number;
  // Albums are named by MusicBrainz release group id, books by OpenLibrary
  // work id
  mbId?: string;
  olId?: string;
  type: 'movie' | 'tv' | 'collection' | 'music' | 'book';
  show: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
  isUpdating?: boolean;
}

const messages = defineMessages('component.BlocklistModal', {
  blocklisting: 'Blocklisting',
});

type BlocklistModalData =
  | MovieDetails
  | TvDetails
  | Collection
  | MusicDetails
  | BookDetails;

const isCollection = (data: BlocklistModalData | null): data is Collection => {
  return (
    data !== null &&
    data !== undefined &&
    (data as Collection).parts !== undefined
  );
};

const isMovie = (movie: BlocklistModalData | null): movie is MovieDetails => {
  if (!movie) return false;
  return (movie as MovieDetails).title !== undefined;
};

const BlocklistModal = ({
  tmdbId,
  mbId,
  olId,
  type,
  show,
  onComplete,
  onCancel,
  isUpdating,
}: BlocklistModalProps) => {
  const intl = useIntl();
  const [data, setData] = useState<BlocklistModalData | null>(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      if (!show) return;
      try {
        setError(null);
        const response = await axios.get(
          `/api/v1/${type}/${
            type === 'music' ? mbId : type === 'book' ? olId : tmdbId
          }`
        );
        setData(response.data);
      } catch (err) {
        setError(err);
      }
    })();
  }, [show, tmdbId, mbId, olId, type]);

  const mediaTypeName =
    type === 'collection'
      ? intl.formatMessage(globalMessages.collection)
      : type === 'music'
        ? intl.formatMessage(globalMessages.album)
        : type === 'book'
          ? intl.formatMessage(globalMessages.book)
          : isMovie(data)
            ? intl.formatMessage(globalMessages.movie)
            : intl.formatMessage(globalMessages.tvshow);

  const backdrop =
    data && 'backdropPath' in data
      ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data.backdropPath}`
      : data && 'artistBackdrop' in data
        ? (data.artistBackdrop ?? undefined)
        : undefined;

  return (
    <Transition
      as="div"
      enter="transition-opacity duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      show={show}
    >
      <Modal
        loading={!data && !error}
        backgroundClickable
        title={`${intl.formatMessage(globalMessages.blocklist)} ${mediaTypeName}`}
        subTitle={`${
          isCollection(data)
            ? data.name
            : data && 'title' in data
              ? data.title
              : data?.name
        }`}
        onCancel={onCancel}
        onOk={onComplete}
        okText={
          isUpdating
            ? intl.formatMessage(messages.blocklisting)
            : intl.formatMessage(globalMessages.blocklist)
        }
        okButtonType="danger"
        okDisabled={isUpdating}
        backdrop={backdrop}
      />
    </Transition>
  );
};

export default BlocklistModal;
