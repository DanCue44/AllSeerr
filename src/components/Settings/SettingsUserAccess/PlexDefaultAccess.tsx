import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import {
  AGE_LIMIT_OPTIONS,
  APPS,
  APP_NAMES,
  ageLimitMessage,
  commonMessages,
} from '@app/components/Settings/SettingsUserAccess/common';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import type { UserAccessApp } from '@server/constants/userAccess';
import type {
  AgeLimit,
  PlexDefaultAccessResponse,
  PlexDefaultChange,
  UserAccessAppInfo,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate as mutateGlobal } from 'swr';

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.PlexDefaultAccess',
  {
    plexDefault: 'Everyone with access to my Plex server',
    plexDefaultDescription:
      'Gives these apps to everyone your Plex server is shared with, including people who sign in or are imported later. Someone removed from your Plex server loses them again. A choice you make for one person always wins.',
    turnOn: 'Give these apps to everyone with access to my Plex server',
    access: 'Give {app}',
    libraries: 'Libraries',
    ageLimit: 'Age limit',
    ageLimitHelp:
      'Only for people with no age limit of their own. Admins are never limited.',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Default access saved.',
    saveFailure: 'Something went wrong while saving the default access.',
    applyNow: 'Apply to everyone now',
    applying: 'Applying…',
    applyFailure: 'Something went wrong while applying the default access.',
    noChanges: 'Everyone already has the right access.',
    changes: 'Changes',
    granted: '{name} got {app}',
    removed: '{name} lost {app}',
    accountsNote:
      'Accounts in the apps are linked when one already exists. With sign in with Allseerr turned on, the app makes the account the first time the person signs in.',
  }
);

interface PlexDefaultAccessProps {
  apps: UserAccessAppInfo[];
}

/**
 * The apps everyone the Plex server is shared with gets without being picked
 * one by one
 */
const PlexDefaultAccess = ({ apps }: PlexDefaultAccessProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { data, mutate } = useSWR<PlexDefaultAccessResponse>(
    '/api/v1/settings/user-access/plex-default'
  );
  const [draft, setDraft] = useState<PlexDefaultAccessResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [changes, setChanges] = useState<PlexDefaultChange[] | null>(null);

  useEffect(() => {
    if (data) {
      setDraft(data);
    }
  }, [data]);

  if (!draft) {
    return <LoadingSpinner />;
  }

  const appInfo = (app: UserAccessApp) => apps.find((a) => a.app === app);

  const setApp = (
    app: UserAccessApp,
    change: Partial<PlexDefaultAccessResponse['apps'][UserAccessApp]>
  ) =>
    setDraft({
      ...draft,
      apps: { ...draft.apps, [app]: { ...draft.apps[app], ...change } },
    });

  const toggleLibrary = (app: UserAccessApp, libraryId: string) => {
    const all = (appInfo(app)?.libraries ?? []).map((library) => library.id);
    const current = draft.apps[app].libraryIds ?? all;
    const next = current.includes(libraryId)
      ? current.filter((id) => id !== libraryId)
      : [...current, libraryId];

    setApp(app, {
      libraryIds: next.length === all.length ? null : next,
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await axios.post<PlexDefaultAccessResponse>(
        '/api/v1/settings/user-access/plex-default',
        draft
      );
      mutate(response.data, false);
      addToast(intl.formatMessage(messages.saved), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch {
      addToast(intl.formatMessage(messages.saveFailure), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const applyNow = async () => {
    setApplying(true);
    try {
      const response = await axios.post<{ changes: PlexDefaultChange[] }>(
        '/api/v1/settings/user-access/plex-default/apply'
      );
      setChanges(response.data.changes);
      mutateGlobal('/api/v1/user-access/people');
    } catch {
      addToast(intl.formatMessage(messages.applyFailure), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setApplying(false);
    }
  };

  const unsaved = JSON.stringify(draft) !== JSON.stringify(data);

  return (
    <div className="mb-10">
      <h3 className="heading">{intl.formatMessage(messages.plexDefault)}</h3>
      <p className="description">
        {intl.formatMessage(messages.plexDefaultDescription)}
      </p>
      <div className="form-row">
        <label htmlFor="plexDefaultEnabled" className="checkbox-label">
          {intl.formatMessage(messages.turnOn)}
        </label>
        <div className="form-input-area">
          <input
            type="checkbox"
            id="plexDefaultEnabled"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
        </div>
      </div>
      {draft.enabled && (
        <>
          <div className="form-row">
            <label htmlFor="plexDefaultAgeLimit" className="text-label">
              {intl.formatMessage(messages.ageLimit)}
              <span className="label-tip">
                {intl.formatMessage(messages.ageLimitHelp)}
              </span>
            </label>
            <div className="form-input-area">
              <div className="form-input-field">
                <select
                  id="plexDefaultAgeLimit"
                  value={draft.ageLimit ?? 'none'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ageLimit:
                        e.target.value === 'none'
                          ? null
                          : (e.target.value as AgeLimit),
                    })
                  }
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
          <div className="mt-6 space-y-4">
            {APPS.map((app) => {
              const info = appInfo(app);
              const libraries = info?.libraries ?? [];
              const selected = draft.apps[app].libraryIds;

              return (
                <div key={app} className="rounded-xl p-4 ring-1 ring-as-line">
                  <label className="flex items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={draft.apps[app].enabled}
                      onChange={(e) =>
                        setApp(app, { enabled: e.target.checked })
                      }
                    />
                    {intl.formatMessage(messages.access, {
                      app: APP_NAMES[app],
                    })}
                  </label>
                  {draft.apps[app].enabled && libraries.length > 0 && (
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
                                selected === null ||
                                selected.includes(library.id)
                              }
                              onChange={() => toggleLibrary(app, library.id)}
                            />
                            {library.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-as-ink-faint">
            {intl.formatMessage(messages.accountsNote)}
          </p>
        </>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          buttonType="primary"
          disabled={saving || !unsaved}
          onClick={() => save()}
        >
          {intl.formatMessage(saving ? messages.saving : messages.save)}
        </Button>
        <Button
          disabled={applying || unsaved || !data?.enabled}
          onClick={() => applyNow()}
        >
          {intl.formatMessage(applying ? messages.applying : messages.applyNow)}
        </Button>
      </div>
      {changes && (
        <div className="mt-4 rounded-xl p-4 ring-1 ring-as-line">
          {changes.length === 0 ? (
            <p className="text-sm">{intl.formatMessage(messages.noChanges)}</p>
          ) : (
            <>
              <div className="mb-2 font-semibold">
                {intl.formatMessage(messages.changes)}
              </div>
              <ul className="space-y-1 text-sm">
                {changes.map((change) => (
                  <li key={`${change.userId}-${change.app}`}>
                    {intl.formatMessage(messages[change.change], {
                      name: change.displayName,
                      app: APP_NAMES[change.app],
                    })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PlexDefaultAccess;
