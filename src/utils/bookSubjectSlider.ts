import { getSpaceSectionPath } from './spaces';

/**
 * Where a book subject slider loads its books from, and the page of the
 * books space its "see all" link opens.
 */
export const getBookSubjectSliderUrls = (
  subject: string
): { url: string; linkUrl: string } => {
  const encoded = encodeURIComponent(subject);

  return {
    url: `/api/v1/discover/books/subject/${encoded}`,
    linkUrl: `${getSpaceSectionPath(
      'books',
      'browse'
    )}?list=subject&subject=${encoded}`,
  };
};
