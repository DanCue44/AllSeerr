import type {
  ChaptarrMediaType,
  ChaptarrQueueItem,
} from '@server/api/servarr/chaptarr';
import ChaptarrAPI from '@server/api/servarr/chaptarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { uniqWith } from 'lodash';

interface EpisodeNumberResult {
  seasonNumber: number;
  episodeNumber: number;
  absoluteEpisodeNumber: number;
  id: number;
}
export interface DownloadingItem {
  mediaType: MediaType;
  externalId: number;
  size: number;
  sizeLeft: number;
  status: string;
  timeLeft: string;
  estimatedCompletionTime: Date;
  title: string;
  downloadId: string;
  episode?: EpisodeNumberResult;
  // Books only: the format being downloaded, when Chaptarr says
  bookFormat?: ChaptarrMediaType;
}

/**
 * Maps Chaptarr's queue to downloads keyed on the Chaptarr book id. Every
 * Chaptarr book is one format, so the id alone matches a download to the
 * ebook or the audiobook of a book; the format of the queued book is kept
 * for servers that use one book for both. Downloads of no known book are
 * left out.
 */
export const mapChaptarrQueue = (
  items: ChaptarrQueueItem[]
): DownloadingItem[] =>
  items
    .filter((item) => !!item.bookId)
    .map((item) => ({
      externalId: item.bookId as number,
      estimatedCompletionTime: new Date(item.estimatedCompletionTime ?? ''),
      mediaType: MediaType.BOOK,
      size: item.size,
      sizeLeft: item.sizeleft,
      status: item.status,
      timeLeft: item.timeleft ?? '',
      title: item.title,
      downloadId: item.downloadId ?? String(item.id),
      bookFormat: item.book?.mediaType,
    }));

class DownloadTracker {
  private radarrServers: Record<number, DownloadingItem[]> = {};
  private sonarrServers: Record<number, DownloadingItem[]> = {};
  private lidarrServers: Record<number, DownloadingItem[]> = {};
  private chaptarrServers: Record<number, DownloadingItem[]> = {};

  public getMovieProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    if (!this.radarrServers[serverId]) {
      return [];
    }

    return this.radarrServers[serverId].filter(
      (item) => item.externalId === externalServiceId
    );
  }

  public getSeriesProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    if (!this.sonarrServers[serverId]) {
      return [];
    }

    return this.sonarrServers[serverId].filter(
      (item) => item.externalId === externalServiceId
    );
  }

  public getMusicProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    if (!this.lidarrServers[serverId]) {
      return [];
    }

    return this.lidarrServers[serverId].filter(
      (item) => item.externalId === externalServiceId
    );
  }

  /**
   * Downloads of one format of a book, by the Chaptarr book id of that
   * format
   */
  public getBookProgress(
    serverId: number,
    externalServiceId: number,
    format: ChaptarrMediaType
  ): DownloadingItem[] {
    if (!this.chaptarrServers[serverId]) {
      return [];
    }

    return this.chaptarrServers[serverId].filter(
      (item) =>
        item.externalId === externalServiceId &&
        (!item.bookFormat || item.bookFormat === format)
    );
  }

  public async resetDownloadTracker() {
    this.radarrServers = {};
    this.sonarrServers = {};
    this.lidarrServers = {};
    this.chaptarrServers = {};
  }

  public updateDownloads() {
    this.updateRadarrDownloads();
    this.updateSonarrDownloads();
    this.updateLidarrDownloads();
    this.updateChaptarrDownloads();
  }

  private async updateRadarrDownloads() {
    const settings = getSettings();

    // Remove duplicate servers
    const filteredServers = uniqWith(settings.radarr, (radarrA, radarrB) => {
      return (
        radarrA.hostname === radarrB.hostname &&
        radarrA.port === radarrB.port &&
        radarrA.baseUrl === radarrB.baseUrl
      );
    });

    // Load downloads from Radarr servers
    Promise.all(
      filteredServers.map(async (server) => {
        if (server.syncEnabled) {
          const radarr = new RadarrAPI({
            apiKey: server.apiKey,
            url: RadarrAPI.buildUrl(server, '/api/v3'),
          });

          try {
            await radarr.refreshMonitoredDownloads();
            const queueItems = await radarr.getQueue();

            this.radarrServers[server.id] = queueItems.map((item) => ({
              externalId: item.movieId,
              estimatedCompletionTime: new Date(item.estimatedCompletionTime),
              mediaType: MediaType.MOVIE,
              size: item.size,
              sizeLeft: item.sizeleft,
              status: item.status,
              timeLeft: item.timeleft,
              title: item.title,
              downloadId: item.downloadId,
            }));

            if (queueItems.length > 0) {
              logger.debug(
                `Found ${queueItems.length} item(s) in progress on Radarr server: ${server.name}`,
                { label: 'Download Tracker' }
              );
            }
          } catch {
            logger.error(
              `Unable to get queue from Radarr server: ${server.name}`,
              {
                label: 'Download Tracker',
              }
            );
          }

          // Duplicate this data to matching servers
          const matchingServers = settings.radarr.filter(
            (rs) =>
              rs.hostname === server.hostname &&
              rs.port === server.port &&
              rs.baseUrl === server.baseUrl &&
              rs.id !== server.id
          );

          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Radarr server(s)`,
              { label: 'Download Tracker' }
            );
          }

          matchingServers.forEach((ms) => {
            if (ms.syncEnabled) {
              this.radarrServers[ms.id] = this.radarrServers[server.id];
            }
          });
        }
      })
    );
  }

  private async updateSonarrDownloads() {
    const settings = getSettings();

    // Remove duplicate servers
    const filteredServers = uniqWith(settings.sonarr, (sonarrA, sonarrB) => {
      return (
        sonarrA.hostname === sonarrB.hostname &&
        sonarrA.port === sonarrB.port &&
        sonarrA.baseUrl === sonarrB.baseUrl
      );
    });

    // Load downloads from Sonarr servers
    Promise.all(
      filteredServers.map(async (server) => {
        if (server.syncEnabled) {
          const sonarr = new SonarrAPI({
            apiKey: server.apiKey,
            url: SonarrAPI.buildUrl(server, '/api/v3'),
          });

          try {
            await sonarr.refreshMonitoredDownloads();
            const queueItems = await sonarr.getQueue();

            this.sonarrServers[server.id] = queueItems.map((item) => ({
              externalId: item.seriesId,
              estimatedCompletionTime: new Date(item.estimatedCompletionTime),
              mediaType: MediaType.TV,
              size: item.size,
              sizeLeft: item.sizeleft,
              status: item.status,
              timeLeft: item.timeleft,
              title: item.title,
              episode: item.episode,
              downloadId: item.downloadId,
            }));

            if (queueItems.length > 0) {
              logger.debug(
                `Found ${queueItems.length} item(s) in progress on Sonarr server: ${server.name}`,
                { label: 'Download Tracker' }
              );
            }
          } catch {
            logger.error(
              `Unable to get queue from Sonarr server: ${server.name}`,
              {
                label: 'Download Tracker',
              }
            );
          }

          // Duplicate this data to matching servers
          const matchingServers = settings.sonarr.filter(
            (ss) =>
              ss.hostname === server.hostname &&
              ss.port === server.port &&
              ss.baseUrl === server.baseUrl &&
              ss.id !== server.id
          );

          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Sonarr server(s)`,
              { label: 'Download Tracker' }
            );
          }

          matchingServers.forEach((ms) => {
            if (ms.syncEnabled) {
              this.sonarrServers[ms.id] = this.sonarrServers[server.id];
            }
          });
        }
      })
    );
  }

  private async updateLidarrDownloads() {
    const settings = getSettings();

    // Remove duplicate servers
    const filteredServers = uniqWith(settings.lidarr, (lidarrA, lidarrB) => {
      return (
        lidarrA.hostname === lidarrB.hostname &&
        lidarrA.port === lidarrB.port &&
        lidarrA.baseUrl === lidarrB.baseUrl
      );
    });

    // Load downloads from Lidarr servers
    Promise.all(
      filteredServers.map(async (server) => {
        if (server.syncEnabled) {
          const lidarr = new LidarrAPI({
            apiKey: server.apiKey,
            url: LidarrAPI.buildUrl(server, '/api/v1'),
          });

          try {
            await lidarr.refreshMonitoredDownloads();
            const queueItems = await lidarr.getQueue();

            this.lidarrServers[server.id] = queueItems.map((item) => ({
              externalId: item.albumId,
              estimatedCompletionTime: new Date(item.estimatedCompletionTime),
              mediaType: MediaType.MUSIC,
              size: item.size,
              sizeLeft: item.sizeleft,
              status: item.status,
              timeLeft: item.timeleft,
              title: item.title,
              downloadId: item.downloadId,
            }));

            if (queueItems.length > 0) {
              logger.debug(
                `Found ${queueItems.length} item(s) in progress on Lidarr server: ${server.name}`,
                { label: 'Download Tracker' }
              );
            }
          } catch {
            logger.error(
              `Unable to get queue from Lidarr server: ${server.name}`,
              {
                label: 'Download Tracker',
              }
            );
          }

          // Duplicate this data to matching servers
          const matchingServers = settings.lidarr.filter(
            (ls) =>
              ls.hostname === server.hostname &&
              ls.port === server.port &&
              ls.baseUrl === server.baseUrl &&
              ls.id !== server.id
          );

          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Lidarr server(s)`,
              { label: 'Download Tracker' }
            );
          }

          matchingServers.forEach((ms) => {
            if (ms.syncEnabled) {
              this.lidarrServers[ms.id] = this.lidarrServers[server.id];
            }
          });
        }
      })
    );
  }

  // Public so tests can wait for it
  public async updateChaptarrDownloads(): Promise<void> {
    const settings = getSettings();

    // Only the service books are sent to has downloads worth showing
    if (settings.bookService !== 'chaptarr') {
      this.chaptarrServers = {};
      return;
    }

    // Remove duplicate servers
    const filteredServers = uniqWith(settings.chaptarr, (a, b) => {
      return (
        a.hostname === b.hostname &&
        a.port === b.port &&
        a.baseUrl === b.baseUrl
      );
    });

    // Load downloads from Chaptarr servers
    await Promise.all(
      filteredServers.map(async (server) => {
        if (server.syncEnabled) {
          const chaptarr = new ChaptarrAPI({
            apiKey: server.apiKey,
            url: ChaptarrAPI.buildUrl(server, '/api/v1'),
          });

          try {
            await chaptarr.refreshMonitoredDownloads();
            const queueItems = await chaptarr.getBookQueue();

            this.chaptarrServers[server.id] = mapChaptarrQueue(queueItems);

            if (queueItems.length > 0) {
              logger.debug(
                `Found ${queueItems.length} item(s) in progress on Chaptarr server: ${server.name}`,
                { label: 'Download Tracker' }
              );
            }
          } catch {
            logger.error(
              `Unable to get queue from Chaptarr server: ${server.name}`,
              {
                label: 'Download Tracker',
              }
            );
          }

          // Duplicate this data to matching servers
          const matchingServers = settings.chaptarr.filter(
            (cs) =>
              cs.hostname === server.hostname &&
              cs.port === server.port &&
              cs.baseUrl === server.baseUrl &&
              cs.id !== server.id
          );

          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Chaptarr server(s)`,
              { label: 'Download Tracker' }
            );
          }

          matchingServers.forEach((ms) => {
            if (ms.syncEnabled) {
              this.chaptarrServers[ms.id] = this.chaptarrServers[server.id];
            }
          });
        }
      })
    );
  }
}

const downloadTracker = new DownloadTracker();

export default downloadTracker;
