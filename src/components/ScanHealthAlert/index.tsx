import Alert from '@app/components/Common/Alert';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.ScanHealthAlert', {
  scansFailing: '{service} scans are failing: {reason}.',
  lastSuccess: 'Last success: {time}',
  lastSuccessNever: 'Last success: none since AllSeerr started',
  openSettings: 'Open {service} settings',
});

interface ScanAlert {
  service: string;
  serviceName: string;
  jobId: string;
  reason: string;
  lastSuccess: string | null;
  consecutiveFailures: number;
  settingsPath: string;
}

// Shown to admins when a scan failed 3 or more times in a row
const ScanHealthAlert = ({ className }: { className?: string }) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const isAdmin = hasPermission(Permission.ADMIN);
  const { data } = useSWR<ScanAlert[]>(
    isAdmin ? '/api/v1/settings/jobs/alerts' : null,
    { refreshInterval: 60000 }
  );

  if (!isAdmin || !data?.length) {
    return null;
  }

  return (
    <div className={className} data-testid="scan-health-alert">
      {data.map((alert) => (
        <Alert
          key={alert.service}
          type="warning"
          title={intl.formatMessage(messages.scansFailing, {
            service: alert.serviceName,
            reason: alert.reason,
          })}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
            <span>
              {alert.lastSuccess
                ? intl.formatMessage(messages.lastSuccess, {
                    time: intl.formatDate(alert.lastSuccess, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })
                : intl.formatMessage(messages.lastSuccessNever)}
            </span>
            <Link
              href={alert.settingsPath}
              className="font-medium underline hover:no-underline"
            >
              {intl.formatMessage(messages.openSettings, {
                service: alert.serviceName,
              })}
            </Link>
          </div>
        </Alert>
      ))}
    </div>
  );
};

export default ScanHealthAlert;
