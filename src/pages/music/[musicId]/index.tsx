import AmbientMusicDetails from '@app/components/AllSeerr/MusicDetails';
import MusicDetails from '@app/components/MusicDetails';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { getHostAndPort } from '@app/utils/urlHelper';
import type { MusicDetails as MusicDetailsType } from '@server/models/Music';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface MusicPageProps {
  album?: MusicDetailsType;
}

const MusicPage: NextPage<MusicPageProps> = ({ album }) => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientMusicDetails album={album} />
  ) : (
    <MusicDetails album={album} />
  );
};

export const getServerSideProps: GetServerSideProps<MusicPageProps> = async (
  ctx
) => {
  try {
    const response = await axios.get<MusicDetailsType>(
      `http://${getHostAndPort()}/api/v1/music/${ctx.query.musicId}`,
      {
        headers: ctx.req?.headers?.cookie
          ? { cookie: ctx.req.headers.cookie }
          : undefined,
      }
    );

    return {
      props: {
        album: response.data,
      },
    };
  } catch {
    // The page fetches the album again and shows the error itself
    return { props: {} };
  }
};

export default MusicPage;
