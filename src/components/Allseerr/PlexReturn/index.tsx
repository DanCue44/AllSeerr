import {
  AuthBackdrop,
  authCard,
  authPage,
  authPrimary,
} from '@app/components/Allseerr/Auth';
import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import { takeLoginNext } from '@app/utils/loginRedirect';
import PlexOAuth from '@app/utils/plex';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Allseerr.PlexReturn', {
  title: 'Signing In',
  signingIn: 'Signing you in with Plex…',
  failed: 'Signing in with Plex did not finish.',
  tryAgain: 'Try Again',
});

const plexOAuth = new PlexOAuth();

/**
 * Where Plex sends the browser back to after a sign in by redirect. Finishes
 * the sign in, then goes on to the page the sign in was for.
 */
const PlexReturn = () => {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const finish = async () => {
      try {
        const authToken = await plexOAuth.finishRedirectLogin(
          currentSettings.plexClientIdentifier
        );
        await axios.post('/api/v1/auth/plex', { authToken });
        window.location.replace(takeLoginNext(undefined));
      } catch (e) {
        setError(e.response?.data?.message ?? e.message);
      }
    };

    finish();
  }, [currentSettings.plexClientIdentifier]);

  const tryAgain = async () => {
    setError(null);
    try {
      await plexOAuth.loginByRedirect(currentSettings.plexClientIdentifier);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className={authPage}>
      <PageTitle title={intl.formatMessage(messages.title)} />
      <AuthBackdrop />
      <div className="relative z-50 mt-8 px-4 sm:mx-auto sm:w-full sm:max-w-md">
        <div className={`${authCard} px-6 py-8 sm:px-10`}>
          {error ? (
            <div className="flex flex-col gap-5">
              <Alert title={intl.formatMessage(messages.failed)} type="error">
                {error}
              </Alert>
              <Button
                buttonType="primary"
                className={`w-full ${authPrimary}`}
                onClick={() => tryAgain()}
              >
                {intl.formatMessage(messages.tryAgain)}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <LoadingSpinner />
              <p className="text-[15px] text-as-ink">
                {intl.formatMessage(messages.signingIn)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlexReturn;
