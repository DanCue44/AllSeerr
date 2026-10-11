import TitleCard from '@app/components/TitleCard';
import BookTitleCard from '@app/components/TitleCard/BookTitleCard';
import type { BookDetails } from '@server/models/Book';
import { useInView } from 'react-intersection-observer';
import useSWR from 'swr';

interface OpenLibraryTitleCardProps {
  olId: string;
  canExpand?: boolean;
}

/**
 * Book card for lists that only know the OpenLibrary work id, the book
 * counterpart of TmdbTitleCard
 */
const OpenLibraryTitleCard = ({
  olId,
  canExpand,
}: OpenLibraryTitleCardProps) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const { data: book, error } = useSWR<BookDetails>(
    inView ? `/api/v1/book/${olId}` : null
  );

  if (!book && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!book) {
    return null;
  }

  return (
    <BookTitleCard
      id={book.id}
      mediaType="book"
      title={book.title}
      subtitle={book.authors.map((author) => author.name).join(', ')}
      year={book.firstPublishYear}
      image={book.posterPath}
      status={book.mediaInfo?.status}
      statusAudio={book.mediaInfo?.statusAudio}
      canExpand={canExpand}
    />
  );
};

export default OpenLibraryTitleCard;
