import type {
  CalendarItem,
  CalendarItemType,
} from '@server/interfaces/api/calendarInterfaces';

/** The media types the release calendar has entries for */
export type UpcomingMediaType = 'movie' | 'tv' | 'music';

const ITEM_MEDIA_TYPES: Record<CalendarItemType, UpcomingMediaType> = {
  movie: 'movie',
  episode: 'tv',
  album: 'music',
};

export const getCalendarItemMediaType = (
  item: Pick<CalendarItem, 'type'>
): UpcomingMediaType => ITEM_MEDIA_TYPES[item.type];

/**
 * The title page of a calendar entry. Album entries carry the MusicBrainz
 * release group id Lidarr knows them by.
 */
export const getCalendarItemHref = (
  item: Pick<CalendarItem, 'id' | 'type' | 'tmdbId'>
): string | undefined => {
  switch (item.type) {
    case 'movie':
      return item.tmdbId ? `/movie/${item.tmdbId}` : undefined;
    case 'episode':
      return item.tmdbId ? `/tv/${item.tmdbId}` : undefined;
    case 'album': {
      const mbId = item.id.replace(/^album-/, '');
      return mbId && mbId !== item.id ? `/music/${mbId}` : undefined;
    }
  }
};

const titleKey = (item: CalendarItem): string =>
  item.type === 'episode'
    ? `episode-${item.tmdbId ?? item.tvdbId ?? item.title}`
    : item.id;

/**
 * Picks the releases to show from the calendar, soonest first. A row shows
 * each title once (the next episode of a series rather than every episode
 * of a binge drop), while a full list keeps every entry.
 */
export const selectUpcomingItems = (
  items: CalendarItem[],
  {
    mediaType,
    from,
    onePerTitle = false,
    limit,
  }: {
    mediaType?: UpcomingMediaType;
    /** First calendar day to keep (YYYY-MM-DD) */
    from?: string;
    onePerTitle?: boolean;
    limit?: number;
  } = {}
): CalendarItem[] => {
  const seen = new Set<string>();

  const selected = items
    .filter(
      (item) =>
        (!mediaType || getCalendarItemMediaType(item) === mediaType) &&
        (!from || item.date >= from)
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.airDateUtc ?? '').localeCompare(b.airDateUtc ?? '')
    )
    .filter((item) => {
      if (!onePerTitle) {
        return true;
      }

      const key = titleKey(item);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  return limit ? selected.slice(0, limit) : selected;
};

/** Entries grouped by calendar day, keeping the order they come in. */
export const groupByDate = (
  items: CalendarItem[]
): { date: string; items: CalendarItem[] }[] => {
  const groups: { date: string; items: CalendarItem[] }[] = [];

  items.forEach((item) => {
    const last = groups[groups.length - 1];

    if (last && last.date === item.date) {
      last.items.push(item);
    } else {
      groups.push({ date: item.date, items: [item] });
    }
  });

  return groups;
};
