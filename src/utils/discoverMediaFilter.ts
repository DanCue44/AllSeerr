import { DiscoverSliderType } from '@server/constants/discover';

/**
 * The media types a Discover row can be narrowed to. The values match the
 * mediaType filter of the request and media APIs, so they can be passed on
 * as they are.
 */
export const SPACE_MEDIA_TYPES = ['movie', 'tv', 'music', 'book'] as const;

export type SpaceMediaType = (typeof SPACE_MEDIA_TYPES)[number];

/** A media type, or every type at once as on the For You home */
export type DiscoverMediaFilter = 'all' | SpaceMediaType;

export type SliderMediaKind = SpaceMediaType | 'mixed';

/**
 * The kind of media a Discover slider shows. Mixed sliders hold more than one
 * media type.
 */
export const getSliderMediaKind = (
  type: DiscoverSliderType
): SliderMediaKind => {
  switch (type) {
    case DiscoverSliderType.POPULAR_MOVIES:
    case DiscoverSliderType.MOVIE_GENRES:
    case DiscoverSliderType.UPCOMING_MOVIES:
    case DiscoverSliderType.STUDIOS:
    case DiscoverSliderType.TMDB_MOVIE_KEYWORD:
    case DiscoverSliderType.TMDB_MOVIE_GENRE:
    case DiscoverSliderType.TMDB_STUDIO:
    case DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES:
      return 'movie';
    case DiscoverSliderType.POPULAR_TV:
    case DiscoverSliderType.TV_GENRES:
    case DiscoverSliderType.UPCOMING_TV:
    case DiscoverSliderType.NETWORKS:
    case DiscoverSliderType.TMDB_TV_KEYWORD:
    case DiscoverSliderType.TMDB_TV_GENRE:
    case DiscoverSliderType.TMDB_NETWORK:
    case DiscoverSliderType.TMDB_TV_STREAMING_SERVICES:
      return 'tv';
    case DiscoverSliderType.POPULAR_MUSIC:
    case DiscoverSliderType.NEW_MUSIC:
      return 'music';
    case DiscoverSliderType.TRENDING_BOOKS:
    case DiscoverSliderType.POPULAR_BOOKS:
    case DiscoverSliderType.BOOK_SUBJECT:
      return 'book';
    default:
      return 'mixed';
  }
};

// Mixed sliders whose data can be narrowed to any one media type
const FILTERABLE_MIXED: DiscoverSliderType[] = [
  DiscoverSliderType.RECENTLY_ADDED,
  DiscoverSliderType.RECENT_REQUESTS,
  DiscoverSliderType.PLEX_WATCHLIST,
];

// TMDB trending can be narrowed to movies or series, but has no music or books
const TRENDING_FILTERS: DiscoverMediaFilter[] = ['movie', 'tv'];

/**
 * Whether a slider belongs in a media type's space. Mixed sliders that cannot
 * be narrowed (such as a TMDB search) are left out, as is Coming Up, which a
 * space shows on its own Upcoming page.
 */
export const isSliderInDiscoverFilter = (
  type: DiscoverSliderType,
  filter: DiscoverMediaFilter
): boolean => {
  if (filter === 'all') {
    return true;
  }

  const kind = getSliderMediaKind(type);

  if (kind !== 'mixed') {
    return kind === filter;
  }

  if (type === DiscoverSliderType.TRENDING) {
    return TRENDING_FILTERS.includes(filter);
  }

  return FILTERABLE_MIXED.includes(type);
};

interface SliderLike {
  type?: DiscoverSliderType;
  enabled?: boolean;
  isBuiltIn?: boolean;
}

/**
 * Picks the sliders a media type's space shows, keeping the configured
 * order. Every slider keeps its enabled setting, so a row an admin hid in
 * Customize Discover stays hidden in the spaces too.
 */
export const selectDiscoverSliders = <T extends SliderLike>(
  sliders: T[],
  filter: DiscoverMediaFilter
): T[] =>
  sliders.filter(
    (slider) =>
      slider.type !== undefined &&
      !!slider.enabled &&
      isSliderInDiscoverFilter(slider.type, filter)
  );

/**
 * Whether a slider is shown on the For You home. The home is a personal mix
 * across every media type: the built-in rows made for one type live in that
 * type's space instead, while sliders an admin created are kept.
 */
export const isHomeSlider = (slider: SliderLike): boolean =>
  slider.type !== undefined &&
  (!slider.isBuiltIn || getSliderMediaKind(slider.type) === 'mixed');

/** The enabled sliders of the For You home, in the configured order. */
export const selectHomeSliders = <T extends SliderLike>(sliders: T[]): T[] =>
  sliders.filter((slider) => !!slider.enabled && isHomeSlider(slider));

/**
 * Where a slider shows up when it is enabled: the For You home ('all') and
 * the spaces of the media types it holds. Labels the rows while customizing.
 */
export const getSliderPlacements = (
  slider: SliderLike
): DiscoverMediaFilter[] => {
  const type = slider.type;

  if (type === undefined) {
    return [];
  }

  return [
    ...(isHomeSlider(slider) ? (['all'] as const) : []),
    ...SPACE_MEDIA_TYPES.filter((mediaType) =>
      isSliderInDiscoverFilter(type, mediaType)
    ),
  ];
};
