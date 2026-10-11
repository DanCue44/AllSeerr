import FeaturedHero from '@app/components/AllSeerr/FeaturedHero';
import Discover from '@app/components/Discover';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { NextPage } from 'next';

const Index: NextPage = () => {
  const [interfaceStyle] = useInterfaceStyle();

  return (
    <>
      {interfaceStyle === 'ambient' && <FeaturedHero mediaFilter="all" />}
      <Discover />
    </>
  );
};

export default Index;
