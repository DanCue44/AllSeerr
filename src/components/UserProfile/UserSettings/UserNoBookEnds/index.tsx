import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import CopyButton from '@app/components/Settings/CopyButton';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  LinkIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserNoBookEnds',
  {
    nobookends: 'NoBookEnds',
    description:
      'NoBookEnds is an app for listening to audiobooks and reading ebooks from Audiobookshelf. Connect it to find, request, and report books from the app.',
    unavailable:
      'NoBookEnds can be connected once an admin sets up books and Audiobookshelf.',
    connected: 'Connected {date}',
    notConnected: 'NoBookEnds is not connected.',
    notConnectedOther: 'This user has not connected NoBookEnds.',
    connect: 'Connect NoBookEnds',
    newLink: 'New Connect Link',
    disconnect: 'Disconnect',
    scan: 'Scan with the camera on your phone, or open the link on the phone that has NoBookEnds.',
    openLink: 'Open in NoBookEnds',
    linkCopied: 'Copied connect link to clipboard.',
    shownOnce:
      'This link signs NoBookEnds in as you. It is only shown once, and a new link signs out the app the old one was used in.',
    qrAlt: 'QR code that connects NoBookEnds',
    connectError: 'Something went wrong while creating the connect link.',
    applicationUrlMissing:
      'NoBookEnds needs an address that works away from home. Set the Application URL in the General settings first.',
    applicationUrlMissingUser:
      'NoBookEnds needs an address that works away from home. Ask an admin to set the Application URL in the General settings.',
    openGeneralSettings: 'Open General Settings',
    disconnectSuccess: 'NoBookEnds disconnected.',
    disconnectError: 'Something went wrong while disconnecting NoBookEnds.',
  }
);

interface NoBookEndsConnection {
  available: boolean;
  connected: boolean;
  createdAt?: string | null;
  applicationUrlMissing: boolean;
}

const UserNoBookEnds = () => {
  const intl = useIntl();
  const router = useRouter();
  const { addToast } = useToasts();
  const { user: currentUser, hasPermission } = useUser();
  const { user } = useUser({ id: Number(router.query.userId) });
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { data, mutate } = useSWR<NoBookEndsConnection>(
    user ? `/api/v1/user/${user.id}/settings/nobookends` : null
  );

  const isOwnProfile = currentUser?.id === user?.id;

  // Drawn here, so the link with its key never leaves the browser again
  useEffect(() => {
    let active = true;

    if (!connectUrl) {
      setQrCode(null);
      return;
    }

    QRCode.toDataURL(connectUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
    })
      .then((url) => active && setQrCode(url))
      .catch(() => active && setQrCode(null));

    return () => {
      active = false;
    };
  }, [connectUrl]);

  const connect = async () => {
    setIsUpdating(true);
    try {
      const response = await axios.post<{ connectUrl: string }>(
        `/api/v1/user/${user?.id}/settings/nobookends`
      );
      setConnectUrl(response.data.connectUrl);
      mutate();
    } catch {
      addToast(intl.formatMessage(messages.connectError), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const disconnect = async () => {
    setIsUpdating(true);
    try {
      await axios.delete(`/api/v1/user/${user?.id}/settings/nobookends`);
      setConnectUrl(null);
      mutate();
      addToast(intl.formatMessage(messages.disconnectSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.disconnectError), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!data || !user) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.nobookends),
          intl.formatMessage(globalMessages.usersettings),
          user.displayName,
        ]}
      />
      <div className="mb-6 flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nobookends-icon.png"
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div>
          <h3 className="heading">{intl.formatMessage(messages.nobookends)}</h3>
          <p className="mt-1 text-sm text-gray-400">
            {intl.formatMessage(messages.description)}
          </p>
        </div>
      </div>
      <div className="section">
        {!data.available && !data.connected ? (
          <Alert title={intl.formatMessage(messages.unavailable)} type="info" />
        ) : (
          <>
            {connectUrl ? (
              <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="mx-auto w-full max-w-[240px] shrink-0 overflow-hidden rounded-xl bg-white p-2 sm:mx-0">
                  {qrCode ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrCode}
                      alt={intl.formatMessage(messages.qrAlt)}
                      className="aspect-square w-full"
                      data-testid="nobookends-qr"
                    />
                  ) : (
                    <div className="aspect-square w-full" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  <p className="text-sm text-gray-300">
                    {intl.formatMessage(messages.scan)}
                  </p>
                  <div className="form-input-field">
                    <input
                      type="text"
                      id="nobookendsConnectUrl"
                      className="rounded-l-only font-mono text-xs"
                      value={connectUrl}
                      readOnly
                    />
                    <CopyButton
                      textToCopy={connectUrl}
                      toastMessage={intl.formatMessage(messages.linkCopied)}
                      key={connectUrl}
                    />
                  </div>
                  <div>
                    <Button
                      as="a"
                      href={connectUrl}
                      target="_blank"
                      rel="noreferrer"
                      buttonType="primary"
                    >
                      <ArrowTopRightOnSquareIcon />
                      <span>{intl.formatMessage(messages.openLink)}</span>
                    </Button>
                  </div>
                  <Alert
                    title={intl.formatMessage(messages.shownOnce)}
                    type="warning"
                  />
                </div>
              </div>
            ) : (
              <p className="mb-6 text-sm text-gray-300">
                {data.connected && data.createdAt
                  ? intl.formatMessage(messages.connected, {
                      date: intl.formatDate(data.createdAt, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }),
                    })
                  : isOwnProfile
                    ? intl.formatMessage(messages.notConnected)
                    : intl.formatMessage(messages.notConnectedOther)}
              </p>
            )}
            {data.applicationUrlMissing && !connectUrl && (
              <Alert
                title={intl.formatMessage(
                  hasPermission(Permission.ADMIN)
                    ? messages.applicationUrlMissing
                    : messages.applicationUrlMissingUser
                )}
                type="warning"
              >
                {hasPermission(Permission.ADMIN) && (
                  <Link
                    href="/settings/main"
                    className="font-semibold underline hover:no-underline"
                  >
                    {intl.formatMessage(messages.openGeneralSettings)}
                  </Link>
                )}
              </Alert>
            )}
            <div className="flex flex-wrap gap-3">
              {isOwnProfile &&
                data.available &&
                !data.applicationUrlMissing && (
                  <Button
                    buttonType={connectUrl ? 'default' : 'primary'}
                    onClick={() => connect()}
                    disabled={isUpdating}
                  >
                    {data.connected ? <ArrowPathIcon /> : <LinkIcon />}
                    <span>
                      {intl.formatMessage(
                        data.connected ? messages.newLink : messages.connect
                      )}
                    </span>
                  </Button>
                )}
              {data.connected && (
                <Button
                  buttonType="danger"
                  onClick={() => disconnect()}
                  disabled={isUpdating}
                >
                  <TrashIcon />
                  <span>{intl.formatMessage(messages.disconnect)}</span>
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default UserNoBookEnds;
