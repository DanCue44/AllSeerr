import Button from '@app/components/Common/Button';
import {
  APPS,
  APP_NAMES,
} from '@app/components/Settings/SettingsUserAccess/common';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import type { UserAccessApp } from '@server/constants/userAccess';
import type {
  AppAccountListItem,
  AppAccountsResponse,
  LinkAppAccountResult,
  PersonAccess,
  UserAccessAppInfo,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.LinkAccount',
  {
    linkExisting: 'Link an existing account',
    linkExistingHelp:
      'For an account they already have under another name. It keeps its password, and Allseerr manages it from now on.',
    pickAccount: 'Pick an account',
    likelyMatch: 'Likely match',
    admin: 'admin',
    link: 'Link',
    linking: 'Linking…',
    unlink: 'Unlink',
    linkError: 'Something went wrong while linking: {message}',
    title: 'Link existing accounts',
    description:
      'Accounts in the apps that are not linked to anyone in Allseerr yet. Pick whose each one is and link it, so signing in with Allseerr opens it instead of making a new one. Likely owners are picked for you; nothing is linked until you press Link.',
    allLinked: 'Every account is linked.',
    pickPerson: 'Pick a person',
    noAccounts: 'Could not list the accounts: {message}',
  }
);

const accountsKey = (app: UserAccessApp) =>
  `/api/v1/user-access/apps/${app}/accounts`;

const accountLabel = (
  account: AppAccountListItem,
  adminLabel: string
): string =>
  [
    account.username,
    account.email && account.email !== account.username
      ? `(${account.email})`
      : null,
    account.isAdmin ? `· ${adminLabel}` : null,
  ]
    .filter(Boolean)
    .join(' ');

/**
 * Links a person to one of the app's accounts and refreshes everything that
 * shows who is linked
 */
const useLinkAccount = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [linking, setLinking] = useState<string | null>(null);

  const link = async (
    userId: number,
    app: UserAccessApp,
    remoteUserId: string
  ): Promise<LinkAppAccountResult | null> => {
    setLinking(`${app}:${remoteUserId}`);
    try {
      const response = await axios.post<LinkAppAccountResult>(
        `/api/v1/user-access/people/${userId}/apps/${app}/link`,
        { remoteUserId }
      );
      if (response.data.warning) {
        addToast(response.data.warning, { appearance: 'warning' });
      }
      mutate(accountsKey(app));
      mutate('/api/v1/user-access/people');
      return response.data;
    } catch (e) {
      addToast(
        intl.formatMessage(messages.linkError, {
          message: e.response?.data?.message ?? e.message,
        }),
        { appearance: 'error', autoDismiss: true }
      );
      return null;
    } finally {
      setLinking(null);
    }
  };

  return { link, linking };
};

/**
 * In a person's access: links them to an account they already have in the
 * app, the likely one first
 */
export const LinkAccountPicker = ({
  person,
  app,
  onLinked,
}: {
  person: PersonAccess;
  app: UserAccessApp;
  onLinked: (person: PersonAccess) => void;
}) => {
  const intl = useIntl();
  const { data, error } = useSWR<AppAccountsResponse>(accountsKey(app));
  const { link, linking } = useLinkAccount();
  const accounts = (data?.accounts ?? [])
    .filter((account) => account.linkedUserId === null)
    .sort(
      (a, b) =>
        Number(b.suggestedUserId === person.userId) -
        Number(a.suggestedUserId === person.userId)
    );
  const likely = accounts.find(
    (account) => account.suggestedUserId === person.userId
  );
  const [choice, setChoice] = useState<string>('');
  const selected = choice || likely?.id || '';

  if (error || !data || accounts.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="mb-1 text-sm font-semibold">
        {intl.formatMessage(messages.linkExisting)}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label={intl.formatMessage(messages.linkExisting)}
          className="min-w-0 flex-1"
          value={selected}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">{intl.formatMessage(messages.pickAccount)}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountLabel(account, intl.formatMessage(messages.admin))}
              {account.suggestedUserId === person.userId
                ? ` · ${intl.formatMessage(messages.likelyMatch)}`
                : ''}
            </option>
          ))}
        </select>
        <Button
          buttonSize="sm"
          disabled={!selected || !!linking}
          onClick={async () => {
            const result = await link(person.userId, app, selected);
            if (result) {
              onLinked(result.person);
            }
          }}
        >
          {intl.formatMessage(linking ? messages.linking : messages.link)}
        </Button>
      </div>
      <p className="mt-1 text-xs text-as-ink-faint">
        {intl.formatMessage(messages.linkExistingHelp)}
      </p>
    </div>
  );
};

/**
 * Unlinks a person's account, leaving it as it is in the app
 */
export const UnlinkAccountButton = ({
  person,
  app,
  disabled,
  onUnlinked,
}: {
  person: PersonAccess;
  app: UserAccessApp;
  disabled?: boolean;
  onUnlinked: (person: PersonAccess) => void;
}) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      buttonSize="sm"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          const response = await axios.post<PersonAccess>(
            `/api/v1/user-access/people/${person.userId}/apps/${app}/unlink`
          );
          mutate(accountsKey(app));
          onUnlinked(response.data);
        } catch (e) {
          addToast(
            intl.formatMessage(messages.linkError, {
              message: e.response?.data?.message ?? e.message,
            }),
            { appearance: 'error', autoDismiss: true }
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {intl.formatMessage(messages.unlink)}
    </Button>
  );
};

const AppAccountsToLink = ({
  app,
  people,
}: {
  app: UserAccessApp;
  people: PersonAccess[];
}) => {
  const intl = useIntl();
  const { data, error } = useSWR<AppAccountsResponse>(accountsKey(app));
  const { link, linking } = useLinkAccount();
  const [choices, setChoices] = useState<Record<string, string>>({});

  if (error) {
    return (
      <p className="text-sm text-as-ink-faint">
        {APP_NAMES[app]}:{' '}
        {intl.formatMessage(messages.noAccounts, {
          message: error.response?.data?.message ?? error.message,
        })}
      </p>
    );
  }
  if (!data) {
    return null;
  }

  // Only people without an account in the app can take one
  const free = people.filter((person) => !person.apps[app].remoteUsername);
  const accounts = data.accounts.filter(
    (account) => account.linkedUserId === null
  );

  return (
    <div className="mb-6">
      <h4 className="mb-2 font-semibold">{APP_NAMES[app]}</h4>
      {accounts.length === 0 ? (
        <p className="text-sm text-as-ink-faint">
          {intl.formatMessage(messages.allLinked)}
        </p>
      ) : (
        <ul className="divide-y divide-as-line rounded-xl ring-1 ring-as-line">
          {accounts.map((account) => {
            const chosen =
              choices[account.id] ??
              (account.suggestedUserId ? String(account.suggestedUserId) : '');

            return (
              <li
                key={account.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
                data-testid="link-account-row"
              >
                <div className="min-w-0 sm:w-1/3">
                  <div className="truncate font-mono text-sm">
                    {account.username}
                  </div>
                  {(account.email || account.isAdmin) && (
                    <div className="truncate text-xs text-as-ink-faint">
                      {[
                        account.email !== account.username
                          ? account.email
                          : null,
                        account.isAdmin
                          ? intl.formatMessage(messages.admin)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 gap-2">
                  <select
                    aria-label={intl.formatMessage(messages.pickPerson)}
                    className="min-w-0 flex-1"
                    value={chosen}
                    onChange={(e) =>
                      setChoices((current) => ({
                        ...current,
                        [account.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {intl.formatMessage(messages.pickPerson)}
                    </option>
                    {free.map((person) => (
                      <option key={person.userId} value={person.userId}>
                        {person.displayName}
                        {account.suggestedUserId === person.userId
                          ? ` · ${intl.formatMessage(messages.likelyMatch)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  <Button
                    buttonSize="sm"
                    disabled={!chosen || !!linking}
                    onClick={() => link(Number(chosen), app, account.id)}
                  >
                    {intl.formatMessage(
                      linking === `${app}:${account.id}`
                        ? messages.linking
                        : messages.link
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * Settings helper that links every app account not linked yet in one pass,
 * each to the person picked for it
 */
const LinkExistingAccounts = ({ apps }: { apps: UserAccessAppInfo[] }) => {
  const intl = useIntl();
  const { data: people } = useSWR<PersonAccess[]>('/api/v1/user-access/people');
  const connected = APPS.filter(
    (app) => apps.find((info) => info.app === app)?.connected
  );

  if (!people || connected.length === 0) {
    return null;
  }

  return (
    <div className="mb-10" data-testid="link-existing-accounts">
      <h3 className="heading">{intl.formatMessage(messages.title)}</h3>
      <p className="description">{intl.formatMessage(messages.description)}</p>
      {connected.map((app) => (
        <AppAccountsToLink key={app} app={app} people={people} />
      ))}
    </div>
  );
};

export default LinkExistingAccounts;
