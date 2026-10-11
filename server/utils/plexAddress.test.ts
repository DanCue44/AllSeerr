import {
  looksLikePlexUrl,
  parsePlexAddress,
  PlexAddressError,
  plexAddressUrl,
} from '@server/utils/plexAddress';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('parsePlexAddress', () => {
  it('reads an https URL without a port as port 443', () => {
    assert.deepEqual(
      parsePlexAddress({ ip: 'https://plex.example.com', port: 32400 }),
      { ip: 'plex.example.com', port: 443, useSsl: true }
    );
  });

  it('reads an http URL with a port', () => {
    assert.deepEqual(
      parsePlexAddress({
        ip: 'http://192.168.1.5:32400',
        port: 1,
        useSsl: true,
      }),
      { ip: '192.168.1.5', port: 32400, useSsl: false }
    );
  });

  it('reads an http URL without a port as port 80', () => {
    assert.deepEqual(parsePlexAddress({ ip: 'http://plex.local/' }), {
      ip: 'plex.local',
      port: 80,
      useSsl: false,
    });
  });

  it('reads host:port and keeps the SSL setting', () => {
    assert.deepEqual(
      parsePlexAddress({ ip: 'plex.local:32401', port: 32400, useSsl: true }),
      { ip: 'plex.local', port: 32401, useSsl: true }
    );
  });

  it('keeps a plain hostname with the separate fields', () => {
    assert.deepEqual(
      parsePlexAddress({ ip: ' plex.local ', port: '32400', useSsl: false }),
      { ip: 'plex.local', port: 32400, useSsl: false }
    );
  });

  it('accepts IPv6 addresses, bare and in a URL', () => {
    assert.deepEqual(parsePlexAddress({ ip: 'fe80::1', port: 32400 }), {
      ip: 'fe80::1',
      port: 32400,
      useSsl: false,
    });
    assert.deepEqual(parsePlexAddress({ ip: 'http://[fe80::1]:32400' }), {
      ip: 'fe80::1',
      port: 32400,
      useSsl: false,
    });
  });

  it('ignores a query string and a trailing slash', () => {
    assert.deepEqual(
      parsePlexAddress({ ip: 'https://plex.example.com/?foo=bar' }),
      { ip: 'plex.example.com', port: 443, useSsl: true }
    );
  });

  it('rejects a sub path with a clear message', () => {
    assert.throws(
      () => parsePlexAddress({ ip: 'https://example.com/plex' }),
      (e: Error) => e instanceof PlexAddressError && /sub path/.test(e.message)
    );
  });

  it('rejects other protocols, bad ports and empty input', () => {
    assert.throws(
      () => parsePlexAddress({ ip: 'ftp://plex.local' }),
      PlexAddressError
    );
    assert.throws(
      () => parsePlexAddress({ ip: 'plex.local:99999' }),
      PlexAddressError
    );
    assert.throws(
      () => parsePlexAddress({ ip: 'plex.local', port: 'abc' }),
      PlexAddressError
    );
    assert.throws(() => parsePlexAddress({ ip: '  ' }), PlexAddressError);
  });
});

describe('looksLikePlexUrl', () => {
  it('tells URLs from plain hosts', () => {
    assert.equal(looksLikePlexUrl('https://plex.example.com'), true);
    assert.equal(looksLikePlexUrl('plex.local:32400'), true);
    assert.equal(looksLikePlexUrl('example.com/plex'), true);
    assert.equal(looksLikePlexUrl('plex.local'), false);
    assert.equal(looksLikePlexUrl('192.168.1.5'), false);
    assert.equal(looksLikePlexUrl('fe80::1'), false);
  });
});

describe('plexAddressUrl', () => {
  it('builds the URL and brackets IPv6 hosts', () => {
    assert.equal(
      plexAddressUrl({ ip: 'plex.local', port: 32400, useSsl: false }),
      'http://plex.local:32400'
    );
    assert.equal(
      plexAddressUrl({ ip: 'fe80::1', port: 443, useSsl: true }),
      'https://[fe80::1]:443'
    );
  });
});
