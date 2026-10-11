import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { syncLidarrAvailability } from '@server/lib/scanners/lidarr/availability';
import type { LidarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { requestErrorLogFields } from '@server/utils/requestError';
import { uniqWith } from 'lodash';

type SyncStatus = StatusBase & {
  currentServer: LidarrSettings;
  servers: LidarrSettings[];
};

export type LidarrAlbumState = 'available' | 'processing' | 'skip';

/**
 * An album is available once Lidarr has a file for every track of its
 * selected release. Monitored albums still missing tracks are processing,
 * and unmonitored albums without every track are left alone.
 */
export const getLidarrAlbumState = (album: LidarrAlbum): LidarrAlbumState => {
  const { trackFileCount = 0, trackCount = 0 } = album.statistics ?? {};

  if (trackCount > 0 && trackFileCount >= trackCount) {
    return 'available';
  }

  return album.monitored ? 'processing' : 'skip';
};

class LidarrScanner
  extends BaseScanner<LidarrAlbum>
  implements RunnableScanner<SyncStatus>
{
  private servers: LidarrSettings[];
  private currentServer: LidarrSettings;
  private lidarrApi: LidarrAPI;

  constructor() {
    super('Lidarr Scan', {
      bundleSize: 50,
      jobId: 'lidarr-scan',
      service: 'lidarr',
    });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      currentServer: this.currentServer,
      servers: this.servers,
    };
  }

  public async run(): Promise<void> {
    const settings = getSettings();
    const sessionId = this.startRun();

    try {
      this.servers = uniqWith(settings.lidarr, (lidarrA, lidarrB) => {
        return (
          lidarrA.hostname === lidarrB.hostname &&
          lidarrA.port === lidarrB.port &&
          lidarrA.baseUrl === lidarrB.baseUrl
        );
      });

      for (const server of this.servers) {
        this.currentServer = server;
        if (server.syncEnabled) {
          this.log(
            `Beginning to process Lidarr server: ${server.name}`,
            'info'
          );

          this.lidarrApi = new LidarrAPI({
            apiKey: server.apiKey,
            url: LidarrAPI.buildUrl(server, '/api/v1'),
          });

          this.items = await this.lidarrApi.getAlbums();
          await this.loop(this.processLidarrAlbum.bind(this), { sessionId });

          // Resets albums Lidarr no longer has, for albums linked to any
          // entry of this server
          this.checkSession(sessionId);
          await syncLidarrAvailability(
            this.lidarrApi,
            settings.lidarr
              .filter(
                (other) =>
                  other.hostname === server.hostname &&
                  other.port === server.port &&
                  other.baseUrl === server.baseUrl
              )
              .map((other) => other.id),
            this.items,
            () => this.running && this.sessionId === sessionId
          );
        } else {
          this.log(`Sync not enabled. Skipping Lidarr server: ${server.name}`);
        }
      }

      this.log('Lidarr scan complete', 'info');
      this.scanSucceeded();
    } catch (e) {
      this.scanFailed(e);
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processLidarrAlbum(lidarrAlbum: LidarrAlbum): Promise<void> {
    try {
      const state = getLidarrAlbumState(lidarrAlbum);

      if (state === 'skip') {
        return;
      }

      if (!lidarrAlbum.foreignAlbumId) {
        this.log(
          'No MusicBrainz ID found for this title. Skipping item.',
          'debug',
          { title: lidarrAlbum.title }
        );
        return;
      }

      await this.processMusic(lidarrAlbum.foreignAlbumId, {
        serviceId: this.currentServer.id,
        externalServiceId: lidarrAlbum.id,
        externalServiceSlug: lidarrAlbum.foreignAlbumId,
        title: lidarrAlbum.title,
        processing: state === 'processing',
      });
    } catch (e) {
      this.log('Failed to process Lidarr media', 'error', {
        ...requestErrorLogFields(e),
        title: lidarrAlbum.title,
      });
    }
  }
}

export const lidarrScanner = new LidarrScanner();
