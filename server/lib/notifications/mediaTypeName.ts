import { MediaType } from '@server/constants/media';
import type { getIntl } from '@server/i18n';
import globalMessages from '@server/i18n/globalMessages';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import { getPayloadBookFormat } from '@server/lib/notifications/agents/agent';

/**
 * The media type a notification is about, such as "movie" or "audiobook".
 * A bulk request summary that covers both book formats is an "ebook and
 * audiobook" request. With plural, a bulk request summary names what it
 * stands for in the plural, such as "books" or "albums", for sentences like
 * "the following books".
 */
export const getPayloadMediaTypeName = (
  payload: NotificationPayload,
  intl: ReturnType<typeof getIntl>,
  { plural = false }: { plural?: boolean } = {}
): string | undefined => {
  if (!payload.media) {
    return undefined;
  }

  const isPlural = plural && !!payload.bulk;

  switch (payload.media.mediaType) {
    case MediaType.MOVIE:
      return intl.formatMessage(globalMessages.movie);
    case MediaType.MUSIC:
      return intl.formatMessage(
        isPlural ? globalMessages.albums : globalMessages.album
      );
    case MediaType.BOOK: {
      const format = getPayloadBookFormat(payload);

      if (isPlural) {
        return intl.formatMessage(
          format === 'audiobook'
            ? globalMessages.audiobooks
            : format === 'ebook'
              ? globalMessages.ebooks
              : globalMessages.books
        );
      }

      return intl.formatMessage(
        format === 'audiobook'
          ? globalMessages.audiobook
          : format === 'ebook'
            ? globalMessages.ebook
            : format === 'both'
              ? globalMessages.ebookAndAudiobook
              : globalMessages.book
      );
    }
    default:
      return intl.formatMessage(globalMessages.series);
  }
};
