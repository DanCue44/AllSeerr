import {
  listPageMessages,
  pillControl,
} from '@app/components/Allseerr/ListPage';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import SettingsTabs from '@app/components/Common/SettingsTabs';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { SpaceKey, SpaceSection } from '@app/utils/spaces';
import { SPACES, getSpaceSectionPath } from '@app/utils/spaces';
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

interface SpaceLayoutProps {
  space: SpaceKey;
  section: SpaceSection;
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
  const spaceTitle = intl.formatMessage(SPACE_TITLES[space]);

  const sections = SPACES[space].sections.map((key) => ({
    key,
    label: intl.formatMessage(SECTION_TITLES[key]),
    href: getSpaceSectionPath(space, key),
  }));

  const pageTitle = (
    <PageTitle
      title={
        section === 'discover'
          ? spaceTitle
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
          <h1
            className="font-display text-[24px] font-medium leading-tight text-as-ink sm:text-[32px]"
            data-testid="page-header"
          >
            {spaceTitle}
          </h1>
          {/* Equal columns on phones so all four fit at 390px, pills above */}
          <nav
            aria-label={intl.formatMessage(listPageMessages.sections)}
            className="grid gap-1.5 sm:flex sm:gap-2"
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
      <div className="mb-4 mt-1">
        <Header>{spaceTitle}</Header>
      </div>
      <div className="mb-6">
        <SettingsTabs
          settingsRoutes={sections.map((tab) => ({
            text: tab.label,
            route: tab.href,
            regex: new RegExp(`^${tab.href}/?$`),
          }))}
        />
      </div>
      {children}
    </>
  );
};

export default SpaceLayout;
