import { RailHeader } from '@app/components/Allseerr/Title';
import Header from '@app/components/Common/Header';
import Slider from '@app/components/Slider';
import MusicTitleCard from '@app/components/TitleCard/MusicTitleCard';
import defineMessages from '@app/utils/defineMessages';
import type { ArtistResult } from '@server/models/Search';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.ArtistDetails.SimilarArtists', {
  similarartists: 'Similar Artists',
});

interface SimilarArtistsProps {
  artistId: string;
  ambient?: boolean;
}

/**
 * A row of artists similar to an artist. Hidden until they are loaded, and
 * when there are none.
 */
const SimilarArtists = ({ artistId, ambient = false }: SimilarArtistsProps) => {
  const intl = useIntl();
  const { data } = useSWR<{ results: ArtistResult[] }>(
    `/api/v1/artist/${artistId}/similar`
  );

  if (!data?.results.length) {
    return null;
  }

  const title = intl.formatMessage(messages.similarartists);

  return (
    <section className={ambient ? 'flex flex-col gap-4' : 'my-6'}>
      {ambient ? (
        <RailHeader title={title} seeAllLabel="" />
      ) : (
        <div className="slider-header">
          <Header>{title}</Header>
        </div>
      )}
      <Slider
        sliderKey={`similar-artists-${artistId}`}
        isLoading={false}
        items={data.results.map((artist) => (
          <MusicTitleCard
            key={`similar-artist-${artist.id}`}
            id={artist.id}
            mediaType="artist"
            title={artist.name}
            subtitle={artist.disambiguation}
            image={artist.artistThumb}
          />
        ))}
      />
    </section>
  );
};

export default SimilarArtists;
