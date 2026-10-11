import {
  IssueStatus,
  IssueType,
  getIssueTypeName,
} from '@server/constants/issue';
import { MediaType } from '@server/constants/media';
import Issue from '@server/entity/Issue';
import {
  getBookFormatChoiceName,
  getMediaNotificationDetails,
} from '@server/lib/mediaNotificationDetails';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { sortBy } from 'lodash';
import type {
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { EventSubscriber } from 'typeorm';

/**
 * The notification fields that say which part of the media has the problem:
 * the season and episode of a series, the disc and track of an album and
 * the format of a book
 */
export const getIssueExtra = (
  issue: Issue
): { name: string; value: string }[] => {
  const extra: { name: string; value: string }[] = [];

  if (issue.media.mediaType === MediaType.TV && issue.problemSeason > 0) {
    extra.push({
      name: 'Affected Season',
      value: issue.problemSeason.toString(),
    });

    if (issue.problemEpisode > 0) {
      extra.push({
        name: 'Affected Episode',
        value: issue.problemEpisode.toString(),
      });
    }
  }

  if (issue.media.mediaType === MediaType.MUSIC && issue.problemEpisode > 0) {
    extra.push({
      name: 'Affected Track',
      value:
        issue.problemSeason > 1
          ? `Disc ${issue.problemSeason}, Track ${issue.problemEpisode}`
          : `Track ${issue.problemEpisode}`,
    });
  }

  if (issue.media.mediaType === MediaType.BOOK && issue.bookFormat) {
    extra.push({
      name: 'Format',
      value: getBookFormatChoiceName(issue.bookFormat),
    });
  }

  return extra;
};

@EventSubscriber()
export class IssueSubscriber implements EntitySubscriberInterface<Issue> {
  public listenTo(): typeof Issue {
    return Issue;
  }

  private async sendIssueNotification(entity: Issue, type: Notification) {
    try {
      const { subject, image } = await getMediaNotificationDetails(
        entity.media
      );

      const [firstComment] = sortBy(entity.comments, 'id');
      const issueTypeName =
        entity.issueType !== IssueType.OTHER
          ? `${getIssueTypeName(entity.issueType, entity.media.mediaType)} `
          : '';

      notificationManager.sendNotification(type, {
        event:
          type === Notification.ISSUE_CREATED
            ? `New ${issueTypeName}Issue Reported`
            : type === Notification.ISSUE_RESOLVED
              ? `${issueTypeName}Issue Resolved`
              : `${issueTypeName}Issue Reopened`,
        subject,
        message: firstComment.message,
        issue: entity,
        media: entity.media,
        image,
        extra: getIssueExtra(entity),
        notifyAdmin: true,
        notifySystem: true,
        notifyUser:
          !entity.createdBy.hasPermission(Permission.MANAGE_ISSUES) &&
          entity.modifiedBy?.id !== entity.createdBy.id &&
          (type === Notification.ISSUE_RESOLVED ||
            type === Notification.ISSUE_REOPENED)
            ? entity.createdBy
            : undefined,
      });
    } catch (e) {
      logger.error('Something went wrong sending issue notification(s)', {
        label: 'Notifications',
        errorMessage: e.message,
        issueId: entity.id,
      });
    }
  }

  public afterInsert(event: InsertEvent<Issue>): void {
    if (!event.entity) {
      return;
    }

    this.sendIssueNotification(event.entity, Notification.ISSUE_CREATED);
  }

  public beforeUpdate(event: UpdateEvent<Issue>): void {
    if (!event.entity) {
      return;
    }

    if (
      event.entity.status === IssueStatus.RESOLVED &&
      event.databaseEntity.status !== IssueStatus.RESOLVED
    ) {
      this.sendIssueNotification(
        event.entity as Issue,
        Notification.ISSUE_RESOLVED
      );
    } else if (
      event.entity.status === IssueStatus.OPEN &&
      event.databaseEntity.status !== IssueStatus.OPEN
    ) {
      this.sendIssueNotification(
        event.entity as Issue,
        Notification.ISSUE_REOPENED
      );
    }
  }
}
