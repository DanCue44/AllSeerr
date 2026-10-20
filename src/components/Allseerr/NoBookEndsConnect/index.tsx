import {
  AuthBackdrop,
  authCard,
  authHeading,
  authPage,
  authPrimary,
} from '@app/components/Allseerr/Auth';
import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { getLoginPath } from '@app/utils/loginRedirect';
import {
  ArrowTopRightOnSquareIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';
import { sanitizeNoBookEndsDeviceLabel } from '@server/utils/nobookendsDeviceLabel';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

// The app's own scheme, which closes the sign in window the app opened
const APP_CONNECT_URL = 'nobookends://connect';

const messages = defineMessages('components.Allseerr.NoBookEndsConnect', {
  title: 'Connect NoBookEnds',
  connectAs: 'Connect NoBookEnds as {name}?',
  allows:
    'NoBookEnds will be able to find, request, and report books from the app, with the same permissions you have on {applicationTitle}.',
  device: 'Device: {device}',
  connect: 'Connect',
  connecting: 'Connecting…',
  cancel: 'Cancel',
  switchUser: 'Not {name}? Sign in as someone else',
  connected: 'NoBookEnds is connected. You can return to NoBookEnds.',
  cancelled: 'NoBookEnds was not connected. You can return to NoBookEnds.',
  notOpened: 'If NoBookEnds did not open, tap the button below.',
  openApp: 'Open NoBookEnds',
  backToApp: 'Back to NoBookEnds',
  unavailable:
    'NoBookEnds can be connected once an admin sets up books and Audiobookshelf.',
  applicationUrlMissing:
    'NoBookEnds needs an address that works away from home. Set the Application URL in the General settings first.',
  applicationUrlMissingUser:
    'NoBookEnds needs an address that works away from home. Ask an admin to set the Application URL in the General settings.',
  connectError: 'Something went wrong while connecting NoBookEnds.',
});

interface NoBookEndsConnection {
  available: boolean;
  applicationUrlMissing: boolean;
}

type Outcome =
  | { state: 'connected'; appUrl: string }
  | { state: 'cancelled'; appUrl: string };

/**
 * The page the NoBookEnds app opens in a sign in window to connect. Sign in
 * comes first when needed. A key is only made once the user taps Connect,
 * and goes back to the app in the fragment of its own URL.
 */
const NoBookEndsConnect = () => {
  const intl = useIntl();
  const router = useRouter();
  const { currentSettings } = useSettings();
  const { user, hasPermission } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { data, error: loadError } = useSWR<NoBookEndsConnection>(
    user ? `/api/v1/user/${user.id}/settings/nobookends` : null,
    { revalidateOnFocus: false }
  );

  const device = sanitizeNoBookEndsDeviceLabel(router.query.device);

  const openApp = (url: string) => {
    window.location.replace(url);
  };

  const connect = async () => {
    if (!user) {
      return;
    }

    setIsConnecting(true);
    setError(false);

    try {
      const response = await axios.post<{ appUrl: string }>(
        `/api/v1/user/${user.id}/settings/nobookends`,
        device ? { device } : {}
      );

      setOutcome({ state: 'connected', appUrl: response.data.appUrl });
      openApp(response.data.appUrl);
    } catch {
      setError(true);
    } finally {
      setIsConnecting(false);
    }
  };

  const cancel = () => {
    const appUrl = `${APP_CONNECT_URL}#error=cancelled`;

    setOutcome({ state: 'cancelled', appUrl });
    openApp(appUrl);
  };

  const switchUser = async () => {
    try {
      await axios.post('/api/v1/auth/logout');
    } finally {
      window.location.href = getLoginPath(router.asPath);
    }
  };

  const renderBody = () => {
    if (!user || (!data && !loadError)) {
      return <LoadingSpinner />;
    }

    if (outcome) {
      return (
        <div className="flex flex-col gap-5 text-center">
          <p className="text-[15px] text-as-ink">
            {intl.formatMessage(
              outcome.state === 'connected'
                ? messages.connected
                : messages.cancelled
            )}
          </p>
          <p className="text-sm text-as-ink-muted">
            {intl.formatMessage(messages.notOpened)}
          </p>
          <Button
            buttonType={outcome.state === 'connected' ? 'primary' : 'ghost'}
            className={`w-full ${authPrimary}`}
            onClick={() => openApp(outcome.appUrl)}
          >
            <ArrowTopRightOnSquareIcon />
            <span>{intl.formatMessage(messages.openApp)}</span>
          </Button>
        </div>
      );
    }

    const blocker = !data
      ? { message: messages.connectError, error: 'unavailable' }
      : !data.available
        ? {
            message: messages.unavailable,
            error: 'unavailable',
          }
        : data.applicationUrlMissing
          ? {
              message: hasPermission(Permission.ADMIN)
                ? messages.applicationUrlMissing
                : messages.applicationUrlMissingUser,
              error: 'no_app_url',
            }
          : null;

    if (blocker) {
      return (
        <div className="flex flex-col gap-5">
          <Alert title={intl.formatMessage(blocker.message)} type="warning" />
          <Button
            buttonType="ghost"
            className={`w-full ${authPrimary}`}
            onClick={() => openApp(`${APP_CONNECT_URL}#error=${blocker.error}`)}
          >
            {intl.formatMessage(messages.backToApp)}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className={`${authHeading} text-[22px] leading-8`}>
            {intl.formatMessage(messages.connectAs, {
              name: user.displayName,
            })}
          </h1>
          <p className="mt-3 text-sm leading-6 text-as-ink-muted">
            {intl.formatMessage(messages.allows, {
              applicationTitle: currentSettings.applicationTitle,
            })}
          </p>
          {device && (
            <p className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-as-raised px-4 py-1.5 text-sm text-as-ink-soft ring-1 ring-as-line">
              <DevicePhoneMobileIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {intl.formatMessage(messages.device, { device })}
              </span>
            </p>
          )}
        </div>
        {error && (
          <Alert
            title={intl.formatMessage(messages.connectError)}
            type="error"
          />
        )}
        <div className="flex flex-col gap-3">
          <Button
            buttonType="primary"
            className={`w-full ${authPrimary}`}
            onClick={() => connect()}
            disabled={isConnecting}
            data-testid="nobookends-connect"
          >
            {intl.formatMessage(
              isConnecting ? messages.connecting : messages.connect
            )}
          </Button>
          <Button
            buttonType="ghost"
            className={`w-full ${authPrimary}`}
            onClick={() => cancel()}
            disabled={isConnecting}
          >
            {intl.formatMessage(messages.cancel)}
          </Button>
        </div>
        <button
          type="button"
          className="text-center text-sm text-as-ink-faint underline-offset-4 hover:text-as-ink-muted hover:underline"
          onClick={() => switchUser()}
          disabled={isConnecting}
        >
          {intl.formatMessage(messages.switchUser, {
            name: user.displayName,
          })}
        </button>
      </div>
    );
  };

  return (
    <div className={authPage}>
      <PageTitle title={intl.formatMessage(messages.title)} />
      <AuthBackdrop />
      <div className="relative z-40 mt-6 flex flex-col items-center px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nobookends-icon.png"
          alt=""
          className="h-20 w-20 rounded-[22px] shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
        />
      </div>
      <div className="relative z-50 mt-8 px-4 sm:mx-auto sm:w-full sm:max-w-md">
        <div className={`${authCard} px-6 py-8 sm:px-10`}>{renderBody()}</div>
      </div>
    </div>
  );
};

export default NoBookEndsConnect;
