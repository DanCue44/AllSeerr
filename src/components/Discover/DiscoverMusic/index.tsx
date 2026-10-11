import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import MediaSlider from '@app/components/MediaSlider';
import useDiscover from '@app/hooks/useDiscover';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { AlbumResult, ArtistResult } from '@server/models/Search';
import type { MessageDescriptor } from 'react-intl';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverMusic', {
  popularalbums: 'Popular Albums',
  newreleases: 'New Releases',
  popularartists: 'Popular Artists',
  rock: 'Rock',
  metal: 'Metal',
  pop: 'Pop',
  hiphop: 'Hip Hop',
  rnb: 'R&B and Soul',
  electronic: 'Electronic',
  jazz: 'Jazz',
  country: 'Country',
});

// Genres with a shelf of popular albums, keyed by the slug the API takes
export const MUSIC_GENRES = [
  'rock',
  'pop',
  'hip-hop',
  'electronic',
  'rnb',
  'metal',
  'jazz',
  'country',
] as const;

export type MusicGenre = (typeof MUSIC_GENRES)[number];

const GENRE_TITLES: Record<MusicGenre, MessageDescriptor> = {
  rock: messages.rock,
  metal: messages.metal,
  pop: messages.pop,
  'hip-hop': messages.hiphop,
  rnb: messages.rnb,
  electronic: messages.electronic,
  jazz: messages.jazz,
  country: messages.country,
};

export const isMusicGenre = (genre: string): genre is MusicGenre =>
  (MUSIC_GENRES as readonly string[]).includes(genre);

/** The shelf title of a genre */
export const getMusicGenreTitle = (genre: MusicGenre): MessageDescriptor =>
  GENRE_TITLES[genre];

/** The lists behind the music shelves, as offered on the Browse page */
export const musicListMessages = {
  popular: messages.popularalbums,
  new: messages.newreleases,
  artists: messages.popularartists,
};

/**
 * Popular artists and a slider of popular albums for each genre, for the
 * music page and the music view of Discover
 */
export const MusicGenreSliders = () => {
  const intl = useIntl();

  return (
    <>
      <MediaSlider
        sliderKey="music-artists"
        title={intl.formatMessage(messages.popularartists)}
        url="/api/v1/discover/music/artists"
        linkUrl="/music/browse?list=artists"
      />
      {MUSIC_GENRES.map((genre) => (
        <MediaSlider
          key={`music-genre-${genre}`}
          sliderKey={`music-genre-${genre}`}
          title={intl.formatMessage(GENRE_TITLES[genre])}
          url={`/api/v1/discover/music/genre/${genre}`}
          linkUrl={`/music/browse?list=genre&genre=${genre}`}
          hideWhenEmpty
        />
      ))}
    </>
  );
};

export type MusicList = 'popular' | 'new' | 'artists' | 'genre';

interface DiscoverMusicListProps {
  list: MusicList;
  genre?: string;
  /** Shown inside the music space, which brings its own title */
  embedded?: boolean;
}

const getListUrl = ({ list, genre }: DiscoverMusicListProps): string => {
  switch (list) {
    case 'popular':
      return '/api/v1/discover/music/albums';
    case 'artists':
      return '/api/v1/discover/music/artists';
    case 'genre':
      return `/api/v1/discover/music/genre/${genre}`;
    default:
      return '/api/v1/discover/music';
  }
};

/**
 * Full list behind one of the music sliders
 */
export const DiscoverMusicList = ({
  list,
  genre,
  embedded = false,
}: DiscoverMusicListProps) => {
  const intl = useIntl();
  const validGenre = list !== 'genre' || (!!genre && isMusicGenre(genre));
  const title = intl.formatMessage(
    list === 'popular'
      ? messages.popularalbums
      : list === 'artists'
        ? messages.popularartists
        : list === 'genre' && genre && isMusicGenre(genre)
          ? GENRE_TITLES[genre]
          : messages.newreleases
  );

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<AlbumResult | ArtistResult>(getListUrl({ list, genre }));

  if (!validGenre) {
    return <ErrorPage statusCode={404} />;
  }

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      {!embedded && (
        <>
          <PageTitle
            title={[title, intl.formatMessage(globalMessages.music)]}
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
