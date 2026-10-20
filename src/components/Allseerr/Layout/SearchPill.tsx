import useSearchInput from '@app/hooks/useSearchInput';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Allseerr.Layout.SearchPill', {
  search: 'Search',
  searchPlaceholder: 'Movies, series, music, books',
});

const SearchPill = ({ focusOnMount = false }: { focusOnMount?: boolean }) => {
  const intl = useIntl();
  const { searchValue, setSearchValue, setIsOpen, clear } = useSearchInput();
  const inputRef = useRef<HTMLInputElement>(null);

  // The phone header opens search on demand, so put the cursor in it
  useEffect(() => {
    if (focusOnMount) {
      inputRef.current?.focus();
    }
  }, [focusOnMount]);

  return (
    <div className="relative flex w-full items-center text-as-ink-muted focus-within:text-as-ink">
      <label htmlFor="search_field" className="sr-only">
        {intl.formatMessage(messages.search)}
      </label>
      <div className="pointer-events-none absolute inset-y-0 left-4 z-10 flex items-center lg:left-5">
        <MagnifyingGlassIcon className="h-[18px] w-[18px]" />
      </div>
      <input
        id="search_field"
        style={{ paddingRight: searchValue.length > 0 ? '2rem' : '' }}
        ref={inputRef}
        className="block h-11 w-full rounded-full border-0 bg-as-ground/80 pl-11 font-body text-[15px] text-as-ink placeholder-as-ink-faint focus:outline-none focus:ring-1 focus:ring-as-line-strong lg:h-[52px] lg:pl-12 lg:backdrop-blur-xl"
        placeholder={intl.formatMessage(messages.searchPlaceholder)}
        type="search"
        autoComplete="off"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          if (searchValue === '') {
            setIsOpen(false);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {searchValue.length > 0 && (
        <button
          className="absolute inset-y-0 right-2 m-auto h-7 w-7 p-1 text-as-ink-faint transition hover:text-as-ink focus:outline-none"
          onClick={() => clear()}
          aria-label="Clear"
        >
          <XCircleIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default SearchPill;
