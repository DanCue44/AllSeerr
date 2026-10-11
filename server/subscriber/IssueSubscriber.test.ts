import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import type { MbReleaseGroup } from '@server/api/musicbrainz/interfaces';
import OpenLibrary from '@server/api/openlibrary';
import type { OlSearchDoc, OlWork } from '@server/api/openlibrary/interfaces';
import {
  IssueStatus,
  IssueType,
  getIssueTypeName,
} from '@server/constants/issue';
import { MediaStatus, MediaType } from '@server/constants/media';
import Issue from '@server/entity/Issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { initI18n } from '@server/i18n';
import notificationManager, { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import {
  getMediaPath,
  getPayloadBookFormat,
} from '@server/lib/notifications/agents/agent';
import DiscordAgent from '@server/lib/notifications/agents/discord';
import WebPushAgent from '@server/lib/notifications/agents/webpush';
import { getSettings } from '@server/lib/settings';
import { IssueSubscriber, getIssueExtra } from './IssueSubscriber';

const ALBUM_MBID = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
const WORK_ID = 'OL45804W';

mock.method(
  MusicBrainz.prototype,
  'getAlbum',
  async ({ releaseGroupId }: { releaseGroupId: string }) =>
    ({
      id: releaseGroupId,
      title: 'OK Computer',
      'primary-type': 'Album',
      'first-release-date': '1997-05-21',
      'artist-credit': [
        {
          name: 'Radiohead',
          artist: {
            id: 'a74b1b7f-71a5-4011-9441-d0b5e4122711',
            name: 'Radiohead',
            'sort-name': 'Radiohead',
          },
        },
      ],
    }) as MbReleaseGroup
);
mock.method(
  MusicBrainz.prototype,
  'getArtistWikipediaExtract',
  async () => null
);
mock.method(
  CoverArtArchive.prototype,
  'getFrontCoverUrl',
  async (mbId: string) => `https://coverartarchive.org/release-group/${mbId}`
);
mock.method(
  OpenLibrary.prototype,
  'getWork',
  async (): Promise<OlWork> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    type: { key: '/type/work' },
    covers: [8739161],
    authors: [{ author: { key: '/authors/OL34184A' } }],
  })
);
mock.method(
  OpenLibrary.prototype,
  'getWorkSummary',
  async (): Promise<OlSearchDoc> => ({
    key: `/works/${WORK_ID}`,
    title: 'Fantastic Mr Fox',
    author_name: ['Roald Dahl'],
    author_key: ['OL34184A'],
    first_publish_year: 1970,
  })
);

const sendNotificationMock = mock.method(
  notificationManager,
  'sendNotification',
  () => undefined
).mock;

before(() => {
  initI18n();
});

beforeEach(() => {
  sendNotificationMock.resetCalls();
});

const reporter = new User({
  id: 2,
  username: 'friend',
  email: 'friend@seerr.dev',
  displayName: 'friend',
  permissions: 0,
});

const buildIssue = (media: Media, init: Partial<Issue>): Issue =>
  new Issue({
    id: 7,
    status: IssueStatus.OPEN,
    problemSeason: 0,
    problemEpisode: 0,
    bookFormat: null,
    media,
    createdBy: reporter,
    comments: [
      new IssueComment({ id: 1, user: reporter, message: 'Track 3 skips' }),
    ],
    ...init,
  });

const sendIssueNotification = async (
  issue: Issue,
  type: Notification
): Promise<NotificationPayload> => {
  await (
    new IssueSubscriber() as unknown as {
      sendIssueNotification: (
        entity: Issue,
        type: Notification
      ) => Promise<void>;
    }
  ).sendIssueNotification(issue, type);

  assert.strictEqual(sendNotificationMock.callCount(), 1);
  const [sentType, payload] = sendNotificationMock.calls[0].arguments as [
    Notification,
    NotificationPayload,
  ];
  assert.strictEqual(sentType, type);
  return payload;
};

const album = new Media({
  id: 1,
  mediaType: MediaType.MUSIC,
  mbId: ALBUM_MBID,
  status: MediaStatus.AVAILABLE,
});

const book = new Media({
  id: 2,
  mediaType: MediaType.BOOK,
  olId: WORK_ID,
  status: MediaStatus.AVAILABLE,
  statusAudio: MediaStatus.AVAILABLE,
});

describe('issue notifications for music and books', () => {
  it('names the album, its cover and the affected track', async () => {
    const payload = await sendIssueNotification(
      buildIssue(album, {
        issueType: IssueType.MISSING_CONTENT,
        problemSeason: 2,
        problemEpisode: 3,
      }),
      Notification.ISSUE_CREATED
    );

    assert.strictEqual(payload.event, 'New Missing Tracks Issue Reported');
    assert.strictEqual(payload.subject, 'OK Computer by Radiohead (1997)');
    assert.strictEqual(
      payload.image,
      `https://coverartarchive.org/release-group/${ALBUM_MBID}`
    );
    assert.strictEqual(payload.message, 'Track 3 skips');
    assert.deepStrictEqual(payload.extra, [
      { name: 'Affected Track', value: 'Disc 2, Track 3' },
    ]);
    assert.ok(payload.media);
    assert.strictEqual(getMediaPath(payload.media), `/music/${ALBUM_MBID}`);
  });

  it('names the book, its cover and the affected format', async () => {
    const payload = await sendIssueNotification(
      buildIssue(book, {
        issueType: IssueType.WRONG_CONTENT,
        bookFormat: 'audiobook',
        status: IssueStatus.RESOLVED,
      }),
      Notification.ISSUE_RESOLVED
    );

    assert.strictEqual(payload.event, 'Wrong Edition Issue Resolved');
    assert.strictEqual(
      payload.subject,
      'Fantastic Mr Fox by Roald Dahl (1970)'
    );
    assert.strictEqual(
      payload.image,
      'https://covers.openlibrary.org/b/id/8739161-L.jpg'
    );
    assert.deepStrictEqual(payload.extra, [
      { name: 'Format', value: 'Audiobook' },
    ]);
    assert.ok(payload.media);
    assert.strictEqual(getMediaPath(payload.media), `/book/${WORK_ID}`);
    assert.strictEqual(getPayloadBookFormat(payload), 'audiobook');
  });

  it('builds agent messages with the album issue type and the issue link', async () => {
    getSettings().main.applicationUrl = 'https://seerr.example.com';
    const payload = await sendIssueNotification(
      buildIssue(album, { issueType: IssueType.AUDIO }),
      Notification.ISSUE_CREATED
    );

    const embed = new DiscordAgent().buildEmbed(
      Notification.ISSUE_CREATED,
      payload
    );
    assert.strictEqual(
      embed.title,
      'New Audio Quality Issue Reported: OK Computer by Radiohead (1997)'
    );
    assert.strictEqual(embed.url, 'https://seerr.example.com/issues/7');
    assert.ok(
      (embed.fields ?? []).some(
        (field) =>
          field.name === 'Issue Type' && field.value === 'Audio Quality'
      )
    );

    const push = (
      new WebPushAgent() as unknown as {
        getNotificationPayload: (
          type: Notification,
          payload: NotificationPayload
        ) => { message?: string; actionUrl?: string };
      }
    ).getNotificationPayload(Notification.ISSUE_CREATED, payload);
    assert.strictEqual(
      push.message,
      'A new audio quality issue was reported by friend.'
    );
    assert.strictEqual(push.actionUrl, '/issues/7');
  });

  it('leaves movie and series issue types unchanged', () => {
    assert.strictEqual(
      getIssueTypeName(IssueType.AUDIO, MediaType.MOVIE),
      'Audio'
    );
    assert.strictEqual(
      getIssueTypeName(IssueType.SUBTITLES, MediaType.TV),
      'Subtitle'
    );
    assert.strictEqual(
      getIssueTypeName(IssueType.MISSING_CONTENT, MediaType.BOOK),
      'Missing Pages'
    );
    assert.deepStrictEqual(
      getIssueExtra(
        buildIssue(new Media({ mediaType: MediaType.TV, tmdbId: 1 }), {
          issueType: IssueType.VIDEO,
          problemSeason: 1,
          problemEpisode: 2,
        })
      ),
      [
        { name: 'Affected Season', value: '1' },
        { name: 'Affected Episode', value: '2' },
      ]
    );
  });
});
