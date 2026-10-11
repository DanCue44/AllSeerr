import { MediaStatus, MediaType } from '@server/constants/media';

export const NEWSLETTER_DEFAULT_DAY = 0;
export const NEWSLETTER_DEFAULT_HOUR = 9;
export const NEWSLETTER_MAX_ITEMS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewsletterMedia {
  mediaType: MediaType;
  tmdbId: number;
  status: MediaStatus;
  status4k: MediaStatus;
  mediaAddedAt?: Date | null;
}

export interface NewsletterContent<T> {
  movies: T[];
  series: T[];
}

export interface NewsletterSelectionOptions {
  since: Date;
  until?: Date;
  include4k?: boolean;
  limit?: number;
}

const isAvailable = (status: MediaStatus): boolean =>
  [MediaStatus.AVAILABLE, MediaStatus.PARTIALLY_AVAILABLE].includes(status);

/**
 * Picks the media which became available within the given window and groups
 * it into movies and series, newest first.
 */
export const selectNewsletterMedia = <T extends NewsletterMedia>(
  media: T[],
  {
    since,
    until,
    include4k = false,
    limit = NEWSLETTER_MAX_ITEMS,
  }: NewsletterSelectionOptions
): NewsletterContent<T> => {
  const seen = new Set<string>();

  const selected = media
    .filter((item) => {
      if (!item.mediaAddedAt) {
        return false;
      }

      const addedAt = new Date(item.mediaAddedAt).getTime();

      if (
        isNaN(addedAt) ||
        addedAt <= since.getTime() ||
        (until && addedAt > until.getTime())
      ) {
        return false;
      }

      return (
        isAvailable(item.status) || (include4k && isAvailable(item.status4k))
      );
    })
    .sort(
      (a, b) =>
        new Date(b.mediaAddedAt as Date).getTime() -
        new Date(a.mediaAddedAt as Date).getTime()
    )
    .filter((item) => {
      const key = `${item.mediaType}-${item.tmdbId}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  return {
    movies: selected
      .filter((item) => item.mediaType === MediaType.MOVIE)
      .slice(0, limit),
    series: selected
      .filter((item) => item.mediaType === MediaType.TV)
      .slice(0, limit),
  };
};

/**
 * Returns the start of the newsletter window. Falls back to one week ago if a
 * newsletter has never been sent (or the stored value is invalid).
 */
export const getNewsletterSince = (lastSentAt?: string, now = new Date()) => {
  const since = lastSentAt ? new Date(lastSentAt) : undefined;

  if (!since || isNaN(since.getTime()) || since > now) {
    return new Date(now.getTime() - 7 * DAY_MS);
  }

  return since;
};

/**
 * Builds the weekly cron schedule for the given day of the week (0 = Sunday)
 * and hour, falling back to the defaults for invalid values.
 */
export const getNewsletterSchedule = (day?: number, hour?: number): string => {
  const validDay =
    Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6
      ? (day as number)
      : NEWSLETTER_DEFAULT_DAY;
  const validHour =
    Number.isInteger(hour) && (hour as number) >= 0 && (hour as number) <= 23
      ? (hour as number)
      : NEWSLETTER_DEFAULT_HOUR;

  return `0 0 ${validHour} * * ${validDay}`;
};
