import FeaturedHero from '@app/components/AllSeerr/FeaturedHero';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import { BookSubjectSliders } from '@app/components/Discover/DiscoverBooks';
import { MusicGenreSliders } from '@app/components/Discover/DiscoverMusic';
import DiscoverSliderRow from '@app/components/Discover/DiscoverSliderRow';
import MediaSlider from '@app/components/MediaSlider';
import SpaceLayout, { spaceMessages } from '@app/components/Space';
import SpaceChips from '@app/components/Space/SpaceChips';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { selectDiscoverSliders } from '@app/utils/discoverMediaFilter';
import type { SpaceKey } from '@app/utils/spaces';
import { getSpaceSectionPath, SPACES } from '@app/utils/spaces';
import type DiscoverSlider from '@server/entity/DiscoverSlider';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

// Enough votes that the best rated are well known, not obscure
const TOP_RATED_PARAMS = 'sortBy=vote_average.desc&voteCountGte=1500';

/** Shelves of a space that are not set up in Customize Discover */
const SpaceShelves = ({ space }: { space: SpaceKey }) => {
  const intl = useIntl();
  const browse = getSpaceSectionPath(space, 'browse');

  switch (space) {
    case 'movies':
      return (
        <MediaSlider
          sliderKey="top-rated-movies"
          title={intl.formatMessage(spaceMessages.topratedmovies)}
          url="/api/v1/discover/movies"
          extraParams={TOP_RATED_PARAMS}
          linkUrl={`${browse}?${TOP_RATED_PARAMS}`}
        />
      );
    case 'series':
      return (
        <MediaSlider
          sliderKey="top-rated-tv"
          title={intl.formatMessage(spaceMessages.topratedtv)}
          url="/api/v1/discover/tv"
          extraParams={TOP_RATED_PARAMS}
          linkUrl={`${browse}?${TOP_RATED_PARAMS}`}
        />
      );
    case 'music':
      return <MusicGenreSliders />;
    case 'books':
      return <BookSubjectSliders />;
  }
};

/**
 * The Discover section of a space: a banner of what is trending in it, its
 * genres, the Discover rows made for its media type (each keeping the
 * visibility an admin gave it in Customize Discover) and its own shelves.
 */
const SpaceDiscover = ({ space }: { space: SpaceKey }) => {
  const [interfaceStyle] = useInterfaceStyle();
  const { mediaType } = SPACES[space];
  const { data, error } = useSWR<DiscoverSlider[]>('/api/v1/settings/discover');

  return (
    <SpaceLayout
      space={space}
      section="discover"
      hero={
        interfaceStyle === 'ambient' ? (
          <FeaturedHero mediaFilter={mediaType} />
        ) : undefined
      }
    >
      <SpaceChips space={space} />
      {!data && !error ? (
        <LoadingSpinner />
      ) : (
        <>
          {selectDiscoverSliders(data ?? [], mediaType).map((slider) => (
            <div key={`space-slider-${slider.id}`}>
              <DiscoverSliderRow slider={slider} narrowTo={mediaType} />
            </div>
          ))}
          <SpaceShelves space={space} />
        </>
      )}
      <div className="extra-bottom-space relative" />
    </SpaceLayout>
  );
};

export default SpaceDiscover;
