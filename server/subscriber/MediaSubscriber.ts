import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import { getRequestStatusKey } from '@server/lib/bookRequests';
import {
  getFollowType,
  getNewlyAvailable,
  hasFollowers,
  notifyFollowers,
} from '@server/lib/followNotifications';
import logger from '@server/logger';
import { withNestedTransaction } from '@server/utils/nestedTransaction';
import type {
  EntityManager,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { EventSubscriber, In, IsNull } from 'typeorm';

@EventSubscriber()
export class MediaSubscriber implements EntitySubscriberInterface<Media> {
  private async updateChildRequestStatus(
    manager: EntityManager,
    event: Media,
    is4k: boolean,
    isAudiobook = false
  ) {
    const requestRepository = manager.getRepository(MediaRequest);

    const requests = await requestRepository.find({
      where: { media: { id: event.id } },
    });

    for (const request of requests) {
      if (
        request.is4k === is4k &&
        request.isAudiobook === isAudiobook &&
        // Another recording waits for its own files, not the book's
        !request.recording &&
        request.status === MediaRequestStatus.PENDING
      ) {
        request.status = MediaRequestStatus.APPROVED;
        await requestRepository.save(request);
      }
    }
  }

  private async updateRelatedMediaRequest(
    manager: EntityManager,
    event: Media,
    databaseEvent: Media,
    is4k: boolean,
    isAudiobook = false
  ) {
    const requestRepository = manager.getRepository(MediaRequest);
    const seasonRequestRepository = manager.getRepository(SeasonRequest);

    const relatedRequests = await requestRepository.find({
      relations: {
        media: true,
      },
      where: {
        media: { id: event.id },
        status: In([MediaRequestStatus.APPROVED, MediaRequestStatus.FAILED]),
        is4k,
        isAudiobook,
        // Recording requests are completed by their own recording's files
        recording: IsNull(),
      },
    });

    // Check the media entity status and if available
    // or deleted, set the related request to completed
    if (relatedRequests.length > 0) {
      const completedRequests: MediaRequest[] = [];

      for (const request of relatedRequests) {
        let shouldComplete = false;

        if (
          (event[getRequestStatusKey(request)] === MediaStatus.AVAILABLE ||
            event[getRequestStatusKey(request)] === MediaStatus.DELETED) &&
          (event.mediaType === MediaType.MOVIE ||
            event.mediaType === MediaType.MUSIC ||
            event.mediaType === MediaType.BOOK)
        ) {
          shouldComplete = true;
        } else if (event.mediaType === 'tv') {
          const allSeasonResults: boolean[] = [];

          // Sequential on purpose as these saves share the transaction's connection
          for (const requestSeason of request.seasons) {
            const matchingSeason = event.seasons.find(
              (mediaSeason) =>
                mediaSeason.seasonNumber === requestSeason.seasonNumber
            );
            const matchingOldSeason = databaseEvent.seasons.find(
              (oldSeason) =>
                oldSeason.seasonNumber === requestSeason.seasonNumber
            );

            if (!matchingSeason) {
              allSeasonResults.push(false);
              continue;
            }

            const currentSeasonStatus =
              matchingSeason[request.is4k ? 'status4k' : 'status'];
            const previousSeasonStatus =
              matchingOldSeason?.[request.is4k ? 'status4k' : 'status'];

            const hasStatusChanged =
              currentSeasonStatus !== previousSeasonStatus;

            const shouldUpdate =
              (hasStatusChanged ||
                requestSeason.status === MediaRequestStatus.COMPLETED) &&
              (currentSeasonStatus === MediaStatus.AVAILABLE ||
                currentSeasonStatus === MediaStatus.DELETED);

            if (shouldUpdate) {
              requestSeason.status = MediaRequestStatus.COMPLETED;
              await seasonRequestRepository.save(requestSeason);

              allSeasonResults.push(true);
              continue;
            }

            allSeasonResults.push(false);
          }

          const allSeasonsReady = allSeasonResults.every((result) => result);
          shouldComplete = allSeasonsReady;
        }

        if (shouldComplete) {
          request.status = MediaRequestStatus.COMPLETED;
          completedRequests.push(request);
        }
      }

      await requestRepository.save(completedRequests);
    }
  }

  public async beforeUpdate(event: UpdateEvent<Media>): Promise<void> {
    if (!event.entity || !event.databaseEntity) {
      return;
    }

    try {
      if (
        event.entity.status === MediaStatus.AVAILABLE &&
        event.databaseEntity?.status === MediaStatus.PENDING
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateChildRequestStatus(
            manager,
            event.entity as Media,
            false
          );
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating child request status in beforeUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          is4k: false,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }

    try {
      if (
        event.entity.status4k === MediaStatus.AVAILABLE &&
        event.databaseEntity?.status4k === MediaStatus.PENDING
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateChildRequestStatus(
            manager,
            event.entity as Media,
            true
          );
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating child request status in beforeUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          is4k: true,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }

    try {
      if (
        event.entity.statusAudio === MediaStatus.AVAILABLE &&
        event.databaseEntity?.statusAudio === MediaStatus.PENDING
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateChildRequestStatus(
            manager,
            event.entity as Media,
            false,
            true
          );
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating child request status in beforeUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          isAudiobook: true,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }

    // Manually load related seasons into databaseEntity
    // for seasonStatusCheck in afterUpdate
    const seasons = await event.manager
      .getRepository(Season)
      .createQueryBuilder('season')
      .leftJoin('season.media', 'media')
      .where('media.id = :id', { id: event.databaseEntity.id })
      .getMany();

    event.databaseEntity.seasons = seasons;
  }

  public async afterUpdate(event: UpdateEvent<Media>): Promise<void> {
    if (!event.entity || !event.databaseEntity) {
      return;
    }

    const validStatuses = [
      MediaStatus.PARTIALLY_AVAILABLE,
      MediaStatus.AVAILABLE,
      MediaStatus.DELETED,
    ];

    const seasonStatusCheck = (is4k: boolean) => {
      return event.entity?.seasons?.some((season: Season, index: number) => {
        const previousSeason = event.databaseEntity.seasons[index];

        return (
          season[is4k ? 'status4k' : 'status'] !==
          previousSeason?.[is4k ? 'status4k' : 'status']
        );
      });
    };

    try {
      if (
        (event.entity.status !== event.databaseEntity?.status ||
          (event.entity.mediaType === MediaType.TV &&
            seasonStatusCheck(false))) &&
        validStatuses.includes(event.entity.status)
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateRelatedMediaRequest(
            manager,
            event.entity as Media,
            event.databaseEntity as Media,
            false
          );
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating related requests in afterUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          is4k: false,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }

    try {
      if (
        (event.entity.status4k !== event.databaseEntity?.status4k ||
          (event.entity.mediaType === MediaType.TV &&
            seasonStatusCheck(true))) &&
        validStatuses.includes(event.entity.status4k)
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateRelatedMediaRequest(
            manager,
            event.entity as Media,
            event.databaseEntity as Media,
            true
          );
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating related requests in afterUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          is4k: true,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }

    await this.afterUpdateAudiobook(event);

    await this.notifyFollowersIfAvailable(
      event.manager,
      event.entity as Media,
      event.databaseEntity
    );
  }

  /**
   * Media a scan adds can be available from the start
   */
  public async afterInsert(event: InsertEvent<Media>): Promise<void> {
    if (event.entity) {
      await this.notifyFollowersIfAvailable(event.manager, event.entity);
    }
  }

  /**
   * Tells the followers of its artists or authors once an album or book is
   * available. Only the check for followers holds up the save, the metadata
   * lookups and notifications run in the background.
   */
  private async notifyFollowersIfAvailable(
    manager: EntityManager,
    media: Media,
    previous?: Media
  ): Promise<void> {
    const available = getNewlyAvailable(media, previous);
    const followType = getFollowType(media.mediaType);

    try {
      if (
        available &&
        followType &&
        (await hasFollowers(followType, manager))
      ) {
        void notifyFollowers(media, available);
      }
    } catch (e) {
      logger.error('Error while checking for followers in subscriber', {
        label: 'Media',
        mediaId: media.id,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Completes a book's audiobook requests once the audiobook is available,
   * as afterUpdate does for the ebook and 4K statuses
   */
  private async afterUpdateAudiobook(event: UpdateEvent<Media>): Promise<void> {
    if (
      !event.entity ||
      !event.databaseEntity ||
      event.entity.mediaType !== MediaType.BOOK
    ) {
      return;
    }

    try {
      if (
        event.entity.statusAudio !== event.databaseEntity.statusAudio &&
        [MediaStatus.AVAILABLE, MediaStatus.DELETED].includes(
          event.entity.statusAudio
        )
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateRelatedMediaRequest(
            manager,
            event.entity as Media,
            event.databaseEntity as Media,
            false,
            true
          );
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating related requests in afterUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          isAudiobook: true,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }
  }

  public listenTo(): typeof Media {
    return Media;
  }
}
