import { IssueType, getIssueTypeName } from '@server/constants/issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { getMediaNotificationDetails } from '@server/lib/mediaNotificationDetails';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { sortBy } from 'lodash';
import type {
  EntityManager,
  EntitySubscriberInterface,
  InsertEvent,
} from 'typeorm';
import { EventSubscriber } from 'typeorm';

@EventSubscriber()
export class IssueCommentSubscriber implements EntitySubscriberInterface<IssueComment> {
  public listenTo(): typeof IssueComment {
    return IssueComment;
  }

  private async sendIssueCommentNotification(
    manager: EntityManager,
    entity: IssueComment
  ) {
    try {
      const issue = (
        await manager.getRepository(IssueComment).findOneOrFail({
          where: { id: entity.id },
          relations: { issue: { createdBy: true } },
        })
      ).issue;

      const createdBy = await manager.getRepository(User).findOneOrFail({
        where: { id: issue.createdBy.id },
      });

      const media = await manager.getRepository(Media).findOneOrFail({
        where: { id: issue.media.id },
      });

      const { subject, image } = await getMediaNotificationDetails(media);

      const [firstComment] = sortBy(issue.comments, 'id');

      if (entity.id !== firstComment.id) {
        // Send notifications to all issue managers
        notificationManager.sendNotification(Notification.ISSUE_COMMENT, {
          event: `New Comment on ${
            issue.issueType !== IssueType.OTHER
              ? `${getIssueTypeName(issue.issueType, media.mediaType)} `
              : ''
          }Issue`,
          subject,
          message: firstComment.message,
          comment: entity,
          issue,
          media,
          image,
          notifyAdmin: true,
          notifySystem: true,
          notifyUser:
            !createdBy.hasPermission(Permission.MANAGE_ISSUES) &&
            createdBy.id !== entity.user.id
              ? createdBy
              : undefined,
        });
      }
    } catch (e) {
      logger.error(
        'Something went wrong sending issue comment notification(s)',
        {
          label: 'Notifications',
          errorMessage: e.message,
          commentId: entity.id,
        }
      );
    }
  }

  public async afterInsert(event: InsertEvent<IssueComment>): Promise<void> {
    if (!event.entity) {
      return;
    }

    await this.sendIssueCommentNotification(event.manager, event.entity);
  }
}
