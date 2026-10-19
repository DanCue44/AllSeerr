import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getNoBookEndsAppConnectUrl,
  getNoBookEndsConnectUrl,
} from '@server/lib/nobookends';

const params = {
  audiobookshelfUrl: 'https://books.example.com/',
  allseerrUrl: 'https://requests.example.com/',
  apiKey: 'asu_abc-123_xyz',
};

describe('getNoBookEndsAppConnectUrl', () => {
  it("opens the app's own scheme with the key in the fragment", () => {
    const url = getNoBookEndsAppConnectUrl(params);

    assert.equal(
      url,
      'nobookends://connect#abs=https%3A%2F%2Fbooks.example.com&allseerr=https%3A%2F%2Frequests.example.com&key=asu_abc-123_xyz'
    );
  });

  it('carries the same values as the connect link', () => {
    const appUrl = getNoBookEndsAppConnectUrl(params);
    const connectUrl = getNoBookEndsConnectUrl(params);

    assert.ok(connectUrl.startsWith('https://nobookends.com/open/connect#'));
    assert.equal(appUrl.split('#')[1], connectUrl.split('#')[1]);
  });
});
