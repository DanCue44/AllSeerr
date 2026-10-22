import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import CopyButton from '@app/components/Settings/CopyButton';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowTopRightOnSquareIcon,
  DevicePhoneMobileIcon,
  LinkIcon,
  PlusIcon,
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
    devices: 'Connected Devices',
    unnamedDevice: 'NoBookEnds',
    deviceConnected: 'Connected {date}',
    deviceLastUsed: 'Last used {date}',
    deviceNotUsed: 'Not used yet',
    removeDevice: 'Remove',
    removeDeviceSuccess: 'Removed NoBookEnds from the device.',
    removeDeviceError: 'Something went wrong while removing the device.',
    connectAnother: 'Connect Another Device',
    easyConnect:
      'You can also connect from the app: enter the address of this site in NoBookEnds and sign in.',
    notConnected: 'NoBookEnds is not connected.',
    notConnectedOther: 'This user has not connected NoBookEnds.',
    connect: 'Connect NoBookEnds',
    disconnect: 'Disconnect All',
    scan: 'Scan with the camera on your phone, or open the link on the phone that has NoBookEnds.',
    openLink: 'Open in NoBookEnds',
    linkCopied: 'Copied connect link to clipboard.',
    shownOnce:
      'This link signs NoBookEnds in as you on one device. It is only shown once. Devices connected before stay connected.',
    qrAlt: 'QR code that connects NoBookEnds',
    connectError: 'Something went wrong while creating the connect link.',
    applicationUrlMissing:
      'NoBookEnds needs an address that works away from home. Set the Application URL in the General settings first.',
    applicationUrlMissingUser:
      'NoBookEnds needs an address that works away from home. Ask an admin to set the Application URL in the General settings.',
    openGeneralSettings: 'Open General Settings',
    disconnectSuccess: 'NoBookEnds disconnected.',
    disconnectError: 'Something went wrong while disconnecting NoBookEnds.',
    openNoBookEnds: 'Open NoBookEnds',
  }
);

interface NoBookEndsDevice {
  id: number;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface NoBookEndsConnection {
  available: boolean;
  connected: boolean;
  createdAt?: string | null;
  devices: NoBookEndsDevice[];
  applicationUrlMissing: boolean;
}

// Opens NoBookEnds at its sign in with this server's address filled in, or
// the NoBookEnds site when the app is not installed
const getSignInUrl = (applicationUrl: string): string =>
  `https://nobookends.com/open/signin?allseerr=${encodeURIComponent(
    applicationUrl.trim().replace(/\/+$/, '')
  )}`;

const dateFormat = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
} as const;

const UserNoBookEnds = () => {
  const intl = useIntl();
  const router = useRouter();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const { user: currentUser, hasPermission } = useUser();
  const { user } = useUser({ id: Number(router.query.userId) });
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { data, mutate } = useSWR<NoBookEndsConnection>(
    user ? `/api/v1/user/${user.id}/settings/nobookends` : null
  );

  const isOwnProfile = currentUser?.id === user?.id;
  const signInUrl = currentSettings.applicationUrl?.trim()
    ? getSignInUrl(currentSettings.applicationUrl)
    : null;

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

  const removeDevice = async (deviceId: number) => {
    setIsUpdating(true);
    try {
      await axios.delete(
        `/api/v1/user/${user?.id}/settings/nobookends/devices/${deviceId}`
      );
      mutate();
      addToast(intl.formatMessage(messages.removeDeviceSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.removeDeviceError), {
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
              <>
                {data.devices.length === 0 && (
                  <p className="mb-6 text-sm text-gray-300">
                    {data.connected && data.createdAt
                      ? intl.formatMessage(messages.connected, {
                          date: intl.formatDate(data.createdAt, dateFormat),
                        })
                      : isOwnProfile
                        ? intl.formatMessage(messages.notConnected)
                        : intl.formatMessage(messages.notConnectedOther)}
                  </p>
                )}
                {isOwnProfile &&
                  data.available &&
                  !data.applicationUrlMissing && (
                    <p className="mb-6 text-sm text-gray-400">
                      {intl.formatMessage(messages.easyConnect)}
                    </p>
                  )}
              </>
            )}
            {data.devices.length > 0 && (
              <div className="mb-6">
                <h4 className="mb-2 text-sm font-semibold text-gray-200">
                  {intl.formatMessage(messages.devices)}
                </h4>
                <ul
                  className="divide-y divide-gray-700 overflow-hidden rounded-xl ring-1 ring-gray-700"
                  data-testid="nobookends-devices"
                >
                  {data.devices.map((device) => (
                    <li
                      key={device.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <DevicePhoneMobileIcon className="h-6 w-6 shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-100">
                          {device.label ??
                            intl.formatMessage(messages.unnamedDevice)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {intl.formatMessage(messages.deviceConnected, {
                            date: intl.formatDate(device.createdAt, dateFormat),
                          })}
                          {' · '}
                          {device.lastUsedAt
                            ? intl.formatMessage(messages.deviceLastUsed, {
                                date: intl.formatDate(
                                  device.lastUsedAt,
                                  dateFormat
                                ),
                              })
                            : intl.formatMessage(messages.deviceNotUsed)}
                        </div>
                      </div>
                      <Button
                        buttonType="danger"
                        buttonSize="sm"
                        onClick={() => removeDevice(device.id)}
                        disabled={isUpdating}
                      >
                        <TrashIcon />
                        <span>{intl.formatMessage(messages.removeDevice)}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
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
              {signInUrl && (
                <Button
                  as="a"
                  href={signInUrl}
                  target="_blank"
                  rel="noreferrer"
                  buttonType="default"
                >
                  <ArrowTopRightOnSquareIcon />
                  <span>{intl.formatMessage(messages.openNoBookEnds)}</span>
                </Button>
              )}
              {isOwnProfile &&
                data.available &&
                !data.applicationUrlMissing && (
                  <Button
                    buttonType={connectUrl ? 'default' : 'primary'}
                    onClick={() => connect()}
                    disabled={isUpdating}
                  >
                    {data.connected ? <PlusIcon /> : <LinkIcon />}
                    <span>
                      {intl.formatMessage(
                        data.connected
                          ? messages.connectAnother
                          : messages.connect
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
