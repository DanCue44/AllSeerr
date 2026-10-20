import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import lowercaseAllseerrName from '@server/lib/settings/migrations/0013_lowercase_allseerr_name';

const settingsWith = (title: string, senderName: string): any => ({
  main: { applicationTitle: title },
  notifications: { agents: { email: { options: { senderName } } } },
  migrations: [],
});

describe('0013_lowercase_allseerr_name', () => {
  it('moves the old default title and sender name to the new spelling', () => {
    const settings: any = lowercaseAllseerrName(
      settingsWith('AllSeerr', 'AllSeerr')
    );

    assert.equal(settings.main.applicationTitle, 'Allseerr');
    assert.equal(
      settings.notifications.agents.email.options.senderName,
      'Allseerr'
    );
    assert.deepEqual(settings.migrations, ['0013_lowercase_allseerr_name']);
  });

  it('keeps a title and sender name the admin chose', () => {
    const settings: any = lowercaseAllseerrName(
      settingsWith('Family Requests', 'Media Bot')
    );

    assert.equal(settings.main.applicationTitle, 'Family Requests');
    assert.equal(
      settings.notifications.agents.email.options.senderName,
      'Media Bot'
    );
  });

  it('runs only once', () => {
    const once: any = lowercaseAllseerrName(
      settingsWith('AllSeerr', 'AllSeerr')
    );
    once.main.applicationTitle = 'AllSeerr';

    const twice: any = lowercaseAllseerrName(once);

    assert.equal(twice.main.applicationTitle, 'AllSeerr');
    assert.equal(twice.migrations.length, 1);
  });
});
