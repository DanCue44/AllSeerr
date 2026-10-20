import AmbientSearch from '@app/components/Allseerr/Search';
import Search from '@app/components/Search';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';

const SearchPage = () => {
  const [interfaceStyle] = useInterfaceStyle();

  return interfaceStyle === 'ambient' ? <AmbientSearch /> : <Search />;
};

export default SearchPage;
