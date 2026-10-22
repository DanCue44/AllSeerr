import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import HeadphonesIcon from '@app/components/Common/HeadphonesIcon';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import {
  NewPasswordBox,
  purposeMessage,
} from '@app/components/ReadingApps/common';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BookOpenIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import type { UserAccessApp } from '@server/constants/userAccess';
import type {
  NewAppPassword,
  ReadingAppSetupResult,
  ReadingAppStatus,
  ReadingAppsResponse,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserReadingApps',
  {
    readingApps: 'Reading apps',
    description:
      'The apps you read and listen in. Set up your account here instead of signing up in each app.',
    noApps: 'No reading apps are set up yet.',
    ready: 'Ready',
    requested: 'Requested',
    signedInAs: 'Your username is {username}.',
    open: 'Open {app}',
    signInWithAllseerr:
      'On the {app} sign in page, use the "Sign in with Allseerr" button.',
    ownAccount:
      'This is the {app} account you already had. Sign in with the password you already use.',
    newPassword: 'Show a new password',
    confirmNewPassword: 'Replace my password',
    newPasswordHint: 'This replaces your current {app} password.',
    available: 'You have access to {app}. Set up your account in one tap.',
    setUp: 'Set up',
    notGranted: 'You do not have access to {app} yet.',
    askForAccess: 'Ask for access',
    requestedDescription:
      'You asked for access. An admin will look at it, and you can set it up here once they say yes.',
    error: 'Your {app} account could not be set up.',
    tryAgain: 'Try again',
    setupError: 'Something went wrong while setting up {app}.',
    passwordError: 'Something went wrong while making a new password.',
    requestError: 'Something went wrong while asking for access.',
    requestSuccess: 'Asked an admin for access to {app}.',
  }
);

const AppIcon = ({ app }: { app: UserAccessApp }) =>
  app === 'audiobookshelf' ? (
    <HeadphonesIcon className="h-6 w-6" />
  ) : (
    <BookOpenIcon className="h-6 w-6" />
  );

const UserReadingApps = () => {
  const intl = useIntl();
  const router = useRouter();
  const { addToast } = useToasts();
  const { user } = useUser({ id: Number(router.query.userId) });
  const [busy, setBusy] = useState<UserAccessApp | null>(null);
  const [passwords, setPasswords] = useState<
    Partial<Record<UserAccessApp, NewAppPassword>>
  >({});
  const url = user ? `/api/v1/user/${user.id}/settings/apps` : null;
  const { data, error, mutate } = useSWR<ReadingAppsResponse>(url);
  const highlighted =
    typeof router.query.app === 'string' ? router.query.app : null;

  const replaceApp = (status: ReadingAppStatus) =>
    mutate(
      (current) =>
        current && {
          ...current,
          apps: current.apps.map((app) =>
            app.app === status.app ? status : app
          ),
        },
      { revalidate: false }
    );

  const run = async (
    status: ReadingAppStatus,
    action: 'setup' | 'password' | 'request-access'
  ) => {
    const app = status.name;
    setBusy(status.app);

    try {
      if (action === 'setup') {
        const response = await axios.post<ReadingAppSetupResult>(
          `${url}/${status.app}/setup`
        );
        replaceApp(response.data.app);
        const password = response.data.password;
        if (password) {
          setPasswords((current) => ({ ...current, [status.app]: password }));
        }
      } else if (action === 'password') {
        const response = await axios.post<NewAppPassword>(
          `${url}/${status.app}/password`
        );
        setPasswords((current) => ({
          ...current,
          [status.app]: response.data,
        }));
      } else {
        const response = await axios.post<{ app: ReadingAppStatus }>(
          `${url}/${status.app}/request-access`
        );
        replaceApp(response.data.app);
        addToast(intl.formatMessage(messages.requestSuccess, { app }), {
          appearance: 'success',
          autoDismiss: true,
        });
      }
    } catch {
      addToast(
        intl.formatMessage(
          action === 'setup'
            ? messages.setupError
            : action === 'password'
              ? messages.passwordError
              : messages.requestError,
          { app }
        ),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setBusy(null);
    }
  };

  if (!user || (!data && !error)) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.readingApps),
          intl.formatMessage(globalMessages.usersettings),
          user.displayName,
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.readingApps)}</h3>
        <p className="description">
          {intl.formatMessage(messages.description)}
        </p>
      </div>
      {!data?.apps.length ? (
        <Alert title={intl.formatMessage(messages.noApps)} type="info" />
      ) : (
        <ul className="space-y-4" data-testid="reading-apps">
          {data.apps.map((status) => {
            const app = status.name;
            const isBusy = busy === status.app;
            const password = passwords[status.app];

            return (
              <li
                key={status.app}
                id={`reading-app-${status.app}`}
                className={`rounded-xl p-4 ring-1 sm:p-5 ${
                  highlighted === status.app
                    ? 'ring-2 ring-as-accent'
                    : 'ring-as-line'
                }`}
                data-testid={`reading-app-${status.app}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-as-tile text-as-ink-muted">
                    <AppIcon app={status.app} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{app}</span>
                      {status.state === 'ready' && (
                        <Badge badgeType="success">
                          {intl.formatMessage(messages.ready)}
                        </Badge>
                      )}
                      {status.state === 'requested' && (
                        <Badge badgeType="warning">
                          {intl.formatMessage(messages.requested)}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-as-ink-muted">
                      {intl.formatMessage(purposeMessage(status))}
                    </div>

                    <div className="mt-3 text-sm">
                      {status.state === 'ready' && (
                        <>
                          {status.username && (
                            <p>
                              {intl.formatMessage(messages.signedInAs, {
                                username: (
                                  <code key="username">{status.username}</code>
                                ),
                              })}
                            </p>
                          )}
                          {status.ownAccount && (
                            <p className="mt-1 text-as-ink-muted">
                              {intl.formatMessage(messages.ownAccount, { app })}
                            </p>
                          )}
                          {status.signInWithAllseerr && (
                            <p className="mt-1 text-as-ink-muted">
                              {intl.formatMessage(messages.signInWithAllseerr, {
                                app,
                              })}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-3">
                            {status.publicUrl && (
                              <Button
                                as="a"
                                href={status.publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                buttonType="primary"
                              >
                                <ArrowTopRightOnSquareIcon />
                                <span>
                                  {intl.formatMessage(messages.open, { app })}
                                </span>
                              </Button>
                            )}
                            {status.canResetPassword &&
                              !status.signInWithAllseerr &&
                              !password && (
                                <ConfirmButton
                                  onClick={() => run(status, 'password')}
                                  confirmText={intl.formatMessage(
                                    messages.confirmNewPassword
                                  )}
                                >
                                  <KeyIcon />
                                  <span>
                                    {intl.formatMessage(messages.newPassword)}
                                  </span>
                                </ConfirmButton>
                              )}
                          </div>
                          {status.canResetPassword &&
                            !status.signInWithAllseerr &&
                            !password && (
                              <p className="mt-2 text-xs text-as-ink-faint">
                                {intl.formatMessage(messages.newPasswordHint, {
                                  app,
                                })}
                              </p>
                            )}
                        </>
                      )}
                      {status.state === 'available' && (
                        <>
                          <p>
                            {intl.formatMessage(messages.available, { app })}
                          </p>
                          <Button
                            className="mt-3"
                            buttonType="primary"
                            onClick={() => run(status, 'setup')}
                            disabled={isBusy}
                          >
                            <span>{intl.formatMessage(messages.setUp)}</span>
                          </Button>
                        </>
                      )}
                      {status.state === 'notGranted' && (
                        <>
                          <p>
                            {intl.formatMessage(messages.notGranted, { app })}
                          </p>
                          <Button
                            className="mt-3"
                            onClick={() => run(status, 'request-access')}
                            disabled={isBusy}
                          >
                            <span>
                              {intl.formatMessage(messages.askForAccess)}
                            </span>
                          </Button>
                        </>
                      )}
                      {status.state === 'requested' && (
                        <p className="text-as-ink-muted">
                          {intl.formatMessage(messages.requestedDescription)}
                        </p>
                      )}
                      {status.state === 'error' && (
                        <>
                          <p>{intl.formatMessage(messages.error, { app })}</p>
                          <Button
                            className="mt-3"
                            onClick={() => run(status, 'setup')}
                            disabled={isBusy}
                          >
                            <ArrowPathIcon />
                            <span>{intl.formatMessage(messages.tryAgain)}</span>
                          </Button>
                        </>
                      )}
                    </div>
                    {password && <NewPasswordBox password={password} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

export default UserReadingApps;
