import {
  AmbientPageHeader,
  listPageMessages,
  PillTabs,
} from '@app/components/AllSeerr/ListPage';
import Header from '@app/components/Common/Header';
import type { SettingsRoute } from '@app/components/Common/SettingsTabs';
import SettingsTabs from '@app/components/Common/SettingsTabs';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import defineMessages from '@app/utils/defineMessages';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

export const messages = defineMessages('components.Library', {
  library: 'Library',
  movies: 'Movies',
  series: 'Series',
  collections: 'Collections',
});

interface LibraryLayoutProps {
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const LibraryLayout = ({ actions, children }: LibraryLayoutProps) => {
  const intl = useIntl();
  const router = useRouter();
  const [interfaceStyle] = useInterfaceStyle();

  const libraryRoutes: SettingsRoute[] = [
    {
      text: intl.formatMessage(messages.movies),
      route: '/library/movies',
      regex: /^\/library(\/movies)?$/,
    },
    {
      text: intl.formatMessage(messages.series),
      route: '/library/tv',
      regex: /^\/library\/tv$/,
    },
    {
      text: intl.formatMessage(messages.collections),
      route: '/library/collections',
      regex: /^\/library\/collections$/,
    },
  ];

  if (interfaceStyle === 'ambient') {
    return (
      <>
        <AmbientPageHeader
          title={intl.formatMessage(messages.library)}
          controls={actions}
        />
        <div className="-mt-2 mb-7">
          <PillTabs
            label={intl.formatMessage(listPageMessages.sections)}
            tabs={libraryRoutes.map((route) => ({
              key: route.route,
              label: route.text,
              href: route.route,
              active: !!router.pathname.match(route.regex),
            }))}
          />
        </div>
        {children}
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{intl.formatMessage(messages.library)}</Header>
        {actions && (
          <div className="mt-2 flex flex-grow flex-col sm:flex-row lg:flex-grow-0">
            {actions}
          </div>
        )}
      </div>
      <div className="mb-6">
        <SettingsTabs settingsRoutes={libraryRoutes} />
      </div>
      {children}
    </>
  );
};

export default LibraryLayout;
