import EmbyLogo from '@app/assets/services/emby-icon-only.svg';
import JellyfinLogo from '@app/assets/services/jellyfin-icon.svg';
import PlexLogo from '@app/assets/services/plex.svg';
import {
  AuthBackdrop,
  authCard,
  authHeading,
  authPage,
} from '@app/components/Allseerr/Auth';
import AppLogo from '@app/components/Common/AppLogo';
import Button from '@app/components/Common/Button';
import ImageFader from '@app/components/Common/ImageFader';
import PageTitle from '@app/components/Common/PageTitle';
import LanguagePicker from '@app/components/Layout/LanguagePicker';
import JellyfinLogin from '@app/components/Login/JellyfinLogin';
import LocalLogin from '@app/components/Login/LocalLogin';
import PlexLoginButton from '@app/components/Login/PlexLoginButton';
import useBranding from '@app/hooks/useBranding';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { rememberLoginNext, takeLoginNext } from '@app/utils/loginRedirect';
import { Transition } from '@headlessui/react';
import { XCircleIcon } from '@heroicons/react/24/solid';
import { MediaServerType } from '@server/constants/server';
import axios from 'axios';
import { useRouter } from 'next/dist/client/router';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useIntl } from 'react-intl';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import useSWR from 'swr';

const messages = defineMessages('components.Login', {
  signin: 'Sign In',
  signinheader: 'Sign in to continue',
  signinwithplex: 'Use your Plex account',
  signinwithjellyfin: 'Use your {mediaServerName} account',
  signinwithoverseerr: 'Use your {applicationTitle} account',
  orsigninwith: 'Or sign in with',
});

const Login = () => {
  const intl = useIntl();
  const router = useRouter();
  const settings = useSettings();
  const { hasCustomLogo, logoUrl } = useBranding();
  const { user, revalidate } = useUser();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';

  const [error, setError] = useState('');
  const [isProcessing, setProcessing] = useState(false);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [mediaServerLogin, setMediaServerLogin] = useState(
    settings.currentSettings.mediaServerLogin
  );

  // Effect that is triggered when the `authToken` comes back from the Plex OAuth
  // We take the token and attempt to sign in. If we get a success message, we will
  // ask swr to revalidate the user which _should_ come back with a valid user.
  useEffect(() => {
    const login = async () => {
      setProcessing(true);
      try {
        const response = await axios.post('/api/v1/auth/plex', { authToken });

        if (response.data?.id) {
          revalidate();
        }
      } catch (e) {
        setError(e.response?.data?.message);
        setAuthToken(undefined);
        setProcessing(false);
      }
    };
    if (authToken) {
      login();
    }
  }, [authToken, revalidate]);

  // A page opened from outside, such as the NoBookEnds app's connect page,
  // is kept for this tab too, in case a sign in method leaves this page
  useEffect(() => {
    if (router.isReady) {
      rememberLoginNext(router.query.next);
    }
  }, [router.isReady, router.query.next]);

  // Effect that is triggered whenever `useUser`'s user changes. If we get a new
  // valid user, we redirect the user to the page they asked for, or the home
  // page, as the login was successful.
  useEffect(() => {
    if (user) {
      router.push(takeLoginNext(router.query.next));
    }
  }, [user, router]);

  const { data: backdrops } = useSWR<string[]>('/api/v1/backdrops', {
    refreshInterval: 0,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
  });

  const mediaServerName =
    settings.currentSettings.mediaServerType === MediaServerType.PLEX
      ? 'Plex'
      : settings.currentSettings.mediaServerType === MediaServerType.JELLYFIN
        ? 'Jellyfin'
        : settings.currentSettings.mediaServerType === MediaServerType.EMBY
          ? 'Emby'
          : undefined;

  const MediaServerLogo =
    settings.currentSettings.mediaServerType === MediaServerType.PLEX
      ? PlexLogo
      : settings.currentSettings.mediaServerType === MediaServerType.JELLYFIN
        ? JellyfinLogo
        : settings.currentSettings.mediaServerType === MediaServerType.EMBY
          ? EmbyLogo
          : undefined;

  const isJellyfin =
    settings.currentSettings.mediaServerType === MediaServerType.JELLYFIN ||
    settings.currentSettings.mediaServerType === MediaServerType.EMBY;
  const mediaServerLoginRef = useRef<HTMLDivElement>(null);
  const localLoginRef = useRef<HTMLDivElement>(null);
  const loginRef = mediaServerLogin ? mediaServerLoginRef : localLoginRef;

  const loginFormVisible =
    (isJellyfin && settings.currentSettings.mediaServerLogin) ||
    settings.currentSettings.localLogin;
  const additionalLoginOptions = [
    settings.currentSettings.mediaServerLogin &&
      (settings.currentSettings.mediaServerType === MediaServerType.PLEX ? (
        <PlexLoginButton
          key="plex"
          isProcessing={isProcessing}
          onAuthToken={(authToken) => setAuthToken(authToken)}
          large={!isJellyfin && !settings.currentSettings.localLogin}
        />
      ) : (
        settings.currentSettings.localLogin &&
        (mediaServerLogin ? (
          <Button
            key="seerr"
            data-testid="seerr-login-button"
            className={`flex-1 bg-transparent ${ambient ? 'h-[50px]' : ''}`}
            onClick={() => setMediaServerLogin(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hasCustomLogo ? logoUrl : '/allseerr-logo.png'}
              alt={settings.currentSettings.applicationTitle}
              className="mr-2 h-5"
            />
            <span>{settings.currentSettings.applicationTitle}</span>
          </Button>
        ) : (
          <Button
            key="mediaserver"
            data-testid="mediaserver-login-button"
            className={`flex-1 bg-transparent ${ambient ? 'h-[50px]' : ''}`}
            onClick={() => setMediaServerLogin(true)}
          >
            <MediaServerLogo />
            <span>{mediaServerName}</span>
          </Button>
        ))
      )),
  ].filter((o): o is JSX.Element => !!o);

  const backdropImages =
    backdrops?.map(
      (backdrop) => `https://image.tmdb.org/t/p/original${backdrop}`
    ) ?? [];

  return (
    <div
      className={
        ambient
          ? authPage
          : 'relative flex min-h-screen flex-col bg-gray-900 py-14'
      }
    >
      <PageTitle title={intl.formatMessage(messages.signin)} />
      {ambient ? (
        <AuthBackdrop images={backdropImages} />
      ) : (
        <ImageFader backgroundImages={backdropImages} />
      )}
      <div className="absolute right-4 top-4 z-50">
        <LanguagePicker />
      </div>
      <div className="relative z-40 mt-10 flex flex-col items-center px-4 sm:mx-auto sm:w-full sm:max-w-md">
        <div
          className={`relative w-full max-w-full ${ambient ? 'h-40' : 'h-48'}`}
        >
          <AppLogo variant="stacked" />
        </div>
      </div>
      <div className="relative z-50 mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div
          className={ambient ? authCard : 'bg-gray-800/50 shadow sm:rounded-lg'}
          style={ambient ? undefined : { backdropFilter: 'blur(5px)' }}
        >
          <>
            <Transition
              as="div"
              show={!!error}
              enter="transition-opacity duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div
                className={
                  ambient
                    ? 'mx-6 mb-0 mt-6 rounded-[18px] bg-as-bad-bg p-4'
                    : 'mb-4 rounded-md bg-red-600 p-4'
                }
              >
                <div className="flex">
                  <div className="flex-shrink-0">
                    <XCircleIcon
                      className={`h-5 w-5 ${
                        ambient ? 'text-as-bad' : 'text-red-300'
                      }`}
                    />
                  </div>
                  <div className="ml-3">
                    <h3
                      className={`text-sm font-medium ${
                        ambient ? 'text-as-bad' : 'text-red-300'
                      }`}
                    >
                      {error}
                    </h3>
                  </div>
                </div>
              </div>
            </Transition>
            <div className={ambient ? 'px-6 py-8 sm:px-10' : 'px-10 py-8'}>
              <SwitchTransition mode="out-in">
                <CSSTransition
                  key={mediaServerLogin ? 'ms' : 'local'}
                  nodeRef={loginRef}
                  timeout={{ enter: 300, exit: 150 }}
                  onEntered={() => {
                    document
                      .querySelector<HTMLInputElement>('#email, #username')
                      ?.focus();
                  }}
                  classNames={{
                    enter: 'opacity-0',
                    enterActive: 'transition-opacity duration-300 opacity-100',
                    exit: 'opacity-100',
                    exitActive: 'transition-opacity duration-150 opacity-0',
                  }}
                >
                  <div ref={loginRef} className="button-container">
                    {isJellyfin &&
                    (mediaServerLogin ||
                      !settings.currentSettings.localLogin) ? (
                      <JellyfinLogin
                        serverType={settings.currentSettings.mediaServerType}
                        revalidate={revalidate}
                      />
                    ) : (
                      settings.currentSettings.localLogin && (
                        <LocalLogin revalidate={revalidate} />
                      )
                    )}
                  </div>
                </CSSTransition>
              </SwitchTransition>

              {additionalLoginOptions.length > 0 &&
                (loginFormVisible ? (
                  <div className="flex items-center py-5">
                    <div
                      className={`flex-grow border-t ${
                        ambient ? 'border-as-line' : 'border-gray-600'
                      }`}
                    />
                    <span
                      className={`mx-2 flex-shrink text-sm ${
                        ambient ? 'text-as-ink-faint' : 'text-gray-400'
                      }`}
                    >
                      {intl.formatMessage(messages.orsigninwith)}
                    </span>
                    <div
                      className={`flex-grow border-t ${
                        ambient ? 'border-as-line' : 'border-gray-600'
                      }`}
                    />
                  </div>
                ) : (
                  <h2
                    className={`mb-6 text-center ${
                      ambient
                        ? authHeading
                        : 'text-lg font-bold text-neutral-200'
                    }`}
                  >
                    {intl.formatMessage(messages.signinheader)}
                  </h2>
                ))}

              <div
                className={`flex w-full flex-wrap gap-2 ${
                  !loginFormVisible ? 'flex-col' : ''
                }`}
              >
                {additionalLoginOptions}
              </div>
            </div>
          </>
        </div>
      </div>
    </div>
  );
};

export default Login;
