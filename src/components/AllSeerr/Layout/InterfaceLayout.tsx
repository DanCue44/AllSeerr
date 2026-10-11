import AmbientLayout from '@app/components/AllSeerr/Layout';
import Layout from '@app/components/Layout';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';

type InterfaceLayoutProps = {
  children: React.ReactNode;
};

/**
 * Wraps pages in the classic Seerr layout or the new Ambient one, based on
 * the interface this browser has chosen.
 */
const InterfaceLayout = ({ children }: InterfaceLayoutProps) => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? (
    <AmbientLayout>{children}</AmbientLayout>
  ) : (
    <Layout>{children}</Layout>
  );
};

export default InterfaceLayout;
