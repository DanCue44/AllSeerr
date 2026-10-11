import useInterfaceStyle from '@app/hooks/useInterfaceStyle';

interface HeaderProps {
  extraMargin?: number;
  subtext?: React.ReactNode;
  children: React.ReactNode;
}

const Header = ({ children, extraMargin = 0, subtext }: HeaderProps) => {
  const [interfaceStyle] = useInterfaceStyle();

  if (interfaceStyle === 'ambient') {
    return (
      <div className="mt-2 md:flex md:items-center md:justify-between">
        <div className={`min-w-0 flex-1 mx-${extraMargin}`}>
          <h2
            className="mb-4 break-words font-display text-[24px] font-medium leading-tight text-as-ink sm:text-[32px] md:mb-0"
            data-testid="page-header"
          >
            {children}
          </h2>
          {subtext && (
            <div className="mt-1.5 text-[15px] text-as-ink-faint">
              {subtext}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 md:flex md:items-center md:justify-between">
      <div className={`min-w-0 flex-1 mx-${extraMargin}`}>
        <h2
          className="mb-4 truncate text-2xl font-bold leading-7 text-gray-100 sm:overflow-visible sm:text-4xl sm:leading-9 md:mb-0"
          data-testid="page-header"
        >
          <span className="text-overseerr">{children}</span>
        </h2>
        {subtext && <div className="mt-2 text-gray-400">{subtext}</div>}
      </div>
    </div>
  );
};

export default Header;
