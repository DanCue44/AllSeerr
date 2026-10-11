import type { RequestedEpisodes } from '@server/lib/episodeRequests';
import logger from '@server/logger';
import type { AxiosResponse } from 'axios';
import type { ServarrHistoryRecord, ServarrRelease } from './base';
import ServarrBase from './base';

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    previousAiring?: string;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}
export interface EpisodeResult {
  seriesId: number;
  episodeFileId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string;
  airDateUtc: string;
  overview: string;
  hasFile: boolean;
  monitored: boolean;
  absoluteEpisodeNumber: number;
  unverifiedSceneNumbering: boolean;
  id: number;
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath?: string;
  path?: string;
  size: number;
  dateAdded: string;
  sceneName?: string;
  releaseGroup?: string;
  languages?: {
    id: number;
    name: string;
  }[];
  quality?: {
    quality: {
      id: number;
      name: string;
      resolution: number;
    };
  };
  mediaInfo?: {
    audioBitrate: number;
    audioChannels: number;
    audioCodec?: string;
    audioLanguages?: string;
    audioStreamCount: number;
    videoBitDepth: number;
    videoBitrate: number;
    videoCodec?: string;
    videoFps: number;
    videoDynamicRange?: string;
    videoDynamicRangeType?: string;
    resolution?: string;
    runTime?: string;
    scanType?: string;
    subtitles?: string;
  };
}

export interface SonarrSeries {
  title: string;
  sortTitle: string;
  seasonCount: number;
  status: string;
  overview: string;
  network: string;
  airTime: string;
  images: {
    coverType: string;
    url: string;
    remoteUrl?: string;
  }[];
  remotePoster: string;
  seasons: SonarrSeason[];
  year: number;
  path: string;
  profileId: number;
  languageProfileId: number;
  seasonFolder: boolean;
  monitored: boolean;
  monitorNewItems: 'all' | 'none';
  useSceneNumbering: boolean;
  runtime: number;
  tvdbId: number;
  tmdbId?: number;
  tvRageId: number;
  tvMazeId: number;
  firstAired: string;
  lastInfoSync?: string;
  seriesType: 'standard' | 'daily' | 'anime';
  cleanTitle: string;
  imdbId: string;
  titleSlug: string;
  certification: string;
  genres: string[];
  tags: number[];
  added: string;
  ratings: {
    votes: number;
    value: number;
  };
  qualityProfileId: number;
  id?: number;
  rootFolderPath?: string;
  addOptions?: {
    monitor?: 'future';
    ignoreEpisodesWithFiles?: boolean;
    ignoreEpisodesWithoutFiles?: boolean;
    searchForMissingEpisodes?: boolean;
  };
  statistics: {
    seasonCount: number;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    releaseGroups: string[];
    percentOfEpisodes: number;
  };
}

export interface AddSeriesOptions {
  tvdbid: number;
  title: string;
  profileId: number;
  languageProfileId?: number;
  seasons: number[];
  seasonFolder: boolean;
  rootFolderPath: string;
  tags?: number[];
  seriesType: SonarrSeries['seriesType'];
  monitored?: boolean;
  monitorNewItems?: SonarrSeries['monitorNewItems'];
  searchNow?: boolean;
  // Seasons where only these episodes are monitored and searched
  episodes?: RequestedEpisodes[];
  // Monitor only the episodes that have not aired yet, without searching
  monitor?: 'future';
  // Monitor seasons Sonarr adds later, also on a series it already has
  monitorNewSeasons?: boolean;
}

const isUnaired = (episode: EpisodeResult, now = new Date()): boolean =>
  !episode.airDateUtc || new Date(episode.airDateUtc) > now;

export interface SonarrCalendarEpisode extends EpisodeResult {
  series?: SonarrSeries;
}

export interface LanguageProfile {
  id: number;
  name: string;
}

class SonarrAPI extends ServarrBase<{
  seriesId: number;
  episodeId: number;
  episode: EpisodeResult;
}> {
  // How long to wait for the episodes of a newly added series
  public static episodeLookupAttempts = 10;
  public static episodeLookupDelay = 3000;

  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, apiName: 'Sonarr', cacheName: 'sonarr' });
  }

  public async getSeries(): Promise<SonarrSeries[]> {
    try {
      const response = await this.axios.get<SonarrSeries[]>('/series');

      return response.data;
    } catch (e) {
      throw new Error(`[Sonarr] Failed to retrieve series: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getCalendar({
    start,
    end,
  }: {
    start: string;
    end: string;
  }): Promise<SonarrCalendarEpisode[]> {
    try {
      const data = await this.get<SonarrCalendarEpisode[]>(
        '/calendar',
        {
          params: { start, end, unmonitored: false, includeSeries: true },
        },
        300
      );

      return data;
    } catch (e) {
      throw new Error(`[Sonarr] Failed to retrieve calendar: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getLibrarySeriesByTvdbId(
    tvdbId: number
  ): Promise<SonarrSeries[]> {
    try {
      const response = await this.axios.get<SonarrSeries[]>('/series', {
        params: { tvdbId },
      });

      return response.data;
    } catch (e) {
      throw new Error(
        `[Sonarr] Failed to retrieve series by TVDB ID: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getSeriesById(id: number): Promise<SonarrSeries> {
    try {
      const response = await this.axios.get<SonarrSeries>(`/series/${id}`);

      return response.data;
    } catch (e) {
      throw new Error(
        `[Sonarr] Failed to retrieve series by ID: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getSeriesByTitle(title: string): Promise<SonarrSeries[]> {
    try {
      const response = await this.axios.get<SonarrSeries[]>('/series/lookup', {
        params: {
          term: title,
        },
      });

      if (!response.data[0]) {
        throw new Error('No series found');
      }

      return response.data;
    } catch (e) {
      logger.error('Error retrieving series by series title', {
        label: 'Sonarr API',
        errorMessage: e.message,
        title,
      });
      throw new Error('No series found', { cause: e });
    }
  }

  public async getSeriesByTvdbId(id: number): Promise<SonarrSeries> {
    let response: AxiosResponse<SonarrSeries[]>;
    try {
      response = await this.axios.get<SonarrSeries[]>('/series/lookup', {
        params: {
          term: `tvdb:${id}`,
        },
      });
    } catch (e) {
      logger.error('Error retrieving series by tvdb ID', {
        label: 'Sonarr API',
        errorMessage: e.message,
        tvdbId: id,
      });
      throw e;
    }

    if (!response.data[0]) {
      throw new Error('Series not found');
    }

    return response.data[0];
  }

  public async addSeries(options: AddSeriesOptions): Promise<SonarrSeries> {
    try {
      const series = await this.getSeriesByTvdbId(options.tvdbid);

      const isFutureOnly = options.monitor === 'future';

      // If the series already exists, we will simply just update it
      if (series.id) {
        series.monitored = options.monitored ?? series.monitored;
        series.tags = options.tags
          ? Array.from(new Set([...series.tags, ...options.tags]))
          : series.tags;
        // A future only request monitors episodes one by one below, as a season
        // that is still airing would also monitor the episodes that have aired
        series.seasons = this.buildSeasonList(
          isFutureOnly ? [] : options.seasons,
          series.seasons
        );

        if (isFutureOnly || options.monitorNewSeasons) {
          series.monitorNewItems = 'all';
        }

        const newSeriesResponse = await this.axios.put<SonarrSeries>(
          '/series',
          series
        );

        if (newSeriesResponse.data.id) {
          logger.info('Updated existing series in Sonarr.', {
            label: 'Sonarr',
            seriesId: newSeriesResponse.data.id,
            seriesTitle: newSeriesResponse.data.title,
          });
          logger.debug('Sonarr update details', {
            label: 'Sonarr',
            series: newSeriesResponse.data,
          });

          try {
            const episodes = await this.getEpisodes(newSeriesResponse.data.id);
            const episodeIdsToMonitor = episodes
              .filter(
                (ep) =>
                  options.seasons.includes(ep.seasonNumber) &&
                  !ep.monitored &&
                  (!isFutureOnly || isUnaired(ep))
              )
              .map((ep) => ep.id);

            if (episodeIdsToMonitor.length > 0) {
              logger.debug(
                'Re-monitoring unmonitored episodes for requested seasons.',
                {
                  label: 'Sonarr',
                  seriesId: newSeriesResponse.data.id,
                  episodeCount: episodeIdsToMonitor.length,
                }
              );
              await this.monitorEpisodes(episodeIdsToMonitor);
            }
          } catch (e) {
            logger.warn('Failed to re-monitor episodes', {
              label: 'Sonarr',
              errorMessage: e.message,
              seriesId: newSeriesResponse.data.id,
            });
          }

          // Episode only requests search for their own episodes instead
          if (
            options.searchNow &&
            !isFutureOnly &&
            options.seasons.length > 0
          ) {
            this.searchSeries(newSeriesResponse.data.id);
          }

          if (options.episodes?.length) {
            await this.monitorRequestedEpisodes(
              newSeriesResponse.data.id,
              options.episodes,
              options.searchNow
            );
          }

          return newSeriesResponse.data;
        } else {
          logger.error('Failed to update series in Sonarr', {
            label: 'Sonarr',
            options,
          });
          throw new Error('Failed to update series in Sonarr');
        }
      }

      const createdSeriesResponse = await this.axios.post<SonarrSeries>(
        '/series',
        {
          tvdbId: options.tvdbid,
          title: options.title,
          qualityProfileId: options.profileId,
          languageProfileId: options.languageProfileId,
          seasons: this.buildSeasonList(
            options.seasons,
            series.seasons.map((season) => ({
              seasonNumber: season.seasonNumber,
              // We force all seasons to false if its the first request
              monitored: false,
            }))
          ),
          tags: options.tags,
          seasonFolder: options.seasonFolder,
          monitored: options.monitored,
          monitorNewItems:
            isFutureOnly || options.monitorNewSeasons
              ? 'all'
              : options.monitorNewItems,
          rootFolderPath: options.rootFolderPath,
          seriesType: options.seriesType,
          addOptions: {
            ...(isFutureOnly ? { monitor: 'future' } : {}),
            ignoreEpisodesWithFiles: true,
            searchForMissingEpisodes:
              options.searchNow && !isFutureOnly && options.seasons.length > 0,
          },
        } as Partial<SonarrSeries>
      );

      if (createdSeriesResponse.data.id) {
        logger.info('Sonarr accepted request', { label: 'Sonarr' });
        logger.debug('Sonarr add details', {
          label: 'Sonarr',
          series: createdSeriesResponse.data,
        });

        if (options.episodes?.length) {
          await this.monitorRequestedEpisodes(
            createdSeriesResponse.data.id,
            options.episodes,
            options.searchNow
          );
        }
      } else {
        logger.error('Failed to add series to Sonarr', {
          label: 'Sonarr',
          options,
        });
        throw new Error('Failed to add series to Sonarr');
      }

      return createdSeriesResponse.data;
    } catch (e) {
      logger.error('Something went wrong while adding a series to Sonarr.', {
        label: 'Sonarr API',
        errorMessage: e.message,
        options,
        response: e?.response?.data,
      });
      throw new Error('Failed to add series', { cause: e });
    }
  }

  public async getLanguageProfiles(): Promise<LanguageProfile[]> {
    try {
      const data = await this.getRolling<LanguageProfile[]>(
        '/languageprofile',
        undefined,
        3600
      );

      return data;
    } catch (e) {
      logger.error(
        'Something went wrong while retrieving Sonarr language profiles.',
        {
          label: 'Sonarr API',
          errorMessage: e.message,
        }
      );

      throw new Error('Failed to get language profiles', { cause: e });
    }
  }

  public async searchSeries(seriesId: number): Promise<void> {
    logger.info('Executing series search command.', {
      label: 'Sonarr API',
      seriesId,
    });

    try {
      await this.runCommand('MissingEpisodeSearch', { seriesId });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Sonarr missing episode search.',
        {
          label: 'Sonarr API',
          errorMessage: e.message,
          seriesId,
        }
      );
    }
  }

  public async searchEpisodes(episodeIds: number[]): Promise<void> {
    logger.info('Executing episode search command.', {
      label: 'Sonarr API',
      episodeIds,
    });

    try {
      await this.runCommand('EpisodeSearch', { episodeIds });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Sonarr episode search.',
        {
          label: 'Sonarr API',
          errorMessage: e.message,
          episodeIds,
        }
      );
    }
  }

  /**
   * Monitors the requested episodes of a series and searches for them. A newly
   * added series gets its episodes from a refresh Sonarr runs in the
   * background, so we wait for them to show up first.
   */
  public async monitorRequestedEpisodes(
    seriesId: number,
    requested: RequestedEpisodes[],
    searchNow?: boolean
  ): Promise<void> {
    const isRequested = (episode: EpisodeResult) =>
      requested.some(
        (season) =>
          season.seasonNumber === episode.seasonNumber &&
          season.episodeNumbers.includes(episode.episodeNumber)
      );
    const requestedCount = requested.reduce(
      (count, season) => count + season.episodeNumbers.length,
      0
    );

    let episodes: EpisodeResult[] = [];

    for (
      let attempt = 0;
      attempt < SonarrAPI.episodeLookupAttempts;
      attempt++
    ) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, SonarrAPI.episodeLookupDelay)
        );
      }

      episodes = (await this.getEpisodes(seriesId)).filter(isRequested);

      if (episodes.length >= requestedCount) {
        break;
      }
    }

    if (episodes.length === 0) {
      throw new Error('Requested episodes not found in Sonarr');
    }

    if (episodes.length < requestedCount) {
      logger.warn('Some requested episodes were not found in Sonarr', {
        label: 'Sonarr API',
        seriesId,
        requested,
        found: episodes.map((ep) => `S${ep.seasonNumber}E${ep.episodeNumber}`),
      });
    }

    const episodeIds = episodes.map((ep) => ep.id);

    await this.monitorEpisodes(episodeIds);

    if (searchNow) {
      await this.searchEpisodes(episodeIds);
    }
  }

  public async getEpisodes(seriesId: number): Promise<EpisodeResult[]> {
    try {
      const response = await this.axios.get<EpisodeResult[]>('/episode', {
        params: { seriesId },
      });
      return response.data;
    } catch (e) {
      logger.error('Failed to retrieve episodes', {
        label: 'Sonarr API',
        errorMessage: e.message,
        seriesId,
      });
      throw new Error('Failed to get episodes', { cause: e });
    }
  }

  public async getEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
    try {
      const response = await this.axios.get<SonarrEpisodeFile[]>(
        '/episodefile',
        {
          params: { seriesId },
        }
      );
      return response.data;
    } catch (e) {
      logger.error('Failed to retrieve episode files', {
        label: 'Sonarr API',
        errorMessage: e.message,
        seriesId,
      });
      throw new Error('Failed to get episode files', { cause: e });
    }
  }

  public async monitorEpisodes(episodeIds: number[]): Promise<void> {
    try {
      await this.axios.put('/episode/monitor', {
        episodeIds,
        monitored: true,
      });
    } catch (e) {
      logger.error('Failed to monitor episodes', {
        label: 'Sonarr API',
        errorMessage: e.message,
        episodeIds,
      });
      throw new Error('Failed to monitor episodes', { cause: e });
    }
  }

  public async unmonitorEpisodes(episodeIds: number[]): Promise<void> {
    try {
      await this.axios.put('/episode/monitor', {
        episodeIds,
        monitored: false,
      });
    } catch (e) {
      logger.error('Failed to unmonitor episodes', {
        label: 'Sonarr API',
        errorMessage: e.message,
        episodeIds,
      });
      throw new Error('Failed to unmonitor episodes', { cause: e });
    }
  }

  /**
   * Searches the indexers for releases of a season, or of one episode
   */
  public async getReleases(
    params: { seriesId: number; seasonNumber: number } | { episodeId: number }
  ): Promise<ServarrRelease[]> {
    return this.fetchReleases<ServarrRelease[]>(params);
  }

  public async getSeriesHistory(
    seriesId: number,
    seasonNumber?: number
  ): Promise<ServarrHistoryRecord[]> {
    return this.fetchHistory('/history/series', { seriesId, seasonNumber });
  }

  /**
   * Deletes episode files from disk through Sonarr.
   */
  public async deleteEpisodeFiles(episodeFileIds: number[]): Promise<void> {
    if (episodeFileIds.length === 0) {
      return;
    }

    try {
      await this.axios.delete('/episodefile/bulk', {
        data: { episodeFileIds },
      });
      logger.info('Deleted episode files', {
        label: 'Sonarr API',
        episodeFileIds,
      });
    } catch (e) {
      logger.error('Failed to delete episode files', {
        label: 'Sonarr API',
        errorMessage: e.message,
        episodeFileIds,
      });
      throw new Error('Failed to delete episode files', { cause: e });
    }
  }

  /**
   * Changes which seasons of a series are monitored, and optionally has Sonarr
   * monitor seasons it adds later. Specials are left as they are.
   */
  public async updateSeasonMonitoring(
    seriesId: number,
    {
      monitor = [],
      unmonitor = [],
      monitorNewSeasons = false,
    }: { monitor?: number[]; unmonitor?: number[]; monitorNewSeasons?: boolean }
  ): Promise<void> {
    try {
      const series = await this.getSeriesById(seriesId);
      let hasChanges = monitorNewSeasons && series.monitorNewItems !== 'all';

      series.seasons = series.seasons.map((season) => {
        if (season.seasonNumber === 0) {
          return season;
        }

        const monitored = monitor.includes(season.seasonNumber)
          ? true
          : unmonitor.includes(season.seasonNumber)
            ? false
            : season.monitored;

        if (monitored !== season.monitored) {
          hasChanges = true;
        }

        return { ...season, monitored };
      });

      if (monitorNewSeasons) {
        series.monitorNewItems = 'all';
      }

      if (!hasChanges) {
        return;
      }

      await this.axios.put<SonarrSeries>(`/series/${seriesId}`, series);
    } catch (e) {
      logger.error('Failed to update season monitoring', {
        label: 'Sonarr API',
        errorMessage: e.message,
        seriesId,
        monitor,
        unmonitor,
      });
      throw new Error('Failed to update season monitoring', { cause: e });
    }
  }

  private buildSeasonList(
    seasons: number[],
    existingSeasons?: SonarrSeason[]
  ): SonarrSeason[] {
    if (existingSeasons) {
      const newSeasons = existingSeasons.map((season) => {
        if (seasons.includes(season.seasonNumber)) {
          season.monitored = true;
        }
        return season;
      });

      return newSeasons;
    }

    const newSeasons = seasons.map(
      (seasonNumber): SonarrSeason => ({
        seasonNumber,
        monitored: true,
      })
    );

    return newSeasons;
  }
  public removeSeries = async (tvdbId: number): Promise<void> => {
    const { id, title } = await this.getSeriesByTvdbId(tvdbId);

    if (!id) {
      logger.info(`[Sonarr] Series not in library, nothing to remove`, {
        tvdbId,
      });
      return;
    }

    try {
      await this.axios.delete(`/series/${id}`, {
        params: {
          deleteFiles: true,
          addImportExclusion: false,
        },
      });
      logger.info(`[Sonarr] Removed series ${title}`);
    } catch (e) {
      if (e?.response?.status === 404) {
        logger.info(`[Sonarr] Series already removed from Sonarr`, {
          tvdbId,
        });
        return;
      }
      throw e;
    }
  };

  public clearCache = ({
    tvdbId,
    externalId,
    title,
  }: {
    tvdbId?: number | null;
    externalId?: number | null;
    title?: string | null;
  }) => {
    if (tvdbId) {
      this.removeCache('/series/lookup', {
        term: `tvdb:${tvdbId}`,
      });
    }
    if (externalId) {
      this.removeCache(`/series/${externalId}`);
    }
    if (title) {
      this.removeCache('/series/lookup', {
        term: title,
      });
    }
  };
}

export default SonarrAPI;
