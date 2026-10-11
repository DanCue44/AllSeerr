import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import CopyButton from '@app/components/Settings/CopyButton';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { KeyIcon, TrashIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserApiKey',
  {
    apikey: 'API Key',
    apikeyDescription:
      'A personal API key lets apps and scripts act as you. Send it in the X-Api-Key header. It has the same permissions as your account.',
    noApiKey: 'You do not have a personal API key.',
    noApiKeyOther: 'This user does not have a personal API key.',
    createdAt: 'Created {date}',
    generate: 'Generate API Key',
    regenerate: 'Regenerate API Key',
    revoke: 'Revoke API Key',
    copyNow:
      'Copy this key now. It will not be shown again, and regenerating it replaces the old key.',
    apikeyCopied: 'Copied API key to clipboard.',
    generateError: 'Something went wrong while generating the API key.',
    revokeSuccess: 'API key revoked.',
    revokeError: 'Something went wrong while revoking the API key.',
  }
);

interface ApiKeyStatus {
  hasApiKey: boolean;
  createdAt?: string | null;
}

const UserApiKey = () => {
  const intl = useIntl();
  const router = useRouter();
  const { addToast } = useToasts();
  const { user: currentUser } = useUser();
  const { user } = useUser({ id: Number(router.query.userId) });
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { data, mutate } = useSWR<ApiKeyStatus>(
    user ? `/api/v1/user/${user.id}/settings/api-key` : null
  );

  const isOwnProfile = currentUser?.id === user?.id;

  const generate = async () => {
    setIsUpdating(true);
    try {
      const response = await axios.post<{ apiKey: string }>(
        `/api/v1/user/${user?.id}/settings/api-key`
      );
      setNewKey(response.data.apiKey);
      mutate();
    } catch {
      addToast(intl.formatMessage(messages.generateError), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const revoke = async () => {
    setIsUpdating(true);
    try {
      await axios.delete(`/api/v1/user/${user?.id}/settings/api-key`);
      setNewKey(null);
      mutate();
      addToast(intl.formatMessage(messages.revokeSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.revokeError), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!data || !user) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.apikey),
          intl.formatMessage(globalMessages.usersettings),
          user.displayName,
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.apikey)}</h3>
        <p className="mt-1 text-sm text-gray-400">
          {intl.formatMessage(messages.apikeyDescription)}
        </p>
      </div>
      <div className="section">
        {newKey && (
          <>
            <Alert title={intl.formatMessage(messages.copyNow)} type="info" />
            <div className="form-input-field mb-6">
              <input
                type="text"
                id="apiKey"
                className="rounded-l-only font-mono"
                value={newKey}
                readOnly
              />
              <CopyButton
                textToCopy={newKey}
                toastMessage={intl.formatMessage(messages.apikeyCopied)}
                key={newKey}
              />
            </div>
          </>
        )}
        {!newKey && (
          <p className="mb-6 text-sm text-gray-300">
            {data.hasApiKey && data.createdAt
              ? intl.formatMessage(messages.createdAt, {
                  date: intl.formatDate(data.createdAt, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                })
              : isOwnProfile
                ? intl.formatMessage(messages.noApiKey)
                : intl.formatMessage(messages.noApiKeyOther)}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {isOwnProfile && (
            <Button
              buttonType="primary"
              onClick={() => generate()}
              disabled={isUpdating}
            >
              <KeyIcon />
              <span>
                {data.hasApiKey
                  ? intl.formatMessage(messages.regenerate)
                  : intl.formatMessage(messages.generate)}
              </span>
            </Button>
          )}
          {data.hasApiKey && (
            <Button
              buttonType="danger"
              onClick={() => revoke()}
              disabled={isUpdating}
            >
              <TrashIcon />
              <span>{intl.formatMessage(messages.revoke)}</span>
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default UserApiKey;
