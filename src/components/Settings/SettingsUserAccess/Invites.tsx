import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import CopyButton from '@app/components/Settings/CopyButton';
import {
  AGE_LIMIT_OPTIONS,
  APPS,
  APP_NAMES,
  ageLimitMessage,
} from '@app/components/Settings/SettingsUserAccess/common';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { PlusIcon } from '@heroicons/react/24/solid';
import type { UserAccessApp } from '@server/constants/userAccess';
import type {
  AgeLimit,
  InviteSummary,
  UserAccessAppInfo,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.Invites',
  {
    invites: 'Invite links',
    invitesDescription:
      'A link lets one person sign in with Plex, even without access to your Plex server, and gives them the apps you pick. Each link works once.',
    newInvite: 'New invite link',
    label: 'For',
    labelHelp: 'Only you see this, such as their name',
    apps: 'Apps',
    ageLimit: 'Age limit',
    days: 'Works for',
    daysValue: '{days, plural, one {# day} other {# days}}',
    create: 'Make link',
    creating: 'Making…',
    cancel: 'Cancel',
    done: 'Done',
    linkTitle: 'Invite link',
    linkHelp:
      'Send this link to the person. It is shown only now; Allseerr keeps only a hash of it.',
    noApplicationUrl:
      'Set the Application URL in the general settings so invite links point at your Allseerr.',
    pickApp: 'Pick at least one app.',
    createFailure: 'Something went wrong while making the link.',
    none: 'No invite links yet.',
    revoke: 'Revoke',
    used: 'Used by {name}',
    revoked: 'Revoked',
    expired: 'Expired',
    open: 'Open until {date}',
  }
);

interface InvitesProps {
  apps: UserAccessAppInfo[];
}

const Invites = ({ apps }: InvitesProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const { data: invites, mutate } = useSWR<InviteSummary[]>(
    '/api/v1/user-access/invites'
  );
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [selectedApps, setSelectedApps] = useState<UserAccessApp[]>([]);
  const [ageLimit, setAgeLimit] = useState<AgeLimit>('none');
  const [days, setDays] = useState(7);
  const [link, setLink] = useState<string | null>(null);

  const connectedApps = APPS.filter(
    (app) => apps.find((info) => info.app === app)?.connected
  );

  const create = async () => {
    if (!selectedApps.length) {
      addToast(intl.formatMessage(messages.pickApp), {
        autoDismiss: true,
        appearance: 'error',
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await axios.post<{ link: string }>(
        '/api/v1/user-access/invites',
        {
          label: label || null,
          ageLimit,
          days,
          apps: Object.fromEntries(
            selectedApps.map((app) => [
              app,
              { enabled: true, libraryIds: null },
            ])
          ),
        }
      );
      setLink(response.data.link);
      setIsCreating(false);
      setLabel('');
      setSelectedApps([]);
      setAgeLimit('none');
      mutate();
    } catch {
      addToast(intl.formatMessage(messages.createFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const revoke = async (id: number) => {
    await axios.delete(`/api/v1/user-access/invites/${id}`);
    mutate();
  };

  const stateOf = (invite: InviteSummary) => {
    if (invite.redeemedAt) {
      return (
        <Badge badgeType="success">
          {intl.formatMessage(messages.used, {
            name: invite.redeemedBy?.displayName ?? '',
          })}
        </Badge>
      );
    }
    if (invite.revokedAt) {
      return <Badge>{intl.formatMessage(messages.revoked)}</Badge>;
    }
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return <Badge>{intl.formatMessage(messages.expired)}</Badge>;
    }
    return (
      <Badge badgeType="primary">
        {intl.formatMessage(messages.open, {
          date: intl.formatDate(invite.expiresAt, { dateStyle: 'medium' }),
        })}
      </Badge>
    );
  };

  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="heading">{intl.formatMessage(messages.invites)}</h3>
          <p className="description">
            {intl.formatMessage(messages.invitesDescription)}
          </p>
        </div>
        <Button
          buttonType="primary"
          onClick={() => setIsCreating(true)}
          disabled={!connectedApps.length}
        >
          <PlusIcon />
          <span>{intl.formatMessage(messages.newInvite)}</span>
        </Button>
      </div>
      {!currentSettings.applicationUrl && (
        <div className="mt-4">
          <Alert
            type="warning"
            title={intl.formatMessage(messages.noApplicationUrl)}
          />
        </div>
      )}
      <ul className="mt-6 space-y-3">
        {!invites?.length && (
          <li className="text-sm text-as-ink-faint">
            {intl.formatMessage(messages.none)}
          </li>
        )}
        {invites?.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-as-surface p-4 ring-1 ring-as-line"
          >
            <div className="min-w-0">
              <div className="font-semibold">
                {invite.label ||
                  intl.formatDate(invite.createdAt, { dateStyle: 'medium' })}
              </div>
              <div className="text-sm text-as-ink-muted">
                {(Object.keys(invite.apps) as UserAccessApp[])
                  .map((app) => APP_NAMES[app])
                  .join(', ')}
                {' · '}
                {intl.formatMessage(ageLimitMessage(invite.ageLimit))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {stateOf(invite)}
              {!invite.redeemedAt && !invite.revokedAt && (
                <Button buttonSize="sm" onClick={() => revoke(invite.id)}>
                  {intl.formatMessage(messages.revoke)}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {isCreating && (
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
            title={intl.formatMessage(messages.newInvite)}
            onCancel={() => setIsCreating(false)}
            cancelText={intl.formatMessage(messages.cancel)}
            onOk={() => create()}
            okText={intl.formatMessage(
              isSaving ? messages.creating : messages.create
            )}
            okDisabled={isSaving}
          >
            <div className="form-row">
              <label htmlFor="inviteLabel" className="text-label">
                {intl.formatMessage(messages.label)}
                <span className="label-tip">
                  {intl.formatMessage(messages.labelHelp)}
                </span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <input
                    id="inviteLabel"
                    type="text"
                    maxLength={100}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <span className="text-label">
                {intl.formatMessage(messages.apps)}
              </span>
              <div className="form-input-area space-y-2">
                {connectedApps.map((app) => (
                  <label key={app} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedApps.includes(app)}
                      onChange={(e) =>
                        setSelectedApps((current) =>
                          e.target.checked
                            ? [...current, app]
                            : current.filter((value) => value !== app)
                        )
                      }
                    />
                    {APP_NAMES[app]}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="inviteAgeLimit" className="text-label">
                {intl.formatMessage(messages.ageLimit)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="inviteAgeLimit"
                    value={ageLimit}
                    onChange={(e) => setAgeLimit(e.target.value as AgeLimit)}
                  >
                    {AGE_LIMIT_OPTIONS.map((limit) => (
                      <option key={limit} value={limit}>
                        {intl.formatMessage(ageLimitMessage(limit))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="inviteDays" className="text-label">
                {intl.formatMessage(messages.days)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="inviteDays"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    {[1, 3, 7, 14, 30, 90].map((value) => (
                      <option key={value} value={value}>
                        {intl.formatMessage(messages.daysValue, {
                          days: value,
                        })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </Modal>
        </Transition>
      )}

      {link && (
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
            title={intl.formatMessage(messages.linkTitle)}
            onOk={() => setLink(null)}
            okText={intl.formatMessage(messages.done)}
            backgroundClickable={false}
          >
            <p className="mb-4 text-sm text-as-ink-muted">
              {intl.formatMessage(messages.linkHelp)}
            </p>
            <div className="form-input-field">
              <input type="text" value={link} readOnly />
              <CopyButton textToCopy={link} />
            </div>
          </Modal>
        </Transition>
      )}
    </div>
  );
};

export default Invites;
