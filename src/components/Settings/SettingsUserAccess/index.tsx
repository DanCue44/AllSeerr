import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import AppConnections from '@app/components/Settings/SettingsUserAccess/AppConnections';
import Invites from '@app/components/Settings/SettingsUserAccess/Invites';
import LinkExistingAccounts, {
  RenamedAccounts,
} from '@app/components/Settings/SettingsUserAccess/LinkAccount';
import NoBookEndsDirectory from '@app/components/Settings/SettingsUserAccess/NoBookEndsDirectory';
import People from '@app/components/Settings/SettingsUserAccess/People';
import PlexDefaultAccess from '@app/components/Settings/SettingsUserAccess/PlexDefaultAccess';
import ReadingAppChoices from '@app/components/Settings/SettingsUserAccess/ReadingAppChoices';
import SignInWithAllseerr from '@app/components/Settings/SettingsUserAccess/SignInWithAllseerr';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type {
  UserAccessAppInfo,
  UserAccessSettingsResponse,
} from '@server/interfaces/api/userAccessInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.SettingsUserAccess', {
  userAccess: 'User Access',
  userAccessDescription:
    'Give people accounts in Audiobookshelf, Kavita and Komga from one place, with one age limit for every app.',
});

/**
 * Accounts Allseerr manages for people in other apps: the app connections,
 * who may use which app, invite links and signing in with Allseerr
 */
const SettingsUserAccess = () => {
  const intl = useIntl();
  const { data: settings, mutate: revalidateSettings } =
    useSWR<UserAccessSettingsResponse>('/api/v1/settings/user-access');
  const { data: apps, mutate: revalidateApps } = useSWR<UserAccessAppInfo[]>(
    '/api/v1/user-access/apps'
  );

  if (!settings || !apps) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.userAccess),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="mb-8">
        <h3 className="heading">{intl.formatMessage(messages.userAccess)}</h3>
        <p className="description">
          {intl.formatMessage(messages.userAccessDescription)}
        </p>
      </div>
      <AppConnections
        settings={settings}
        onChange={() => {
          revalidateSettings();
          revalidateApps();
        }}
      />
      <PlexDefaultAccess apps={apps} />
      <People apps={apps} />
      <LinkExistingAccounts apps={apps} />
      <RenamedAccounts />
      <ReadingAppChoices />
      <NoBookEndsDirectory />
      <Invites apps={apps} />
      <SignInWithAllseerr />
    </>
  );
};

export default SettingsUserAccess;
