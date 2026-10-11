import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import MediaSlider from '@app/components/MediaSlider';
import useDiscover from '@app/hooks/useDiscover';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { BookResult } from '@server/models/Search';
import type { MessageDescriptor } from 'react-intl';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverBooks', {
  trendingbooks: 'Trending Books',
  popularbooks: 'Popular Books',
  fantasy: 'Fantasy',
  science_fiction: 'Science Fiction',
  mystery_and_detective_stories: 'Mystery',
  thriller: 'Thrillers',
  romance: 'Romance',
  historical_fiction: 'Historical Fiction',
  biography: 'Biography',
  self_help: 'Self-Help',
  subjectbooks: 'Books on {subject}',
});

// OpenLibrary subjects shown on the books page, each with its own slider
export const BOOK_SUBJECTS = [
  'fantasy',
  'science_fiction',
  'mystery_and_detective_stories',
  'thriller',
  'romance',
  'historical_fiction',
  'biography',
  'self_help',
] as const;

export type BookSubject = (typeof BOOK_SUBJECTS)[number];

export const isBookSubject = (subject: string): subject is BookSubject =>
  (BOOK_SUBJECTS as readonly string[]).includes(subject);

export const getSubjectTitle = (
  subject: string
): MessageDescriptor | undefined =>
  isBookSubject(subject) ? messages[subject] : undefined;

/**
 * A slider of books for each OpenLibrary subject
 */
export const BookSubjectSliders = () => {
  const intl = useIntl();

  return (
    <>
      {BOOK_SUBJECTS.map((subject) => (
        <MediaSlider
          key={`books-subject-${subject}`}
          sliderKey={`books-subject-${subject}`}
          title={intl.formatMessage(messages[subject])}
          url={`/api/v1/discover/books/subject/${subject}`}
          linkUrl={`/books/browse?list=subject&subject=${subject}`}
        />
      ))}
    </>
  );
};

export type BookList = 'trending' | 'popular' | 'subject';

/** The lists behind the book shelves, as offered on the Browse page */
export const bookListMessages = {
  trending: messages.trendingbooks,
  popular: messages.popularbooks,
};

interface DiscoverBookListProps {
  list: BookList;
  subject?: string;
  /** Shown inside the books space, which brings its own title */
  embedded?: boolean;
}

/**
 * Full list behind one of the book sliders
 */
export const DiscoverBookList = ({
  list,
  subject,
  embedded = false,
}: DiscoverBookListProps) => {
  const intl = useIntl();
  const subjectTitle = subject ? getSubjectTitle(subject) : undefined;
  const title =
    list === 'trending'
      ? intl.formatMessage(messages.trendingbooks)
      : list === 'popular'
        ? intl.formatMessage(messages.popularbooks)
        : subjectTitle
          ? intl.formatMessage(subjectTitle)
          : intl.formatMessage(messages.subjectbooks, {
              subject: subject?.replace(/_/g, ' '),
            });

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<BookResult>(
    list === 'trending'
      ? '/api/v1/discover/books'
      : list === 'popular'
        ? '/api/v1/discover/books/popular'
        : `/api/v1/discover/books/subject/${subject}`
  );

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      {!embedded && (
        <>
          <PageTitle
            title={[title, intl.formatMessage(globalMessages.books)]}
          />
          <div className="mb-5 mt-1">
            <Header>{title}</Header>
          </div>
        </>
      )}
      <ListView
        items={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};
