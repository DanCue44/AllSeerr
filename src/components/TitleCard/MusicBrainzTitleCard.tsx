import TitleCard from '@app/components/TitleCard';
import MusicTitleCard from '@app/components/TitleCard/MusicTitleCard';
import type { MusicDetails } from '@server/models/Music';
import { useInView } from 'react-intersection-observer';
import useSWR from 'swr';

interface MusicBrainzTitleCardProps {
  mbId: string;
  canExpand?: boolean;
}

/**
 * Album card for lists that only know the MusicBrainz id, the music
 * counterpart of TmdbTitleCard
 */
const MusicBrainzTitleCard = ({
  mbId,
  canExpand,
}: MusicBrainzTitleCardProps) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const { data: album, error } = useSWR<MusicDetails>(
    inView ? `/api/v1/music/${mbId}` : null
  );

  if (!album && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!album) {
    return null;
  }

  return (
    <MusicTitleCard
      id={album.id}
      mediaType="album"
      title={album.title}
      subtitle={album.artistCredit}
      year={album.releaseDate}
      image={album.posterPath}
      albumType={album.type}
      status={album.mediaInfo?.status}
      inProgress={(album.mediaInfo?.downloadStatus ?? []).length > 0}
      canExpand={canExpand}
    />
  );
};

export default MusicBrainzTitleCard;
