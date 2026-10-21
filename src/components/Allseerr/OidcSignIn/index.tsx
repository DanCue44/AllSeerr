import {
  AuthBackdrop,
  authCard,
  authHeading,
  authPage,
} from '@app/components/Allseerr/Auth';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Allseerr.OidcSignIn', {
  title: 'Signing in',
  signingIn: 'Signing you in with {applicationTitle}…',
});

/**
 * Where an app's "Sign in with Allseerr" comes back to after the person
 * signed in to Allseerr. The server checks their access and sends them on
 * to the app.
 */
const OidcSignIn = () => {
  const intl = useIntl();
  const router = useRouter();
  const { currentSettings } = useSettings();
  const uid = router.query.uid;

  useEffect(() => {
    if (typeof uid === 'string' && /^[\w-]+$/.test(uid)) {
      window.location.assign(
        `/api/v1/auth/oidc/interaction/${encodeURIComponent(uid)}`
      );
    }
  }, [uid]);

  return (
    <div className={authPage}>
      <PageTitle title={intl.formatMessage(messages.title)} />
      <AuthBackdrop />
      <div className="relative z-50 mt-16 px-4 sm:mx-auto sm:w-full sm:max-w-md">
        <div className={`${authCard} flex flex-col gap-6 px-6 py-10 sm:px-10`}>
          <h1 className={`${authHeading} text-center text-[20px] leading-7`}>
            {intl.formatMessage(messages.signingIn, {
              applicationTitle: currentSettings.applicationTitle,
            })}
          </h1>
          <LoadingSpinner />
        </div>
      </div>
    </div>
  );
};

export default OidcSignIn;
