import BookRequestModal from '@app/components/RequestModal/BookRequestModal';
import CollectionRequestModal from '@app/components/RequestModal/CollectionRequestModal';
import MovieRequestModal from '@app/components/RequestModal/MovieRequestModal';
import MusicRequestModal from '@app/components/RequestModal/MusicRequestModal';
import TvRequestModal from '@app/components/RequestModal/TvRequestModal';
import { Transition } from '@headlessui/react';
import type { MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';

interface RequestModalProps {
  show: boolean;
  type: 'movie' | 'tv' | 'collection' | 'music' | 'book';
  tmdbId: number;
  // Music is keyed on its MusicBrainz release group id instead of tmdbId
  mbId?: string | null;
  // and books on their OpenLibrary work id
  olId?: string | null;
  is4k?: boolean;
  editRequest?: NonFunctionProperties<MediaRequest>;
  onComplete?: (newStatus: MediaStatus) => void;
  onCancel?: () => void;
  onUpdating?: (isUpdating: boolean) => void;
}

const RequestModal = ({
  type,
  show,
  tmdbId,
  mbId,
  olId,
  is4k,
  editRequest,
  onComplete,
  onUpdating,
  onCancel,
}: RequestModalProps) => {
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
      {type === 'book' ? (
        <BookRequestModal
          onComplete={onComplete}
          onCancel={onCancel}
          olId={olId ?? ''}
          onUpdating={onUpdating}
          editRequest={editRequest}
        />
      ) : type === 'music' ? (
        <MusicRequestModal
          onComplete={onComplete}
          onCancel={onCancel}
          mbId={mbId ?? ''}
          onUpdating={onUpdating}
          editRequest={editRequest}
        />
      ) : type === 'movie' ? (
        <MovieRequestModal
          onComplete={onComplete}
          onCancel={onCancel}
          tmdbId={tmdbId}
          onUpdating={onUpdating}
          is4k={is4k}
          editRequest={editRequest}
        />
      ) : type === 'tv' ? (
        <TvRequestModal
          onComplete={onComplete}
          onCancel={onCancel}
          tmdbId={tmdbId}
          onUpdating={onUpdating}
          is4k={is4k}
          editRequest={editRequest}
        />
      ) : (
        <CollectionRequestModal
          onComplete={onComplete}
          onCancel={onCancel}
          tmdbId={tmdbId}
          onUpdating={onUpdating}
          is4k={is4k}
        />
      )}
    </Transition>
  );
};

export default RequestModal;
