import type { BazarrSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

export interface BazarrLanguage {
  name: string;
  code2: string;
  code3: string;
  forced?: boolean;
  hi?: boolean;
}

export interface BazarrSubtitle extends BazarrLanguage {
  path: string | null;
  file_size: number | null;
  embedded_track_id?: number | null;
}

export interface BazarrMovie {
  radarrId: number;
  title: string;
  profileId: number | null;
  monitored: boolean;
  subtitles: BazarrSubtitle[];
  missing_subtitles: BazarrLanguage[];
  audio_language: BazarrLanguage[];
}

export interface BazarrSeries {
  sonarrSeriesId: number;
  title: string;
  profileId: number | null;
  monitored: boolean;
}

export interface BazarrEpisode {
  sonarrSeriesId: number;
  sonarrEpisodeId: number;
  season: number;
  episode: number;
  title: string;
  monitored: boolean;
  subtitles: BazarrSubtitle[];
  missing_subtitles: BazarrLanguage[];
  audio_language: BazarrLanguage[];
}

export interface BazarrSystemLanguage {
  name: string;
  code2: string;
  code3: string;
  enabled: boolean;
}

export interface BazarrLanguageProfile {
  profileId: number;
  name: string;
  items: {
    id: number;
    language: string;
    forced: string;
    hi: string;
  }[];
}

export interface BazarrSubtitleSearch {
  language: string;
  forced?: boolean;
  hi?: boolean;
}

interface BazarrListResponse<T> {
  data: T[];
}

class BazarrAPI {
  private axios: AxiosInstance;

  constructor(settings: BazarrSettings) {
    this.axios = axios.create({
      baseURL: `${settings.useSsl ? 'https' : 'http'}://${settings.hostname}:${
        settings.port
      }${settings.urlBase ?? ''}/api`,
      headers: { 'X-API-KEY': settings.apiKey ?? '' },
    });
    this.axios.interceptors.request.use(proxyRequestInterceptor);
    this.axios.interceptors.request.use(userAgentRequestInterceptor);
  }

  public async getVersion(): Promise<string> {
    try {
      const response = await this.axios.get<{
        data: { bazarr_version: string };
      }>('/system/status');

      return response.data.data.bazarr_version;
    } catch (e) {
      logger.error('Something went wrong fetching Bazarr status', {
        label: 'Bazarr API',
        errorMessage: e.message,
      });
      throw new Error(`[Bazarr] Failed to fetch status: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getMovie(radarrId: number): Promise<BazarrMovie | undefined> {
    try {
      const response = await this.axios.get<BazarrListResponse<BazarrMovie>>(
        '/movies',
        { params: { 'radarrid[]': radarrId } }
      );

      return response.data.data[0];
    } catch (e) {
      logger.error('Something went wrong fetching movie from Bazarr', {
        label: 'Bazarr API',
        errorMessage: e.message,
        radarrId,
      });
      throw new Error(`[Bazarr] Failed to fetch movie: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getSeries(
    sonarrSeriesId: number
  ): Promise<BazarrSeries | undefined> {
    try {
      const response = await this.axios.get<BazarrListResponse<BazarrSeries>>(
        '/series',
        { params: { 'seriesid[]': sonarrSeriesId } }
      );

      return response.data.data[0];
    } catch (e) {
      logger.error('Something went wrong fetching series from Bazarr', {
        label: 'Bazarr API',
        errorMessage: e.message,
        sonarrSeriesId,
      });
      throw new Error(`[Bazarr] Failed to fetch series: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getEpisodes(sonarrSeriesId: number): Promise<BazarrEpisode[]> {
    try {
      const response = await this.axios.get<BazarrListResponse<BazarrEpisode>>(
        '/episodes',
        { params: { 'seriesid[]': sonarrSeriesId } }
      );

      return response.data.data;
    } catch (e) {
      logger.error('Something went wrong fetching episodes from Bazarr', {
        label: 'Bazarr API',
        errorMessage: e.message,
        sonarrSeriesId,
      });
      throw new Error(`[Bazarr] Failed to fetch episodes: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getLanguages(): Promise<BazarrSystemLanguage[]> {
    try {
      const response =
        await this.axios.get<BazarrSystemLanguage[]>('/system/languages');

      return response.data;
    } catch (e) {
      logger.error('Something went wrong fetching languages from Bazarr', {
        label: 'Bazarr API',
        errorMessage: e.message,
      });
      throw new Error(`[Bazarr] Failed to fetch languages: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getLanguageProfiles(): Promise<BazarrLanguageProfile[]> {
    try {
      const response = await this.axios.get<BazarrLanguageProfile[]>(
        '/system/languages/profiles'
      );

      return response.data;
    } catch (e) {
      logger.error(
        'Something went wrong fetching language profiles from Bazarr',
        {
          label: 'Bazarr API',
          errorMessage: e.message,
        }
      );
      throw new Error(
        `[Bazarr] Failed to fetch language profiles: ${e.message}`,
        { cause: e }
      );
    }
  }

  /**
   * Asks Bazarr to search its providers for one language of a movie and
   * download the best match.
   */
  public async searchMovieSubtitles(
    radarrId: number,
    { language, forced = false, hi = false }: BazarrSubtitleSearch
  ): Promise<void> {
    try {
      await this.axios.patch('/movies/subtitles', null, {
        params: {
          radarrid: radarrId,
          language,
          forced: String(forced),
          hi: String(hi),
        },
      });
    } catch (e) {
      logger.error('Something went wrong searching movie subtitles', {
        label: 'Bazarr API',
        errorMessage: e.message,
        radarrId,
        language,
      });
      throw new Error(
        `[Bazarr] Failed to search movie subtitles: ${e.message}`,
        { cause: e }
      );
    }
  }

  /**
   * Asks Bazarr to search its providers for one language of an episode and
   * download the best match.
   */
  public async searchEpisodeSubtitles(
    sonarrSeriesId: number,
    sonarrEpisodeId: number,
    { language, forced = false, hi = false }: BazarrSubtitleSearch
  ): Promise<void> {
    try {
      await this.axios.patch('/episodes/subtitles', null, {
        params: {
          seriesid: sonarrSeriesId,
          episodeid: sonarrEpisodeId,
          language,
          forced: String(forced),
          hi: String(hi),
        },
      });
    } catch (e) {
      logger.error('Something went wrong searching episode subtitles', {
        label: 'Bazarr API',
        errorMessage: e.message,
        sonarrSeriesId,
        sonarrEpisodeId,
        language,
      });
      throw new Error(
        `[Bazarr] Failed to search episode subtitles: ${e.message}`,
        { cause: e }
      );
    }
  }
}

export default BazarrAPI;
