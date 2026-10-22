import AmbientMusicDetails from '@app/components/Allseerr/MusicDetails';
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

// The page waits this long at most for the album before it is sent; after
// that it shows its loading state and fetches the album itself, so a slow
// catalog never leaves a blank screen
const SERVER_PROPS_TIMEOUT = 1500;

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
        timeout: SERVER_PROPS_TIMEOUT,
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
