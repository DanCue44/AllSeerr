import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Table from '@app/components/Common/Table';
import NewPasswordsModal from '@app/components/Settings/SettingsUserAccess/NewPasswordsModal';
import PersonAccessModal from '@app/components/Settings/SettingsUserAccess/PersonAccessModal';
import {
  APPS,
  APP_NAMES,
  ageLimitMessage,
  commonMessages,
} from '@app/components/Settings/SettingsUserAccess/common';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { CheckIcon, PencilIcon } from '@heroicons/react/24/solid';
import type { UserAccessApp } from '@server/constants/userAccess';
import type {
  NewPasswords,
  PersonAccess,
  PersonUpdateResult,
  UserAccessAppInfo,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.People',
  {
    people: 'People',
    peopleDescription:
      'Everyone who can sign in to Allseerr. Turning on an app lets them set up their account in one tap and tells them, or links the one they already have.',
    person: 'Person',
    ageLimit: 'Age limit',
    edit: 'Edit',
    admin: 'Admin',
    asked: 'Asked for access',
    grant: 'Grant',
    askedCount:
      '{count, plural, one {# person asked} other {# people asked}} for access to an app. Grant it below, or open Edit to choose libraries first.',
    grantError: 'Something went wrong while granting access.',
  }
);

interface PeopleProps {
  apps: UserAccessAppInfo[];
}

const People = ({ apps }: PeopleProps) => {
  const intl = useIntl();
  const { data: people, mutate } = useSWR<PersonAccess[]>(
    '/api/v1/user-access/people'
  );
  const [editing, setEditing] = useState<PersonAccess | null>(null);
  const [passwords, setPasswords] = useState<{
    name: string;
    passwords: NewPasswords;
  } | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const { addToast } = useToasts();

  // Gives one app to a person who asked for it, in one tap
  const grant = async (person: PersonAccess, app: UserAccessApp) => {
    setGranting(`${person.userId}:${app}`);
    try {
      const response = await axios.post<PersonUpdateResult>(
        `/api/v1/user-access/people/${person.userId}`,
        { apps: { [app]: { enabled: true } } }
      );
      mutate();
      if (Object.keys(response.data.passwords).length) {
        setPasswords({
          name: person.displayName,
          passwords: response.data.passwords,
        });
      }
    } catch {
      addToast(intl.formatMessage(messages.grantError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setGranting(null);
    }
  };

  if (!people) {
    return <LoadingSpinner />;
  }

  const askedCount = people.filter((person) =>
    APPS.some((app) => person.apps[app].accessRequestedAt)
  ).length;

  return (
    <div className="mb-10">
      <h3 className="heading">{intl.formatMessage(messages.people)}</h3>
      <p className="description">
        {intl.formatMessage(messages.peopleDescription)}
      </p>
      {askedCount > 0 && (
        <p
          className="mb-4 rounded-xl bg-as-tile px-4 py-3 text-sm ring-1 ring-as-line"
          data-testid="user-access-asked"
        >
          {intl.formatMessage(messages.askedCount, { count: askedCount })}
        </p>
      )}
      <Table>
        <thead>
          <tr>
            <Table.TH>{intl.formatMessage(messages.person)}</Table.TH>
            <Table.TH>{intl.formatMessage(messages.ageLimit)}</Table.TH>
            {APPS.map((app) => (
              <Table.TH key={app}>{APP_NAMES[app]}</Table.TH>
            ))}
            <Table.TH />
          </tr>
        </thead>
        <Table.TBody>
          {people.map((person) => (
            <tr key={person.userId} data-testid="user-access-person">
              <Table.TD>
                <div className="flex items-center gap-3">
                  <CachedImage
                    type="avatar"
                    className="h-9 w-9 rounded-full object-cover"
                    src={person.avatar}
                    alt=""
                    width={36}
                    height={36}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {person.displayName}
                    </div>
                    {person.email !== person.displayName && (
                      <div className="truncate text-sm text-as-ink-muted">
                        {person.email}
                      </div>
                    )}
                  </div>
                </div>
              </Table.TD>
              <Table.TD>
                {person.isAdmin ? (
                  <Badge badgeType="primary">
                    {intl.formatMessage(messages.admin)}
                  </Badge>
                ) : (
                  intl.formatMessage(ageLimitMessage(person.ageLimit))
                )}
              </Table.TD>
              {APPS.map((app) => {
                const access = person.apps[app];

                return (
                  <Table.TD key={app}>
                    {access.accessRequestedAt ? (
                      <div className="flex flex-col items-start gap-2">
                        <Badge badgeType="warning">
                          {intl.formatMessage(messages.asked)}
                        </Badge>
                        <Button
                          buttonSize="sm"
                          buttonType="primary"
                          onClick={() => grant(person, app)}
                          disabled={granting === `${person.userId}:${app}`}
                        >
                          <CheckIcon />
                          <span>{intl.formatMessage(messages.grant)}</span>
                        </Button>
                      </div>
                    ) : access.enabled || access.status !== 'none' ? (
                      <Badge
                        badgeType={
                          access.status === 'active'
                            ? 'success'
                            : access.status === 'error'
                              ? 'danger'
                              : 'default'
                        }
                      >
                        {intl.formatMessage(
                          commonMessages[`status${access.status}`]
                        )}
                      </Badge>
                    ) : (
                      <span className="text-as-ink-faint">-</span>
                    )}
                  </Table.TD>
                );
              })}
              <Table.TD alignText="right">
                <Button buttonSize="sm" onClick={() => setEditing(person)}>
                  <PencilIcon />
                  <span>{intl.formatMessage(messages.edit)}</span>
                </Button>
              </Table.TD>
            </tr>
          ))}
        </Table.TBody>
      </Table>

      {editing && (
        <PersonAccessModal
          person={editing}
          apps={apps}
          onClose={() => setEditing(null)}
          onSaved={(person, newPasswords) => {
            mutate();
            setEditing(null);
            if (Object.keys(newPasswords).length) {
              setPasswords({
                name: person.displayName,
                passwords: newPasswords,
              });
            }
          }}
        />
      )}
      {passwords && (
        <NewPasswordsModal
          name={passwords.name}
          passwords={passwords.passwords}
          onClose={() => setPasswords(null)}
        />
      )}
    </div>
  );
};

export default People;
