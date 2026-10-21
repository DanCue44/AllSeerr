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
import PlexLoginButton from '@app/components/Login/PlexLoginButton';
import CopyButton from '@app/components/Settings/CopyButton';
import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import type { UserAccessApp } from '@server/constants/userAccess';
import type { NewPasswords } from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Allseerr.InviteAccept', {
  title: 'Invite',
  invited: 'You are invited to {apps}',
  signInFirst:
    'Sign in with your Plex account to accept. Your accounts are made right away.',
  accept: 'Accept as {name}',
  accepting: 'Setting up your accounts…',
  ready: 'You are all set',
  readyHelp:
    'Sign in to each app with these details. They are shown only now, so save them somewhere. You can also sign in with {applicationTitle} where an app offers it.',
  noPasswords:
    'Your access is ready. Sign in to each app with your {applicationTitle} login or the account you already have.',
  username: 'Username',
  password: 'Password',
  open: 'Open {app}',
  invalid: 'This invite link is not valid anymore. Ask for a new one.',
  failed: 'Something went wrong while setting up your accounts.',
  continue: 'Continue to {applicationTitle}',
});

interface InviteDescription {
  apps: { app: UserAccessApp; name: string; url: string | null }[];
  expiresAt: string;
}

/**
 * The page an invite link opens: sign in with Plex, then the accounts the
 * invite gives are made and their passwords shown once
 */
const InviteAccept = () => {
  const intl = useIntl();
  const router = useRouter();
  const { currentSettings } = useSettings();
  const { user, revalidate } = useUser();
  const token =
    typeof router.query.token === 'string' ? router.query.token : '';
  const { data: invite, error: inviteError } = useSWR<InviteDescription>(
    token ? `/api/v1/auth/invite/${encodeURIComponent(token)}` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewPasswords | null>(null);
  const applicationTitle = currentSettings.applicationTitle;

  const redeem = async () => {
    setIsWorking(true);
    setError(null);
    try {
      const response = await axios.post<{ passwords: NewPasswords }>(
        `/api/v1/auth/invite/${encodeURIComponent(token)}/redeem`
      );
      setResult(response.data.passwords);
    } catch {
      setError(intl.formatMessage(messages.failed));
    } finally {
      setIsWorking(false);
    }
  };

  const signInWithPlex = async (authToken: string) => {
    setIsWorking(true);
    setError(null);
    try {
      await axios.post('/api/v1/auth/plex', { authToken, inviteToken: token });
      await revalidate();
      await redeem();
    } catch (e) {
      setError(
        e.response?.data?.message ?? intl.formatMessage(messages.failed)
      );
      setIsWorking(false);
    }
  };

  const renderBody = () => {
    if (result) {
      const entries = Object.entries(result) as [
        UserAccessApp,
        NonNullable<NewPasswords[UserAccessApp]>,
      ][];

      return (
        <div className="flex flex-col gap-5">
          <h1 className={`${authHeading} text-center text-[22px] leading-8`}>
            {intl.formatMessage(messages.ready)}
          </h1>
          <p className="text-center text-sm text-as-ink-muted">
            {intl.formatMessage(
              entries.length ? messages.readyHelp : messages.noPasswords,
              { applicationTitle }
            )}
          </p>
          {invite?.apps.map(({ app, name, url }) => {
            const account = result[app];

            return (
              <div key={app} className="rounded-xl p-4 ring-1 ring-as-line">
                <div className="mb-2 font-semibold">{name}</div>
                {account && (
                  <div className="mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-sm">
                    <span className="text-as-ink-muted">
                      {intl.formatMessage(messages.username)}
                    </span>
                    <code className="truncate">{account.username}</code>
                    <CopyButton textToCopy={account.username} />
                    <span className="text-as-ink-muted">
                      {intl.formatMessage(messages.password)}
                    </span>
                    <code className="truncate">{account.password}</code>
                    <CopyButton textToCopy={account.password} />
                  </div>
                )}
                {url && (
                  <Button
                    as="a"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    buttonSize="sm"
                  >
                    <ArrowTopRightOnSquareIcon />
                    <span>
                      {intl.formatMessage(messages.open, { app: name })}
                    </span>
                  </Button>
                )}
              </div>
            );
          })}
          <Button
            buttonType="ghost"
            className={`w-full ${authPrimary}`}
            onClick={() => router.push('/')}
          >
            {intl.formatMessage(messages.continue, { applicationTitle })}
          </Button>
        </div>
      );
    }

    if (inviteError) {
      return (
        <Alert type="warning" title={intl.formatMessage(messages.invalid)} />
      );
    }

    if (!invite) {
      return <LoadingSpinner />;
    }

    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className={`${authHeading} text-[22px] leading-8`}>
            {intl.formatMessage(messages.invited, {
              apps: invite.apps.map((app) => app.name).join(', '),
            })}
          </h1>
          {!user && (
            <p className="mt-3 text-sm leading-6 text-as-ink-muted">
              {intl.formatMessage(messages.signInFirst)}
            </p>
          )}
        </div>
        {error && <Alert type="error" title={error} />}
        {isWorking ? (
          <div className="flex flex-col items-center gap-3 text-sm text-as-ink-muted">
            <LoadingSpinner />
            {intl.formatMessage(messages.accepting)}
          </div>
        ) : user ? (
          <Button
            buttonType="primary"
            className={`w-full ${authPrimary}`}
            onClick={() => redeem()}
          >
            {intl.formatMessage(messages.accept, { name: user.displayName })}
          </Button>
        ) : (
          <PlexLoginButton
            large
            isProcessing={isWorking}
            onAuthToken={(authToken) => signInWithPlex(authToken)}
            onError={(message) => setError(message)}
          />
        )}
      </div>
    );
  };

  return (
    <div className={authPage}>
      <PageTitle title={intl.formatMessage(messages.title)} />
      <AuthBackdrop />
      <div className="relative z-50 mt-16 px-4 sm:mx-auto sm:w-full sm:max-w-md">
        <div className={`${authCard} px-6 py-8 sm:px-10`}>{renderBody()}</div>
      </div>
    </div>
  );
};

export default InviteAccept;
