import InfinityIcon from '@app/assets/infinity.svg';
import { SmallLoadingSpinner } from '@app/components/Common/LoadingSpinner';
import ProgressCircle from '@app/components/Common/ProgressCircle';
import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import type {
  QuotaResponse,
  QuotaStatus,
} from '@server/interfaces/api/userInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Layout.UserDropdown.MiniQuotaDisplay',
  {
    movierequests: 'Movie Requests',
    seriesrequests: 'Series Requests',
    musicrequests: 'Music Requests',
    bookrequests: 'Book Requests',
    unlimited: 'Unlimited',
  }
);

type MiniQuotaDisplayProps = {
  userId: number;
};

const QuotaItem = ({
  label,
  quota,
}: {
  label: string;
  quota?: QuotaStatus;
}) => {
  const intl = useIntl();

  return (
    <div className="flex min-w-0 flex-col space-y-2">
      <div className="truncate text-sm text-gray-200">{label}</div>
      <div className="flex h-full items-center space-x-2 text-gray-200">
        {(quota?.limit ?? 0) > 0 ? (
          <>
            <ProgressCircle
              className="h-8 w-8 flex-shrink-0"
              progress={Math.round(
                ((quota?.remaining ?? 0) / (quota?.limit ?? 1)) * 100
              )}
              useHeatLevel
            />
            <span className="text-lg font-bold">
              {quota?.remaining} / {quota?.limit}
            </span>
          </>
        ) : (
          <>
            <InfinityIcon className="w-7 flex-shrink-0" />
            <span className="truncate font-bold">
              {intl.formatMessage(messages.unlimited)}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

const MiniQuotaDisplay = ({ userId }: MiniQuotaDisplayProps) => {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const { data, error } = useSWR<QuotaResponse>(`/api/v1/user/${userId}/quota`);

  if (error) {
    return null;
  }

  if (!data && !error) {
    return <SmallLoadingSpinner />;
  }

  // Music and books only count when Lidarr or a book service is set up
  const items = [
    { key: 'movie', label: messages.movierequests, quota: data?.movie },
    { key: 'tv', label: messages.seriesrequests, quota: data?.tv },
    ...(currentSettings.musicEnabled
      ? [{ key: 'music', label: messages.musicrequests, quota: data?.music }]
      : []),
    ...(currentSettings.booksEnabled
      ? [{ key: 'book', label: messages.bookrequests, quota: data?.book }]
      : []),
  ];

  // Nothing to show when every request type is unlimited
  if (!items.some((item) => (item.quota?.limit ?? 0) !== 0)) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-3">
      {items.map((item) => (
        <QuotaItem
          key={item.key}
          label={intl.formatMessage(item.label)}
          quota={item.quota}
        />
      ))}
    </div>
  );
};

export default MiniQuotaDisplay;
