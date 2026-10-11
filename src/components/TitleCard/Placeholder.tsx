import useInterfaceStyle from '@app/hooks/useInterfaceStyle';

interface PlaceholderProps {
  canExpand?: boolean;
}

const Placeholder = ({ canExpand = false }: PlaceholderProps) => {
  const [interfaceStyle] = useInterfaceStyle();

  if (interfaceStyle === 'ambient') {
    // Artwork plus the two caption lines the Ambient cards show
    return (
      <div
        className={`animate-pulse ${
          canExpand ? 'w-full' : 'w-[150px] sm:w-[176px]'
        }`}
      >
        <div
          className="w-full rounded-[18px] bg-as-tile"
          style={{ paddingBottom: '150%' }}
        />
        <div className="mt-2.5 h-4 w-4/5 rounded-full bg-as-tile" />
        <div className="mt-1.5 h-3 w-1/2 rounded-full bg-as-tile" />
      </div>
    );
  }

  return (
    <div
      className={`relative animate-pulse rounded-xl bg-gray-700 ${
        canExpand ? 'w-full' : 'w-36 sm:w-36 md:w-44'
      }`}
    >
      <div className="w-full" style={{ paddingBottom: '150%' }} />
    </div>
  );
};

export default Placeholder;
