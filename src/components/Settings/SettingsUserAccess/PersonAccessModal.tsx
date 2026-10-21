import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import Modal from '@app/components/Common/Modal';
import {
  AGE_LIMIT_OPTIONS,
  APPS,
  APP_NAMES,
  ageLimitMessage,
  commonMessages,
} from '@app/components/Settings/SettingsUserAccess/common';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type { UserAccessApp } from '@server/constants/userAccess';
import type {
  AgeLimit,
  NewPasswords,
  PersonAccess,
  PersonUpdateResult,
  UserAccessAppInfo,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.PersonAccessModal',
  {
    title: 'Access for {name}',
    ageLimit: 'Age limit',
    ageLimitHelp:
      'Passed on to every app that can limit content by age. Admins are never limited.',
    includeUnrated: 'Show content without an age rating',
    includeUnratedHelp:
      'Under a limit, comics and books without a rating are hidden unless this is on',
    access: 'Can use {app}',
    notConnected: 'Connect {app} first',
    libraries: 'Libraries',
    lastError: 'Last sync: {error}',
    resetPassword: 'New password',
    removeAccount: 'Delete account',
    removeConfirm: 'Also deletes their reading progress. Sure?',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    saveFailure: 'Something went wrong while saving access.',
    actionFailure: 'Something went wrong: {message}',
    adminNote:
      '{name} is an Allseerr admin: they can sign in to every app with Allseerr, and app admin accounts are never changed.',
  }
);

interface PersonAccessModalProps {
  person: PersonAccess;
  apps: UserAccessAppInfo[];
  onClose: () => void;
  onSaved: (person: PersonAccess, passwords: NewPasswords) => void;
}

type AppDraft = Record<
  UserAccessApp,
  { enabled: boolean; libraryIds: string[] | null }
>;

const PersonAccessModal = ({
  person,
  apps,
  onClose,
  onSaved,
}: PersonAccessModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [ageLimit, setAgeLimit] = useState<AgeLimit>(person.ageLimit ?? 'none');
  const [includeUnrated, setIncludeUnrated] = useState(person.includeUnrated);
  const [draft, setDraft] = useState<AppDraft>(
    Object.fromEntries(
      APPS.map((app) => [
        app,
        {
          enabled: person.apps[app].enabled,
          libraryIds: person.apps[app].libraryIds,
        },
      ])
    ) as AppDraft
  );
  const [isSaving, setIsSaving] = useState(false);
  const [busyApp, setBusyApp] = useState<UserAccessApp | null>(null);

  const appInfo = (app: UserAccessApp) => apps.find((a) => a.app === app);

  const setApp = (
    app: UserAccessApp,
    change: Partial<AppDraft[UserAccessApp]>
  ) =>
    setDraft((current) => ({
      ...current,
      [app]: { ...current[app], ...change },
    }));

  const toggleLibrary = (app: UserAccessApp, id: string) => {
    const all = (appInfo(app)?.libraries ?? []).map((library) => library.id);
    const current = draft[app].libraryIds ?? all;
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];

    // Every library ticked is the same as all of them, new ones included
    setApp(app, {
      libraryIds:
        next.length && all.every((value) => next.includes(value)) ? null : next,
    });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const response = await axios.post<PersonUpdateResult>(
        `/api/v1/user-access/people/${person.userId}`,
        { ageLimit, includeUnrated, apps: draft }
      );
      onSaved(response.data.person, response.data.passwords);
    } catch {
      addToast(intl.formatMessage(messages.saveFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetPassword = async (app: UserAccessApp) => {
    setBusyApp(app);
    try {
      const response = await axios.post<{
        username: string;
        password: string;
        emailed: boolean;
      }>(`/api/v1/user-access/people/${person.userId}/apps/${app}/password`);
      onSaved(person, { [app]: response.data });
    } catch (e) {
      addToast(
        intl.formatMessage(messages.actionFailure, {
          message: e.response?.data?.message ?? e.message,
        }),
        { autoDismiss: true, appearance: 'error' }
      );
    } finally {
      setBusyApp(null);
    }
  };

  const removeAccount = async (app: UserAccessApp) => {
    setBusyApp(app);
    try {
      const response = await axios.delete<PersonAccess>(
        `/api/v1/user-access/people/${person.userId}/apps/${app}`
      );
      onSaved(response.data, {});
    } catch (e) {
      addToast(
        intl.formatMessage(messages.actionFailure, {
          message: e.response?.data?.message ?? e.message,
        }),
        { autoDismiss: true, appearance: 'error' }
      );
    } finally {
      setBusyApp(null);
    }
  };

  return (
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
        title={intl.formatMessage(messages.title, { name: person.displayName })}
        onCancel={onClose}
        cancelText={intl.formatMessage(messages.cancel)}
        onOk={() => save()}
        okText={intl.formatMessage(isSaving ? messages.saving : messages.save)}
        okDisabled={isSaving || !!busyApp}
      >
        {person.isAdmin && (
          <Alert
            type="info"
            title={intl.formatMessage(messages.adminNote, {
              name: person.displayName,
            })}
          />
        )}
        {!person.isAdmin && (
          <>
            <div className="form-row">
              <label htmlFor="ageLimit" className="text-label">
                {intl.formatMessage(messages.ageLimit)}
                <span className="label-tip">
                  {intl.formatMessage(messages.ageLimitHelp)}
                </span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="ageLimit"
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
            {ageLimit !== 'none' && (
              <div className="form-row">
                <label htmlFor="includeUnrated" className="checkbox-label">
                  {intl.formatMessage(messages.includeUnrated)}
                  <span className="label-tip">
                    {intl.formatMessage(messages.includeUnratedHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <input
                    type="checkbox"
                    id="includeUnrated"
                    checked={includeUnrated}
                    onChange={(e) => setIncludeUnrated(e.target.checked)}
                  />
                </div>
              </div>
            )}
          </>
        )}
        <div className="mt-6 space-y-4">
          {APPS.map((app) => {
            const info = appInfo(app);
            const access = person.apps[app];
            const libraries = info?.libraries ?? [];
            const selected = draft[app].libraryIds;
            const hasAccount = access.status !== 'none';

            return (
              <div key={app} className="rounded-xl p-4 ring-1 ring-as-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={draft[app].enabled}
                      disabled={!info?.connected}
                      onChange={(e) =>
                        setApp(app, { enabled: e.target.checked })
                      }
                    />
                    {intl.formatMessage(messages.access, {
                      app: APP_NAMES[app],
                    })}
                  </label>
                  <div className="flex items-center gap-2">
                    {access.remoteUsername && (
                      <code className="text-sm text-as-ink-muted">
                        {access.remoteUsername}
                      </code>
                    )}
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
                  </div>
                </div>
                {!info?.connected && (
                  <p className="mt-2 text-sm text-as-ink-faint">
                    {intl.formatMessage(messages.notConnected, {
                      app: APP_NAMES[app],
                    })}
                  </p>
                )}
                {access.status === 'error' && access.lastError && (
                  <p className="mt-2 text-sm text-red-400">
                    {intl.formatMessage(messages.lastError, {
                      error: access.lastError,
                    })}
                  </p>
                )}
                {draft[app].enabled && libraries.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-sm text-as-ink-muted">
                      {intl.formatMessage(messages.libraries)}
                      {selected === null &&
                        ` (${intl.formatMessage(commonMessages.allLibraries)})`}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {libraries.map((library) => (
                        <label
                          key={library.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={
                              selected === null || selected.includes(library.id)
                            }
                            onChange={() => toggleLibrary(app, library.id)}
                          />
                          {library.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {hasAccount && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      buttonSize="sm"
                      onClick={() => resetPassword(app)}
                      disabled={!!busyApp}
                    >
                      {intl.formatMessage(messages.resetPassword)}
                    </Button>
                    <ConfirmButton
                      onClick={() => removeAccount(app)}
                      confirmText={intl.formatMessage(messages.removeConfirm)}
                    >
                      {intl.formatMessage(messages.removeAccount)}
                    </ConfirmButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </Transition>
  );
};

export default PersonAccessModal;
