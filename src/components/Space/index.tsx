import {
  listPageMessages,
  pillControl,
} from '@app/components/Allseerr/ListPage';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import SettingsTabs from '@app/components/Common/SettingsTabs';
import useComicsEnabled from '@app/hooks/useComicsEnabled';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { SpaceKey, SpaceSection } from '@app/utils/spaces';
import { COMICS_PATH, SPACES, getSpaceSectionPath } from '@app/utils/spaces';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MessageDescriptor } from 'react-intl';
import { useIntl } from 'react-intl';

export const spaceMessages = defineMessages('components.Space', {
  discover: 'Discover',
  browse: 'Browse',
  library: 'Library',
  upcoming: 'Upcoming',
  genres: 'Genres',
  subjects: 'Subjects',
  lists: 'Lists',
  topratedmovies: 'Top Rated Movies',
  topratedtv: 'Top Rated Series',
  oncalendar: 'On Your Calendar',
  calendarempty: 'Nothing from your servers in the next two months.',
  emptylibrary: 'Nothing here yet. Available titles will show up here.',
  kind: 'Books or comics',
});

export const SPACE_TITLES: Record<SpaceKey, MessageDescriptor> = {
  movies: globalMessages.movies,
  series: globalMessages.tvshows,
  music: globalMessages.music,
  books: globalMessages.books,
};

const SECTION_TITLES: Record<SpaceSection, MessageDescriptor> = {
  discover: spaceMessages.discover,
  browse: spaceMessages.browse,
  library: spaceMessages.library,
  upcoming: spaceMessages.upcoming,
};

/**
 * Books or Comics & Manga, for the books space while Talearr's comics
 * library is on
 */
const BooksKindToggle = ({ comics }: { comics: boolean }) => {
  const intl = useIntl();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const options = [
    {
      key: 'books',
      label: intl.formatMessage(globalMessages.books),
      href: SPACES.books.path,
      active: !comics,
    },
    {
      key: 'comics',
      label: intl.formatMessage(globalMessages.comicsandmanga),
      href: COMICS_PATH,
      active: comics,
    },
  ];

  return (
    <nav
      aria-label={intl.formatMessage(spaceMessages.kind)}
      className={`inline-flex flex-none items-center gap-1 rounded-full p-1 ${
        ambient ? 'bg-as-raised' : 'bg-gray-800 ring-1 ring-gray-700'
      }`}
    >
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          aria-current={option.active ? 'page' : undefined}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            option.active
              ? ambient
                ? 'bg-as-accent text-as-ground'
                : 'bg-indigo-600 text-white'
              : ambient
                ? 'text-as-ink-soft hover:text-as-ink'
                : 'text-gray-300 hover:text-white'
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
};

interface SpaceLayoutProps {
  space: SpaceKey;
  // Comics and manga have one page of their own in the books space
  section: SpaceSection | 'comics';
  /** Artwork banner above the title, on the Discover section */
  hero?: ReactNode;
  children: ReactNode;
}

/**
 * The frame of a media type's space: its title and the Discover, Browse,
 * Library and Upcoming sections, each a page of its own so the filters stay
 * in the address bar and the infinite grids can run to the bottom.
 */
const SpaceLayout = ({ space, section, hero, children }: SpaceLayoutProps) => {
  const intl = useIntl();
  const [interfaceStyle] = useInterfaceStyle();
  const comicsEnabled = useComicsEnabled();
  const spaceTitle = intl.formatMessage(SPACE_TITLES[space]);
  const isComics = section === 'comics';
  const kindToggle =
    space === 'books' && (comicsEnabled || isComics) ? (
      <BooksKindToggle comics={isComics} />
    ) : null;

  // Comics have no sections of their own
  const sections = isComics
    ? []
    : SPACES[space].sections.map((key) => ({
        key,
        label: intl.formatMessage(SECTION_TITLES[key]),
        href: getSpaceSectionPath(space, key),
      }));

  const pageTitle = (
    <PageTitle
      title={
        section === 'discover'
          ? spaceTitle
          : section === 'comics'
            ? intl.formatMessage(globalMessages.comicsandmanga)
            : [intl.formatMessage(SECTION_TITLES[section]), spaceTitle]
      }
    />
  );

  if (interfaceStyle === 'ambient') {
    return (
      <>
        {pageTitle}
        {hero}
        <div
          className={`mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${
            hero ? '' : 'mt-2'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-start lg:gap-5">
            <h1
              className="font-display text-[24px] font-medium leading-tight text-as-ink sm:text-[32px]"
              data-testid="page-header"
            >
              {spaceTitle}
            </h1>
            {kindToggle}
          </div>
          {/* Equal columns on phones so all four fit at 390px, pills above */}
          <nav
            aria-label={intl.formatMessage(listPageMessages.sections)}
            className={`grid gap-1.5 sm:flex sm:gap-2 ${
              sections.length ? '' : 'hidden'
            }`}
            style={{
              gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))`,
            }}
          >
            {sections.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={tab.key === section ? 'page' : undefined}
                className={`${pillControl} min-w-0 px-1 sm:px-4 ${
                  tab.key === section
                    ? '!border-transparent !bg-as-accent !text-as-ground hover:brightness-110'
                    : ''
                }`}
              >
                <span className="truncate">{tab.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </>
    );
  }

  return (
    <>
      {pageTitle}
      <div className="mb-4 mt-1 flex flex-wrap items-center justify-between gap-3">
        <Header>{spaceTitle}</Header>
        {kindToggle}
      </div>
      {sections.length > 0 && (
        <div className="mb-6">
          <SettingsTabs
            settingsRoutes={sections.map((tab) => ({
              text: tab.label,
              route: tab.href,
              regex: new RegExp(`^${tab.href}/?$`),
            }))}
          />
        </div>
      )}
      {children}
    </>
  );
};

export default SpaceLayout;
