import ComingUpSlider from '@app/components/Discover/ComingUpSlider';
import MovieGenreSlider from '@app/components/Discover/MovieGenreSlider';
import NetworkSlider from '@app/components/Discover/NetworkSlider';
import PlexWatchlistSlider from '@app/components/Discover/PlexWatchlistSlider';
import RecentRequestsSlider from '@app/components/Discover/RecentRequestsSlider';
import RecentlyAddedSlider from '@app/components/Discover/RecentlyAddedSlider';
import StudioSlider from '@app/components/Discover/StudioSlider';
import TvGenreSlider from '@app/components/Discover/TvGenreSlider';
import { sliderTitles } from '@app/components/Discover/constants';
import MediaSlider from '@app/components/MediaSlider';
import { encodeURIExtraParams } from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import { getBookSubjectSliderUrls } from '@app/utils/bookSubjectSlider';
import defineMessages from '@app/utils/defineMessages';
import type { SpaceMediaType } from '@app/utils/discoverMediaFilter';
import { DiscoverSliderType } from '@server/constants/discover';
import type DiscoverSlider from '@server/entity/DiscoverSlider';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover', {
  trendingmovies: 'Trending Movies',
  trendingtv: 'Trending Series',
});

/** Today as YYYY-MM-DD in the local timezone, for the upcoming rows */
const getUpcomingDate = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(now.getTime() - offset * 60 * 1000)
    .toISOString()
    .split('T')[0];
};

interface DiscoverSliderRowProps {
  slider: Partial<DiscoverSlider>;
  /** The media type of the space the row is in, if any */
  narrowTo?: SpaceMediaType;
}

/**
 * One configured Discover row, as shown on the For You home and in the
 * spaces. Rows for a service that is not set up render nothing.
 */
const DiscoverSliderRow = ({ slider, narrowTo }: DiscoverSliderRowProps) => {
  const intl = useIntl();
  const settings = useSettings();
  const upcomingDate = getUpcomingDate();
  let sliderComponent: React.ReactNode = null;

  switch (slider.type) {
    case DiscoverSliderType.RECENTLY_ADDED:
      sliderComponent = <RecentlyAddedSlider mediaType={narrowTo} />;
      break;
    case DiscoverSliderType.RECENT_REQUESTS:
      sliderComponent = <RecentRequestsSlider mediaType={narrowTo} />;
      break;
    case DiscoverSliderType.PLEX_WATCHLIST:
      sliderComponent = <PlexWatchlistSlider mediaType={narrowTo} />;
      break;
    case DiscoverSliderType.TRENDING:
      sliderComponent =
        narrowTo === 'movie' || narrowTo === 'tv' ? (
          <MediaSlider
            sliderKey={`trending-${narrowTo}`}
            title={intl.formatMessage(
              narrowTo === 'movie'
                ? messages.trendingmovies
                : messages.trendingtv
            )}
            url="/api/v1/discover/trending"
            extraParams={`mediaType=${narrowTo}`}
            linkUrl={`/discover/trending?mediaType=${narrowTo}`}
          />
        ) : (
          <MediaSlider
            sliderKey="trending"
            title={intl.formatMessage(sliderTitles.trending)}
            url="/api/v1/discover/trending"
            linkUrl="/discover/trending"
          />
        );
      break;
    case DiscoverSliderType.POPULAR_MOVIES:
      sliderComponent = (
        <MediaSlider
          sliderKey="popular-movies"
          title={intl.formatMessage(sliderTitles.popularmovies)}
          url="/api/v1/discover/movies"
          linkUrl="/movies/browse"
        />
      );
      break;
    case DiscoverSliderType.MOVIE_GENRES:
      sliderComponent = <MovieGenreSlider />;
      break;
    case DiscoverSliderType.UPCOMING_MOVIES:
      sliderComponent = (
        <MediaSlider
          sliderKey="upcoming"
          title={intl.formatMessage(sliderTitles.upcoming)}
          linkUrl={`/movies/browse?primaryReleaseDateGte=${upcomingDate}`}
          url="/api/v1/discover/movies"
          extraParams={`primaryReleaseDateGte=${upcomingDate}`}
        />
      );
      break;
    case DiscoverSliderType.STUDIOS:
      sliderComponent = <StudioSlider />;
      break;
    case DiscoverSliderType.POPULAR_TV:
      sliderComponent = (
        <MediaSlider
          sliderKey="popular-tv"
          title={intl.formatMessage(sliderTitles.populartv)}
          url="/api/v1/discover/tv"
          linkUrl="/series/browse"
        />
      );
      break;
    case DiscoverSliderType.TV_GENRES:
      sliderComponent = <TvGenreSlider />;
      break;
    case DiscoverSliderType.UPCOMING_TV:
      sliderComponent = (
        <MediaSlider
          sliderKey="upcoming-tv"
          title={intl.formatMessage(sliderTitles.upcomingtv)}
          linkUrl={`/series/browse?firstAirDateGte=${upcomingDate}`}
          url="/api/v1/discover/tv"
          extraParams={`firstAirDateGte=${upcomingDate}`}
        />
      );
      break;
    case DiscoverSliderType.NETWORKS:
      sliderComponent = <NetworkSlider />;
      break;
    // Music rows only make sense once a Lidarr server is set up
    case DiscoverSliderType.POPULAR_MUSIC:
      sliderComponent = settings.currentSettings.musicEnabled ? (
        <MediaSlider
          sliderKey="popular-music"
          title={intl.formatMessage(sliderTitles.popularmusic)}
          url="/api/v1/discover/music/albums"
          linkUrl="/music/browse?list=popular"
        />
      ) : null;
      break;
    case DiscoverSliderType.NEW_MUSIC:
      sliderComponent = settings.currentSettings.musicEnabled ? (
        <MediaSlider
          sliderKey="new-music"
          title={intl.formatMessage(sliderTitles.newmusic)}
          url="/api/v1/discover/music"
          linkUrl="/music/browse?list=new"
        />
      ) : null;
      break;
    case DiscoverSliderType.TMDB_MOVIE_KEYWORD:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url="/api/v1/discover/movies"
          extraParams={
            slider.data ? `keywords=${encodeURIExtraParams(slider.data)}` : ''
          }
          linkUrl={`/movies/browse?keywords=${slider.data}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_TV_KEYWORD:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url="/api/v1/discover/tv"
          extraParams={
            slider.data ? `keywords=${encodeURIExtraParams(slider.data)}` : ''
          }
          linkUrl={`/series/browse?keywords=${slider.data}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_MOVIE_GENRE:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url={`/api/v1/discover/movies`}
          extraParams={`genre=${slider.data}`}
          linkUrl={`/movies/browse?genre=${slider.data}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_TV_GENRE:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url={`/api/v1/discover/tv`}
          extraParams={`genre=${slider.data}`}
          linkUrl={`/series/browse?genre=${slider.data}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_STUDIO:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url={`/api/v1/discover/movies/studio/${slider.data}`}
          linkUrl={`/discover/movies/studio/${slider.data}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_NETWORK:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url={`/api/v1/discover/tv/network/${slider.data}`}
          linkUrl={`/discover/tv/network/${slider.data}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_SEARCH:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url="/api/v1/search"
          extraParams={`query=${slider.data}`}
          linkUrl={`/search?query=${slider.data}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url="/api/v1/discover/movies"
          extraParams={`watchRegion=${
            slider.data?.split(',')[0]
          }&watchProviders=${slider.data?.split(',')[1]}`}
          linkUrl={`/movies/browse?watchRegion=${
            slider.data?.split(',')[0]
          }&watchProviders=${slider.data?.split(',')[1]}`}
        />
      );
      break;
    case DiscoverSliderType.TMDB_TV_STREAMING_SERVICES:
      sliderComponent = (
        <MediaSlider
          sliderKey={`custom-slider-${slider.id}`}
          title={slider.title ?? ''}
          url="/api/v1/discover/tv"
          extraParams={`watchRegion=${
            slider.data?.split(',')[0]
          }&watchProviders=${slider.data?.split(',')[1]}`}
          linkUrl={`/series/browse?watchRegion=${
            slider.data?.split(',')[0]
          }&watchProviders=${slider.data?.split(',')[1]}`}
        />
      );
      break;
    // Books are only discovered once LazyLibrarian can fulfil requests
    case DiscoverSliderType.TRENDING_BOOKS:
      if (settings.currentSettings.booksEnabled) {
        sliderComponent = (
          <MediaSlider
            sliderKey="trending-books"
            title={intl.formatMessage(sliderTitles.trendingbooks)}
            url="/api/v1/discover/books"
            linkUrl="/books/browse?list=trending"
          />
        );
      }
      break;
    case DiscoverSliderType.POPULAR_BOOKS:
      if (settings.currentSettings.booksEnabled) {
        sliderComponent = (
          <MediaSlider
            sliderKey="popular-books"
            title={intl.formatMessage(sliderTitles.popularbooks)}
            url="/api/v1/discover/books/popular"
            linkUrl="/books/browse?list=popular"
          />
        );
      }
      break;
    case DiscoverSliderType.BOOK_SUBJECT:
      if (settings.currentSettings.booksEnabled && slider.data) {
        const { url, linkUrl } = getBookSubjectSliderUrls(slider.data);

        sliderComponent = (
          <MediaSlider
            sliderKey={`custom-slider-${slider.id}`}
            title={slider.title ?? ''}
            url={url}
            linkUrl={linkUrl}
          />
        );
      }
      break;
    case DiscoverSliderType.COMING_UP:
      sliderComponent = (
        <ComingUpSlider
          mediaType={
            narrowTo === 'movie' || narrowTo === 'tv' || narrowTo === 'music'
              ? narrowTo
              : undefined
          }
        />
      );
      break;
  }

  return <>{sliderComponent}</>;
};

export default DiscoverSliderRow;
