import logger from '@server/logger';
import type { ServarrHistoryRecord, ServarrRelease } from './base';
import ServarrBase from './base';

export interface LidarrImage {
  url: string;
  coverType: string;
  remoteUrl?: string;
}

export interface LidarrRating {
  votes: number;
  value: number;
}

export interface LidarrLink {
  url: string;
  name: string;
}

export interface LidarrArtist {
  [key: string]: unknown;
  id: number;
  artistName: string;
  foreignArtistId: string;
  monitored: boolean;
  monitorNewItems?: string;
  qualityProfileId?: number;
  metadataProfileId?: number;
  rootFolderPath?: string;
  path?: string;
  tags?: number[];
  images?: LidarrImage[];
  links?: LidarrLink[];
}

export interface LidarrAlbumOptions {
  [key: string]: unknown;
  foreignAlbumId: string;
  monitored: boolean;
  anyReleaseOk: boolean;
  profileId: number;
  artist: {
    qualityProfileId: number;
    metadataProfileId: number;
    rootFolderPath: string;
    monitored: boolean;
    monitorNewItems: string;
    tags: number[];
    addOptions: {
      monitor: string;
      // Albums Lidarr monitors when it adds the artist; without them a new
      // artist added with monitor "none" leaves the requested album
      // unmonitored too
      albumsToMonitor?: string[];
      searchForMissingAlbums: boolean;
    };
  };
  addOptions: {
    searchForNewAlbum: boolean;
  };
}

export interface LidarrAlbum {
  id: number;
  mbId: string;
  title: string;
  monitored: boolean;
  artistId: number;
  foreignAlbumId: string;
  titleSlug: string;
  profileId: number;
  duration: number;
  albumType: string;
  releaseDate?: string;
  images?: LidarrImage[];
  artist?: LidarrArtist;
  statistics?: {
    trackFileCount: number;
    trackCount: number;
    totalTrackCount: number;
    sizeOnDisk: number;
    percentOfTracks: number;
  };
}

export interface LidarrTrackFile {
  id: number;
  albumId: number;
  path?: string;
  size?: number;
}

export interface LidarrCalendarAlbum extends Omit<LidarrAlbum, 'artist'> {
  releaseDate?: string;
  images?: LidarrImage[];
  artist?: {
    artistName: string;
    foreignArtistId: string;
  };
}

export interface MetadataProfile {
  id: number;
  name: string;
}

class LidarrAPI extends ServarrBase<{ albumId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'lidarr', apiName: 'Lidarr' });
  }

  public getAlbums = async (): Promise<LidarrAlbum[]> => {
    try {
      const response = await this.axios.get<LidarrAlbum[]>('/album');

      return response.data;
    } catch (e) {
      throw new Error(`[Lidarr] Failed to retrieve albums: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getCalendar = async ({
    start,
    end,
  }: {
    start: string;
    end: string;
  }): Promise<LidarrCalendarAlbum[]> => {
    try {
      const data = await this.get<LidarrCalendarAlbum[]>(
        '/calendar',
        {
          params: { start, end, unmonitored: false, includeArtist: true },
        },
        300
      );

      return data;
    } catch (e) {
      throw new Error(`[Lidarr] Failed to retrieve calendar: ${e.message}`, {
        cause: e,
      });
    }
  };

  public async getAlbumById(id: number): Promise<LidarrAlbum> {
    try {
      const response = await this.axios.get<LidarrAlbum>(`/album/${id}`);

      return response.data;
    } catch (e) {
      throw new Error(`[Lidarr] Failed to retrieve album by ID: ${e.message}`, {
        cause: e,
      });
    }
  }

  /**
   * An album by its Lidarr id, or undefined when Lidarr answers that it
   * has no such album (404). Any other failure is thrown.
   */
  public async findAlbum(id: number): Promise<LidarrAlbum | undefined> {
    try {
      const response = await this.axios.get<LidarrAlbum>(`/album/${id}`);

      return response.data;
    } catch (e) {
      if (e.response?.status === 404) {
        return undefined;
      }

      throw new Error(`[Lidarr] Failed to retrieve album: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getAlbumByForeignAlbumId(mbid: string): Promise<LidarrAlbum> {
    try {
      const response = await this.axios.get<LidarrAlbum[]>('/album/lookup', {
        params: {
          term: `lidarr:${mbid}`,
        },
      });

      if (!response.data[0]) {
        throw new Error('Album not found');
      }

      return response.data[0];
    } catch (e) {
      logger.error('Error retrieving album by MusicBrainz ID', {
        label: 'Lidarr API',
        errorMessage: e.message,
        mbid,
      });
      throw new Error('Album not found', { cause: e });
    }
  }

  public getArtists = async (): Promise<LidarrArtist[]> => {
    try {
      const response = await this.axios.get<LidarrArtist[]>('/artist');

      return response.data;
    } catch (e) {
      throw new Error(`[Lidarr] Failed to retrieve artists: ${e.message}`, {
        cause: e,
      });
    }
  };

  /**
   * Adds a requested album to Lidarr. A new artist is added along with it,
   * without monitoring the rest of its albums. An album that is already in
   * Lidarr is monitored (with its artist) and searched instead.
   */
  public async addAlbum(options: LidarrAlbumOptions): Promise<LidarrAlbum> {
    try {
      const album = await this.getAlbumByForeignAlbumId(options.foreignAlbumId);

      if (album.id) {
        await this.axios.put('/album/monitor', {
          albumIds: [album.id],
          monitored: true,
        });

        if (album.artist && !album.artist.monitored) {
          await this.axios.put(`/artist/${album.artist.id}`, {
            ...album.artist,
            monitored: true,
          });
        }

        logger.info('Monitored existing album in Lidarr.', {
          label: 'Lidarr',
          albumId: album.id,
          albumTitle: album.title,
        });

        if (options.addOptions.searchForNewAlbum) {
          await this.searchAlbum(album.id);
        }

        this.clearCache({ mbId: options.foreignAlbumId, externalId: album.id });

        return { ...album, monitored: true };
      }

      const createdAlbumResponse = await this.axios.post<LidarrAlbum>(
        '/album',
        {
          ...album,
          ...options,
          artist: {
            ...album.artist,
            ...options.artist,
          },
        }
      );

      if (!createdAlbumResponse.data.id) {
        logger.error('Failed to add album to Lidarr', {
          label: 'Lidarr',
          options,
        });
        throw new Error('Failed to add album to Lidarr');
      }

      logger.info('Lidarr accepted request', { label: 'Lidarr' });
      logger.debug('Lidarr add details', {
        label: 'Lidarr',
        album: createdAlbumResponse.data,
      });

      this.clearCache({ mbId: options.foreignAlbumId });

      return createdAlbumResponse.data;
    } catch (e) {
      logger.error('Something went wrong while adding an album to Lidarr.', {
        label: 'Lidarr API',
        errorMessage: e.message,
        options,
        response: e?.response?.data,
      });
      throw new Error('Failed to add album', { cause: e });
    }
  }

  /**
   * Has Lidarr monitor and search the new albums of an artist it already
   * has, the way the "All Albums" new album option does. Returns false when
   * the artist is not in Lidarr.
   */
  public async monitorNewArtistReleases(
    foreignArtistId: string
  ): Promise<boolean> {
    try {
      const response = await this.axios.get<LidarrArtist[]>('/artist', {
        params: { mbId: foreignArtistId },
      });
      const artist = response.data.find(
        (lidarrArtist) => lidarrArtist.foreignArtistId === foreignArtistId
      );

      if (!artist) {
        return false;
      }

      if (!artist.monitored || artist.monitorNewItems !== 'all') {
        await this.axios.put(`/artist/${artist.id}`, {
          ...artist,
          monitored: true,
          monitorNewItems: 'all',
        });
      }

      logger.info('Monitoring new releases of artist in Lidarr.', {
        label: 'Lidarr',
        artistId: artist.id,
        artistName: artist.artistName,
      });

      return true;
    } catch (e) {
      throw new Error(
        `[Lidarr] Failed to monitor new releases of artist: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getAlbumsByArtistId(artistId: number): Promise<LidarrAlbum[]> {
    const response = await this.axios.get<LidarrAlbum[]>('/album', {
      params: { artistId },
    });

    return response.data;
  }

  public async getTrackFilesByAlbumId(
    albumId: number
  ): Promise<LidarrTrackFile[]> {
    const response = await this.axios.get<LidarrTrackFile[]>('/trackfile', {
      params: { albumId },
    });

    return response.data;
  }

  public async deleteTrackFiles(trackFileIds: number[]): Promise<void> {
    if (trackFileIds.length === 0) {
      return;
    }

    await this.axios.delete('/trackfile/bulk', {
      data: { trackFileIds },
    });
  }

  public async setAlbumsMonitored(
    albumIds: number[],
    monitored: boolean
  ): Promise<void> {
    await this.axios.put('/album/monitor', { albumIds, monitored });
  }

  public async removeArtist(
    artistId: number,
    { deleteFiles }: { deleteFiles: boolean }
  ): Promise<void> {
    await this.axios.delete(`/artist/${artistId}`, {
      params: { deleteFiles, addImportListExclusion: false },
    });
  }

  /**
   * Deletes the files of an album and stops monitoring it, so Lidarr does
   * not download it again. The album stays in Lidarr. Its artist is removed
   * too when no other album of the artist is monitored or has files, which
   * leaves Lidarr as it was before the album was requested. Returns whether
   * the artist was removed.
   */
  public async removeAlbumFiles(
    mbid: string
  ): Promise<{ removed: boolean; artistRemoved: boolean }> {
    try {
      const album = await this.getAlbumByForeignAlbumId(mbid);

      if (!album.id) {
        logger.info('Album not in Lidarr, nothing to remove', {
          label: 'Lidarr',
          mbid,
        });
        return { removed: false, artistRemoved: false };
      }

      const trackFiles = await this.getTrackFilesByAlbumId(album.id);
      await this.deleteTrackFiles(trackFiles.map((trackFile) => trackFile.id));
      await this.setAlbumsMonitored([album.id], false);

      logger.info('Deleted album files and unmonitored the album in Lidarr', {
        label: 'Lidarr',
        albumId: album.id,
        albumTitle: album.title,
        trackFiles: trackFiles.length,
      });

      let artistRemoved = false;
      const artistId = album.artistId ?? album.artist?.id;

      if (artistId) {
        const otherAlbums = (await this.getAlbumsByArtistId(artistId)).filter(
          (artistAlbum) => artistAlbum.id !== album.id
        );
        const artistInUse = otherAlbums.some(
          (artistAlbum) =>
            artistAlbum.monitored ||
            (artistAlbum.statistics?.trackFileCount ?? 0) > 0
        );

        if (!artistInUse) {
          // The album files are already gone and no other album has any,
          // files Lidarr does not know about are left alone
          await this.removeArtist(artistId, { deleteFiles: false });
          artistRemoved = true;
          logger.info('Removed artist with nothing else monitored', {
            label: 'Lidarr',
            artistId,
          });
        }
      }

      this.clearCache({ mbId: mbid, externalId: album.id });

      return { removed: true, artistRemoved };
    } catch (e) {
      throw new Error(`[Lidarr] Failed to remove album: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async searchAlbum(albumId: number): Promise<void> {
    logger.info('Executing album search command.', {
      label: 'Lidarr API',
      albumId,
    });

    try {
      await this.runCommand('AlbumSearch', { albumIds: [albumId] });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Lidarr album search.',
        {
          label: 'Lidarr API',
          errorMessage: e.message,
          albumId,
        }
      );
    }
  }

  public async getReleases(albumId: number): Promise<ServarrRelease[]> {
    return this.fetchReleases<ServarrRelease[]>({ albumId });
  }

  public async getAlbumHistory(
    artistId: number,
    albumId: number
  ): Promise<ServarrHistoryRecord[]> {
    return this.fetchHistory('/history/artist', { artistId, albumId });
  }

  public async getMetadataProfiles(): Promise<MetadataProfile[]> {
    try {
      const data = await this.getRolling<MetadataProfile[]>(
        '/metadataprofile',
        undefined,
        3600
      );

      return data;
    } catch (e) {
      logger.error(
        'Something went wrong while retrieving Lidarr metadata profiles.',
        {
          label: 'Lidarr API',
          errorMessage: e.message,
        }
      );

      throw new Error('Failed to get metadata profiles', { cause: e });
    }
  }

  public clearCache = ({
    mbId,
    externalId,
    title,
  }: {
    mbId?: string | null;
    externalId?: number | null;
    title?: string | null;
  }) => {
    if (mbId) {
      this.removeCache('/album/lookup', {
        term: `lidarr:${mbId}`,
      });
    }
    if (externalId) {
      this.removeCache(`/album/${externalId}`);
    }
    if (title) {
      this.removeCache('/album/lookup', {
        term: title,
      });
    }
  };
}

export default LidarrAPI;
