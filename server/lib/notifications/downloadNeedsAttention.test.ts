import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import { ALL_NOTIFICATIONS } from '@server/entity/UserSettings';
import {
  getAdminPermission,
  hasNotificationType,
  Notification,
} from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import EmailAgent from '@server/lib/notifications/agents/email';
import PushoverAgent from '@server/lib/notifications/agents/pushover';
import WebPushAgent from '@server/lib/notifications/agents/webpush';
import { Permission } from '@server/lib/permissions';
import type { NotificationAgentPushover } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import enableDownloadAlerts from '@server/lib/settings/migrations/0010_enable_download_alerts';
import { buildStuckBookNotification } from '@server/lib/stuckBookDownloads';
import axios from 'axios';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

const posts: { url: string; body: Record<string, unknown> }[] = [];
mock.method(
  axios,
  'post',
  async (url: string, body: Record<string, unknown>) => {
    posts.push({ url, body });
    return { data: {} };
  }
);

const queueLink = buildStuckBookNotification({
  title: 'A Field of Paper Birds',
  format: 'ebook',
  authorName: 'Sam Sample',
  statusMessage: 'Rejected: import matched another book',
  requesters: [],
  queueUrl: 'https://chaptarr.example.com/activity/queue',
});

const bookLink = buildStuckBookNotification({
  title: 'The Lantern Keeper',
  format: 'audiobook',
  authorName: 'Jane Example',
  statusMessage: 'No supported audio or ebook files were found in /books',
  media: new Media({ mediaType: MediaType.BOOK, olId: 'OL900001W' }),
  requesters: ['friend'],
  queueUrl: 'https://chaptarr.example.com/activity/queue',
});

type PayloadBuilder<T> = {
  getNotificationPayload: (
    type: Notification,
    payload: NotificationPayload
  ) => T;
};

const pushoverSettings = (types: number): NotificationAgentPushover => ({
  enabled: true,
  embedPoster: false,
  types,
  options: { accessToken: 'app-token', userToken: 'user-token', sound: '' },
});

beforeEach(() => {
  posts.length = 0;
  getSettings().main.applicationUrl = 'https://allseerr.example.com';
  getSettings().main.applicationTitle = 'AllSeerr';
});

describe('Download Needs Attention notification type', () => {
  it('takes the next free bit and is for admins only', () => {
    assert.equal(Notification.DOWNLOAD_NEEDS_ATTENTION, 1048576);
    assert.equal(
      Notification.DOWNLOAD_NEEDS_ATTENTION,
      Notification.SCAN_FAILURE * 2
    );
    assert.equal(
      getAdminPermission(Notification.DOWNLOAD_NEEDS_ATTENTION),
      Permission.ADMIN
    );
  });

  it('is on for users with the default email and web push types', () => {
    assert.ok(
      hasNotificationType(
        Notification.DOWNLOAD_NEEDS_ATTENTION,
        ALL_NOTIFICATIONS
      )
    );
    assert.ok(
      !hasNotificationType(
        Notification.DOWNLOAD_NEEDS_ATTENTION,
        Notification.SCAN_FAILURE
      )
    );
  });
});

describe('Download Needs Attention in the agents', () => {
  it('is sent by Pushover when its type is on, with a link', async () => {
    const agent = new PushoverAgent(
      pushoverSettings(Notification.DOWNLOAD_NEEDS_ATTENTION)
    );
    await agent.send(Notification.DOWNLOAD_NEEDS_ATTENTION, {
      ...queueLink,
      notifyAdmin: false,
    });

    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.title, 'Book Download Needs Attention');
    assert.match(
      String(posts[0].body.message),
      /A Field of Paper Birds \(Ebook\) by Sam Sample: Rejected/
    );
    assert.equal(
      posts[0].body.url,
      'https://chaptarr.example.com/activity/queue'
    );
    assert.equal(posts[0].body.url_title, 'Open Chaptarr');
  });

  it('is not sent by Pushover when its type is off', async () => {
    const agent = new PushoverAgent(
      pushoverSettings(Notification.SCAN_FAILURE)
    );
    await agent.send(Notification.DOWNLOAD_NEEDS_ATTENTION, {
      ...queueLink,
      notifyAdmin: false,
    });

    assert.equal(posts.length, 0);
  });

  it('links Pushover to the book page when the book is known', async () => {
    const agent = new PushoverAgent(
      pushoverSettings(Notification.DOWNLOAD_NEEDS_ATTENTION)
    );
    await agent.send(Notification.DOWNLOAD_NEEDS_ATTENTION, {
      ...bookLink,
      notifyAdmin: false,
    });

    assert.equal(
      posts[0].body.url,
      'https://allseerr.example.com/book/OL900001W'
    );
    assert.match(String(posts[0].body.message), /Requested By:<\/b> friend/);
  });

  it('builds a web push with the message and link', () => {
    const agent = new WebPushAgent() as unknown as PayloadBuilder<{
      subject: string;
      message?: string;
      actionUrl?: string;
      actionUrlTitle?: string;
    }>;

    const toQueue = agent.getNotificationPayload(
      Notification.DOWNLOAD_NEEDS_ATTENTION,
      queueLink
    );
    assert.equal(toQueue.subject, 'A Field of Paper Birds (Ebook)');
    assert.equal(toQueue.message, queueLink.message);
    assert.equal(
      toQueue.actionUrl,
      'https://chaptarr.example.com/activity/queue'
    );
    assert.equal(toQueue.actionUrlTitle, 'Open Chaptarr');

    const toBook = agent.getNotificationPayload(
      Notification.DOWNLOAD_NEEDS_ATTENTION,
      bookLink
    );
    assert.equal(toBook.actionUrl, '/book/OL900001W');
    assert.equal(toBook.actionUrlTitle, 'View Media');
  });

  it('builds an admin email with the message and link', () => {
    const agent = new EmailAgent() as unknown as {
      buildMessage: (
        type: Notification,
        payload: NotificationPayload,
        recipientEmail: string
      ) => { locals: Record<string, unknown> };
    };

    const toQueue = agent.buildMessage(
      Notification.DOWNLOAD_NEEDS_ATTENTION,
      queueLink,
      'admin@example.com'
    );
    assert.equal(toQueue.locals.event, 'Book Download Needs Attention');
    assert.equal(toQueue.locals.mediaName, 'A Field of Paper Birds (Ebook)');
    assert.equal(toQueue.locals.body, queueLink.message);
    assert.equal(
      toQueue.locals.actionUrl,
      'https://chaptarr.example.com/activity/queue'
    );
    assert.equal(toQueue.locals.actionLabel, 'Open Chaptarr');

    const toBook = agent.buildMessage(
      Notification.DOWNLOAD_NEEDS_ATTENTION,
      bookLink,
      'admin@example.com'
    );
    assert.equal(
      toBook.locals.actionUrl,
      'https://allseerr.example.com/book/OL900001W'
    );
    assert.deepEqual(toBook.locals.mediaExtra, [
      { name: 'Requested By', value: 'friend' },
    ]);

    // Scan failures still link to the settings
    const scan = agent.buildMessage(
      Notification.SCAN_FAILURE,
      {
        event: 'Scans Failing',
        subject: 'Plex scans are failing',
        actionPath: '/settings/plex',
        notifySystem: true,
        notifyAdmin: true,
      },
      'admin@example.com'
    );
    assert.equal(
      scan.locals.actionUrl,
      'https://allseerr.example.com/settings/plex'
    );
    assert.equal(scan.locals.actionLabel, 'Open AllSeerr Settings');
  });
});

describe('0010_enable_download_alerts', () => {
  it('turns the alerts on for agents that send failure alerts, once', () => {
    const migrated = enableDownloadAlerts({
      notifications: {
        agents: {
          pushover: { enabled: true, types: Notification.MEDIA_FAILED | 2 },
          discord: { enabled: true, types: Notification.SCAN_FAILURE },
          slack: { enabled: true, types: Notification.MEDIA_PENDING },
          webpush: { enabled: true },
        },
      },
      migrations: [],
    });
    const agents = (migrated.notifications.agents ?? {}) as unknown as Record<
      string,
      { types?: number }
    >;

    assert.equal(
      agents.pushover.types,
      Notification.MEDIA_FAILED | 2 | Notification.DOWNLOAD_NEEDS_ATTENTION
    );
    assert.equal(
      agents.discord.types,
      Notification.SCAN_FAILURE | Notification.DOWNLOAD_NEEDS_ATTENTION
    );
    assert.equal(agents.slack.types, Notification.MEDIA_PENDING);
    assert.equal(agents.webpush.types, undefined);
    assert.deepEqual(migrated.migrations, ['0010_enable_download_alerts']);

    // An admin who turns them off afterwards keeps them off
    agents.pushover.types = Notification.MEDIA_FAILED;
    const again = enableDownloadAlerts(structuredClone(migrated));
    assert.equal(
      (
        again.notifications.agents as unknown as Record<
          string,
          { types: number }
        >
      ).pushover.types,
      Notification.MEDIA_FAILED
    );
  });

  it('copes with settings without notifications', () => {
    const migrated = enableDownloadAlerts({});
    assert.deepEqual(migrated.migrations, ['0010_enable_download_alerts']);
  });
});
