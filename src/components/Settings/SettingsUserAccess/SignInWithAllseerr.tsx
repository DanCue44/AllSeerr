import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import Modal from '@app/components/Common/Modal';
import CopyButton from '@app/components/Settings/CopyButton';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type {
  OidcApp,
  OidcClientResponse,
  OidcSettingsResponse,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const OIDC_APP_NAMES: Record<OidcApp, string> = {
  audiobookshelf: 'Audiobookshelf',
  kavita: 'Kavita',
  komga: 'Komga',
  nobookends: 'NoBookEnds',
};

const SETUP_APPS: OidcApp[] = ['audiobookshelf', 'kavita', 'komga'];

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.SignInWithAllseerr',
  {
    title: 'Sign in with {applicationTitle}',
    description:
      'Apps can sign people in with their {applicationTitle} login, so nobody needs another password. Only people with access to an app get in.',
    enable: 'Let apps sign people in with {applicationTitle}',
    issuer: 'Issuer address',
    noApplicationUrl:
      'Set the Application URL in the general settings first. Apps reach {applicationTitle} there.',
    register: 'Set up {app}',
    registered: 'Set up',
    clientId: 'Client ID',
    clientSecret: 'Client secret',
    redirectUris: 'Redirect addresses',
    newSecret: 'New secret',
    remove: 'Remove',
    removeConfirm: 'Sure? {app} stops signing people in.',
    setupTitle: 'Set up {app}',
    secretOnce:
      'The client secret is shown only now. Copy it into {app} before closing this.',
    done: 'Done',
    failure: 'Something went wrong: {message}',
    needsPublicUrl:
      'Add {app}’s public address in its connection above, so Allseerr knows where to send people back.',
    stepsAudiobookshelf:
      'In Audiobookshelf, open Settings, Authentication and turn on OpenID Connect Authentication. Set Issuer URL to the issuer address and press Auto-populate, then fill in the Client ID and Client Secret. Set Match existing users by to email, turn on Auto Register, set Group Claim to abs_groups and Advanced Permission Claim to abs_permissions. Leave Subfolder for Redirect URLs empty unless Audiobookshelf runs under a subfolder, then save.',
    stepsKavita:
      'In Kavita, open Server Settings, OpenID Connect. Set Authority to the issuer address, Client ID and Secret to the values here, turn on Provision accounts and Sync user settings, and save. Kavita then restarts. Kavita reads libraries by name and the age limit from Allseerr at every sign in.',
    stepsKomga:
      'Add these variables to the Komga container and restart it: {variables} Komga signs people in by email. Allseerr sets their libraries and age limit in Komga within 30 minutes of their first sign in, or right away from People.',
  }
);

// Spring Boot reads these from the environment: dots become underscores and
// dashes are dropped, so client-id is CLIENTID
const komgaVariables = (issuer: string, clientId: string, secret: string) =>
  [
    `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_PROVIDER=allseerr`,
    `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_CLIENTID=${clientId}`,
    `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_CLIENTSECRET=${secret}`,
    `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_CLIENTNAME=Allseerr`,
    `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_SCOPE=openid,email,profile`,
    `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_AUTHORIZATIONGRANTTYPE=authorization_code`,
    `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_REDIRECTURI={baseUrl}/{action}/oauth2/code/{registrationId}`,
    `SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_ALLSEERR_ISSUERURI=${issuer}`,
    `SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_ALLSEERR_USERNAMEATTRIBUTE=sub`,
    `KOMGA_OAUTH2ACCOUNTCREATION=true`,
  ].join('\n');

const SignInWithAllseerr = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const { data, mutate } = useSWR<OidcSettingsResponse>(
    '/api/v1/settings/user-access/oidc'
  );
  const [setup, setSetup] = useState<{
    client: OidcClientResponse;
    clientSecret: string;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!data) {
    return null;
  }

  const applicationTitle = currentSettings.applicationTitle;

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await action();
      await mutate();
    } catch (e) {
      addToast(
        intl.formatMessage(messages.failure, {
          message: e.response?.data?.message ?? e.message,
        }),
        { autoDismiss: true, appearance: 'error' }
      );
    } finally {
      setIsBusy(false);
    }
  };

  const steps = (app: OidcApp, clientId: string, secret: string) => {
    switch (app) {
      case 'audiobookshelf':
        return intl.formatMessage(messages.stepsAudiobookshelf);
      case 'kavita':
        return intl.formatMessage(messages.stepsKavita);
      case 'komga':
        return intl.formatMessage(messages.stepsKomga, {
          variables: (
            <pre className="my-2 overflow-x-auto whitespace-pre rounded-lg bg-as-raised p-3 text-xs">
              {komgaVariables(data.issuer ?? '', clientId, secret)}
            </pre>
          ),
        });
      default:
        return null;
    }
  };

  return (
    <div className="mb-10">
      <h3 className="heading">
        {intl.formatMessage(messages.title, { applicationTitle })}
      </h3>
      <p className="description">
        {intl.formatMessage(messages.description, { applicationTitle })}
      </p>
      {!data.issuer && (
        <div className="mt-4">
          <Alert
            type="warning"
            title={intl.formatMessage(messages.noApplicationUrl, {
              applicationTitle,
            })}
          />
        </div>
      )}
      <div className="form-row mt-6">
        <label htmlFor="oidcEnabled" className="checkbox-label">
          {intl.formatMessage(messages.enable, { applicationTitle })}
        </label>
        <div className="form-input-area">
          <input
            type="checkbox"
            id="oidcEnabled"
            checked={data.enabled}
            disabled={!data.issuer || isBusy}
            onChange={(e) =>
              run(async () => {
                await axios.post('/api/v1/settings/user-access/oidc', {
                  enabled: e.target.checked,
                });
              })
            }
          />
        </div>
      </div>
      {data.enabled && data.issuer && (
        <>
          <div className="form-row">
            <span className="text-label">
              {intl.formatMessage(messages.issuer)}
            </span>
            <div className="form-input-area">
              <div className="form-input-field">
                <input type="text" value={data.issuer} readOnly />
                <CopyButton textToCopy={data.issuer} />
              </div>
            </div>
          </div>
          <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {SETUP_APPS.map((app) => {
              const client = data.clients.find((c) => c.app === app);
              const canRegister = data.defaultRedirectUris[app]?.length > 0;

              return (
                <li
                  key={app}
                  className="flex flex-col gap-3 rounded-[22px] bg-as-surface p-5 ring-1 ring-as-line"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{OIDC_APP_NAMES[app]}</span>
                    {client && (
                      <Badge badgeType="success">
                        {intl.formatMessage(messages.registered)}
                      </Badge>
                    )}
                  </div>
                  {client ? (
                    <>
                      <div className="text-sm">
                        <div className="text-as-ink-muted">
                          {intl.formatMessage(messages.clientId)}
                        </div>
                        <code>{client.clientId}</code>
                      </div>
                      <div className="text-sm">
                        <div className="text-as-ink-muted">
                          {intl.formatMessage(messages.redirectUris)}
                        </div>
                        {client.redirectUris.map((uri) => (
                          <code key={uri} className="block truncate">
                            {uri}
                          </code>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          buttonSize="sm"
                          disabled={isBusy}
                          onClick={() =>
                            run(async () => {
                              const response = await axios.post<{
                                client: OidcClientResponse;
                                clientSecret: string;
                              }>(
                                `/api/v1/settings/user-access/oidc/clients/${client.clientId}/secret`
                              );
                              setSetup(response.data);
                            })
                          }
                        >
                          {intl.formatMessage(messages.newSecret)}
                        </Button>
                        <ConfirmButton
                          onClick={() =>
                            run(async () => {
                              await axios.delete(
                                `/api/v1/settings/user-access/oidc/clients/${client.clientId}`
                              );
                            })
                          }
                          confirmText={intl.formatMessage(
                            messages.removeConfirm,
                            { app: OIDC_APP_NAMES[app] }
                          )}
                        >
                          {intl.formatMessage(messages.remove)}
                        </ConfirmButton>
                      </div>
                    </>
                  ) : canRegister ? (
                    <Button
                      buttonType="primary"
                      disabled={isBusy}
                      onClick={() =>
                        run(async () => {
                          const response = await axios.post<{
                            client: OidcClientResponse;
                            clientSecret: string;
                          }>('/api/v1/settings/user-access/oidc/clients', {
                            app,
                          });
                          setSetup(response.data);
                        })
                      }
                    >
                      {intl.formatMessage(messages.register, {
                        app: OIDC_APP_NAMES[app],
                      })}
                    </Button>
                  ) : (
                    <p className="text-sm text-as-ink-faint">
                      {intl.formatMessage(messages.needsPublicUrl, {
                        app: OIDC_APP_NAMES[app],
                      })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {setup && (
        <Transition
          as="div"
          appear
          show
          enter="transition-opacity ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity ease-in-out duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Modal
            title={intl.formatMessage(messages.setupTitle, {
              app: OIDC_APP_NAMES[setup.client.app],
            })}
            onOk={() => setSetup(null)}
            okText={intl.formatMessage(messages.done)}
            backgroundClickable={false}
          >
            <Alert
              type="warning"
              title={intl.formatMessage(messages.secretOnce, {
                app: OIDC_APP_NAMES[setup.client.app],
              })}
            />
            <div className="mt-4 space-y-4">
              {[
                [messages.issuer, data.issuer ?? ''],
                [messages.clientId, setup.client.clientId],
                [messages.clientSecret, setup.clientSecret],
              ].map(([label, value]) => (
                <div key={String(value)}>
                  <div className="mb-1 text-sm text-as-ink-muted">
                    {intl.formatMessage(label as typeof messages.issuer)}
                  </div>
                  <div className="form-input-field">
                    <input type="text" value={String(value)} readOnly />
                    <CopyButton textToCopy={String(value)} />
                  </div>
                </div>
              ))}
              <div className="text-sm leading-6 text-as-ink-soft">
                {steps(
                  setup.client.app,
                  setup.client.clientId,
                  setup.clientSecret
                )}
              </div>
            </div>
          </Modal>
        </Transition>
      )}
    </div>
  );
};

export default SignInWithAllseerr;
