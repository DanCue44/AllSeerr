import { DiscoverSliderType } from '@server/constants/discover';
import { isBookSubjectSlug, toBookSubjectSlug } from '@server/lib/bookSubjects';

export type CustomSliderData =
  | { valid: true; data: string | undefined }
  | { valid: false; message: string };

/**
 * Checks the data of a slider an admin created and tidies it into the form
 * the slider is shown from. Only book subject sliders are checked here, the
 * TMDB sliders keep the data their forms send.
 */
export const prepareCustomSliderData = (
  type: DiscoverSliderType | undefined,
  data: string | undefined
): CustomSliderData => {
  if (type === DiscoverSliderType.BOOK_SUBJECT) {
    const subject = typeof data === 'string' ? toBookSubjectSlug(data) : '';

    if (!isBookSubjectSlug(subject)) {
      return {
        valid: false,
        message: 'A book subject slider needs an OpenLibrary subject.',
      };
    }

    return { valid: true, data: subject };
  }

  return { valid: true, data };
};
