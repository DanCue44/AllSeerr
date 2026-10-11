import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowUpCircleIcon,
  CodeBracketIcon,
  ServerIcon,
} from '@heroicons/react/24/outline';
import type { StatusResponse } from '@server/interfaces/api/settingsInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Layout.VersionStatus', {
  appname: 'AllSeerr',
  localbuild: 'Local build',
  outofdate: 'Out of Date',
});

interface VersionStatusProps {
  onClick?: () => void;
}

const VersionStatus = ({ onClick }: VersionStatusProps) => {
  const settings = useSettings();
  const intl = useIntl();
  const { data } = useSWR<StatusResponse>(
    `/api/v1/status?checkUpdateAvailable=${settings.currentSettings.versionCheck}`,
    {
      refreshInterval: 60 * 1000,
    }
  );

  if (!data) {
    return null;
  }

  const commit =
    data.commitTag === 'local'
      ? intl.formatMessage(messages.localbuild)
      : data.commitTag.slice(0, 7);
  // Older builds report develop-<commit> instead of an AllSeerr version, and
  // release builds are tagged with the version itself
  const version = data.version.startsWith('develop-')
    ? commit
    : data.releaseBuild
      ? data.version
      : `${data.version} · ${commit}`;

  return (
    <Link
      href="/settings/about"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onClick) {
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      className={`mx-2 flex items-center rounded-lg p-2 text-xs ring-1 ring-gray-700 transition duration-300 ${
        data.updateAvailable
          ? 'bg-yellow-500 text-white hover:bg-yellow-400'
          : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
      }`}
    >
      {data.commitTag === 'local' ? (
        <CodeBracketIcon className="h-6 w-6" />
      ) : (
        <ServerIcon className="h-6 w-6" />
      )}
      <div className="flex min-w-0 flex-1 flex-col truncate px-2 last:pr-0">
        <span className="font-bold">
          {intl.formatMessage(messages.appname)}
        </span>
        <code className="truncate bg-transparent p-0">{version}</code>
      </div>
      {data.updateAvailable && (
        <ArrowUpCircleIcon
          className="h-6 w-6"
          aria-label={intl.formatMessage(messages.outofdate)}
        />
      )}
    </Link>
  );
};

export default VersionStatus;
