import { MediaServerType } from '@server/constants/server';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import type { JobId } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

// Scans that fail this many times in a row raise an admin alert
export const SCAN_FAILURE_THRESHOLD = 3;

export type ScanService =
  | 'plex'
  | 'jellyfin'
  | 'sonarr'
  | 'radarr'
  | 'lidarr'
  | 'chaptarr'
  | 'lazylibrarian';

export const SCAN_SERVICE_NAMES: Record<ScanService, string> = {
  plex: 'Plex',
  jellyfin: 'Jellyfin',
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  lidarr: 'Lidarr',
  chaptarr: 'Chaptarr',
  lazylibrarian: 'LazyLibrarian',
};

// Emby servers run through the Jellyfin scanner
export const scanServiceName = (service: ScanService): string =>
  service === 'jellyfin' &&
  getSettings().main.mediaServerType === MediaServerType.EMBY
    ? 'Emby'
    : SCAN_SERVICE_NAMES[service];

// The settings page that fixes each service
export const SCAN_SERVICE_PATHS: Record<ScanService, string> = {
  plex: '/settings/plex',
  jellyfin: '/settings/jellyfin',
  sonarr: '/settings/services',
  radarr: '/settings/services',
  lidarr: '/settings/services',
  chaptarr: '/settings/services',
  lazylibrarian: '/settings/services',
};

export interface JobHealth {
  service: ScanService;
  lastSuccess?: Date;
  lastError?: string;
  lastErrorAt?: Date;
  consecutiveFailures: number;
}

export interface ScanAlert {
  service: ScanService;
  jobId: JobId;
  reason: string;
  lastSuccess?: Date;
  consecutiveFailures: number;
}

export type ScanNotifier = (
  kind: 'failing' | 'recovered',
  payload: Pick<
    NotificationPayload,
    'event' | 'subject' | 'message' | 'actionPath' | 'extra'
  >
) => void;

const formatTime = (date?: Date) =>
  date ? date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never';

/**
 * Remembers how each scan job went. Only the job runs since the server
 * started are known, which is enough to notice a scan that keeps failing.
 */
export class ScanHealth {
  private jobs = new Map<JobId, JobHealth>();
  // Services an admin was told about, until they recover
  private notified = new Set<ScanService>();

  public constructor(private notify?: ScanNotifier) {}

  public setNotifier(notify: ScanNotifier): void {
    this.notify = notify;
  }

  public get(jobId: JobId): JobHealth | undefined {
    return this.jobs.get(jobId);
  }

  public recordSuccess(
    jobId: JobId,
    service: ScanService,
    now = new Date()
  ): void {
    const health = this.entry(jobId, service);
    health.consecutiveFailures = 0;
    health.lastSuccess = now;

    if (this.notified.has(service) && !this.isServiceFailing(service)) {
      this.notified.delete(service);
      const name = scanServiceName(service);
      logger.info(`${name} scans recovered`, { label: 'Scan Health' });
      this.notify?.('recovered', {
        event: 'Scans Recovered',
        subject: `${name} scans are working again`,
        message: `${name} scans completed successfully after failing.`,
        actionPath: SCAN_SERVICE_PATHS[service],
      });
    }
  }

  public recordFailure(
    jobId: JobId,
    service: ScanService,
    reason: string,
    now = new Date()
  ): void {
    const health = this.entry(jobId, service);
    health.consecutiveFailures += 1;
    health.lastError = reason;
    health.lastErrorAt = now;

    if (
      health.consecutiveFailures >= SCAN_FAILURE_THRESHOLD &&
      !this.notified.has(service)
    ) {
      this.notified.add(service);
      const name = scanServiceName(service);
      logger.warn(
        `${name} scans failed ${health.consecutiveFailures} times in a row`,
        { label: 'Scan Health', jobId, errorMessage: reason }
      );
      this.notify?.('failing', {
        event: 'Scans Failing',
        subject: `${name} scans are failing`,
        message: `${name} scans are failing: ${reason}. Last success: ${formatTime(
          health.lastSuccess
        )}.`,
        actionPath: SCAN_SERVICE_PATHS[service],
        extra: [
          {
            name: 'Failures in a Row',
            value: String(health.consecutiveFailures),
          },
        ],
      });
    }
  }

  public isServiceFailing(service: ScanService): boolean {
    return [...this.jobs.values()].some(
      (health) =>
        health.service === service &&
        health.consecutiveFailures >= SCAN_FAILURE_THRESHOLD
    );
  }

  public alerts(): ScanAlert[] {
    const alerts: ScanAlert[] = [];

    this.jobs.forEach((health, jobId) => {
      if (health.consecutiveFailures < SCAN_FAILURE_THRESHOLD) {
        return;
      }

      // One alert per service, from its job that failed most
      const existing = alerts.find((alert) => alert.service === health.service);

      if (
        existing &&
        existing.consecutiveFailures >= health.consecutiveFailures
      ) {
        return;
      }

      const alert: ScanAlert = {
        service: health.service,
        jobId,
        reason: health.lastError ?? 'Unknown error',
        lastSuccess: this.lastServiceSuccess(health.service),
        consecutiveFailures: health.consecutiveFailures,
      };

      if (existing) {
        alerts.splice(alerts.indexOf(existing), 1, alert);
      } else {
        alerts.push(alert);
      }
    });

    return alerts;
  }

  public reset(): void {
    this.jobs.clear();
    this.notified.clear();
  }

  private lastServiceSuccess(service: ScanService): Date | undefined {
    return [...this.jobs.values()]
      .filter((health) => health.service === service && health.lastSuccess)
      .map((health) => health.lastSuccess as Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
  }

  private entry(jobId: JobId, service: ScanService): JobHealth {
    let health = this.jobs.get(jobId);

    if (!health) {
      health = { service, consecutiveFailures: 0 };
      this.jobs.set(jobId, health);
    }

    return health;
  }
}

// Admins hear about it once when a service starts failing, and once more when
// it recovers
const sendScanNotification: ScanNotifier = (_kind, payload) => {
  notificationManager.sendNotification(Notification.SCAN_FAILURE, {
    ...payload,
    notifySystem: true,
    notifyAdmin: true,
  });
};

const scanHealth = new ScanHealth(sendScanNotification);

export default scanHealth;
