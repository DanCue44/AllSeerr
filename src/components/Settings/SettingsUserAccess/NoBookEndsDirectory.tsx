import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import type { NoBookEndsDirectoryStatus } from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.NoBookEndsDirectory',
  {
    title: 'NoBookEnds directory',
    enable: 'List this server in the NoBookEnds directory',
    description:
      'People who sign in to NoBookEnds with Plex find this Allseerr without typing its address. Shares the Application URL and a one-way code for your Plex server, nothing else.',
    needsApplicationUrl:
      'Set the Application URL in the General settings first.',
    needsPlex: 'Set up Plex first.',
    registered:
      'Listed {count, plural, one {# Plex server} other {# Plex servers}} {date}.',
    failed: 'Could not update the listing {date}: {error}',
    saveFailure: 'Something went wrong: {message}',
  }
);

const dateFormat = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
} as const;

/**
 * Lists this server in the NoBookEnds directory, so people signing in to
 * the app with Plex find it
 */
const NoBookEndsDirectory = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isBusy, setIsBusy] = useState(false);
  const { data, mutate } = useSWR<NoBookEndsDirectoryStatus>(
    '/api/v1/settings/user-access/nobookends-directory'
  );

  if (!data) {
    return null;
  }

  const missing = data.applicationUrlMissing
    ? messages.needsApplicationUrl
    : data.plexMissing
      ? messages.needsPlex
      : null;
  const result = data.lastResult;

  const save = async (enabled: boolean) => {
    setIsBusy(true);
    try {
      const response = await axios.post<NoBookEndsDirectoryStatus>(
        '/api/v1/settings/user-access/nobookends-directory',
        { enabled }
      );
      mutate(response.data, { revalidate: false });
    } catch (e) {
      addToast(
        intl.formatMessage(messages.saveFailure, {
          message: e.response?.data?.message ?? e.message,
        }),
        { autoDismiss: true, appearance: 'error' }
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mb-10">
      <h3 className="heading">{intl.formatMessage(messages.title)}</h3>
      <div className="form-row">
        <label htmlFor="nobookendsDirectory" className="checkbox-label">
          {intl.formatMessage(messages.enable)}
          <span className="label-tip">
            {intl.formatMessage(messages.description)}
          </span>
          {missing && !data.enabled && (
            <span className="label-tip">{intl.formatMessage(missing)}</span>
          )}
        </label>
        <div className="form-input-area">
          <input
            type="checkbox"
            id="nobookendsDirectory"
            checked={data.enabled}
            disabled={isBusy || (!data.enabled && !!missing)}
            onChange={(e) => save(e.target.checked)}
          />
          {result && (
            <p
              className={`mt-2 text-sm ${
                result.error ? 'text-red-400' : 'text-as-ink-muted'
              }`}
              data-testid="nobookends-directory-result"
            >
              {result.error
                ? intl.formatMessage(messages.failed, {
                    date: intl.formatDate(result.date, dateFormat),
                    error: result.error,
                  })
                : intl.formatMessage(messages.registered, {
                    count: result.registered ?? 0,
                    date: intl.formatDate(result.date, dateFormat),
                  })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoBookEndsDirectory;
