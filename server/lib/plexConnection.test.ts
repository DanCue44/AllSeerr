import type { PlexAddress, PlexProbe } from '@server/lib/plexConnection';
import {
  alternativeAddresses,
  explainPlexConnection,
  isCloudflareIp,
  resolvesToCloudflare,
  testPlexConnection,
} from '@server/lib/plexConnection';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const identity = { machineId: 'abc123', name: 'Main Server' };

// A timeout the way axios reports it, with an empty message
const timeoutError = (url: string) =>
  Object.assign(new Error(''), {
    code: 'ETIMEDOUT',
    config: { baseURL: url, url: '/' },
  });

const statusError = (url: string, status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
    config: { baseURL: url, url: '/' },
  });

const urlOf = ({ ip, port, useSsl }: PlexAddress) =>
  `${useSsl ? 'https' : 'http'}://${ip}:${port}`;

// Answers only on the given URLs, like a host behind Cloudflare and a
// reverse proxy
const probeAnswering =
  (working: string[], tried: string[] = []): PlexProbe =>
  async (address) => {
    const url = urlOf(address);
    tried.push(url);

    if (working.includes(url)) {
      return identity;
    }

    throw timeoutError(url);
  };

const cloudflareResolver = async () => ['104.21.32.1', '2606:4700:3030::1'];
const homeResolver = async () => ['203.0.113.10'];

describe('isCloudflareIp', () => {
  it('knows Cloudflare ranges', () => {
    assert.equal(isCloudflareIp('104.21.32.1'), true);
    assert.equal(isCloudflareIp('172.67.10.10'), true);
    assert.equal(isCloudflareIp('2606:4700:3030::6815:2001'), true);
    assert.equal(isCloudflareIp('192.168.1.5'), false);
    assert.equal(isCloudflareIp('203.0.113.10'), false);
    assert.equal(isCloudflareIp('2001:db8::1'), false);
    assert.equal(isCloudflareIp('not-an-ip'), false);
  });

  it('resolves hostnames, and a failed lookup is not Cloudflare', async () => {
    assert.equal(
      await resolvesToCloudflare('plex.example.com', cloudflareResolver),
      true
    );
    assert.equal(
      await resolvesToCloudflare('plex.example.com', homeResolver),
      false
    );
    assert.equal(
      await resolvesToCloudflare('plex.example.com', async () => {
        throw new Error('ENOTFOUND');
      }),
      false
    );
    // IP addresses are checked without a lookup
    assert.equal(
      await resolvesToCloudflare('104.16.0.1', async () => {
        throw new Error('no lookup expected');
      }),
      true
    );
  });
});

describe('alternativeAddresses', () => {
  it('tries https on 443, http on 80, then the other protocol', () => {
    assert.deepEqual(
      alternativeAddresses({
        ip: 'plex.example.com',
        port: 32400,
        useSsl: false,
      }),
      [
        { ip: 'plex.example.com', port: 443, useSsl: true },
        { ip: 'plex.example.com', port: 80, useSsl: false },
        { ip: 'plex.example.com', port: 32400, useSsl: true },
      ]
    );
  });

  it('leaves out the address that was already tried', () => {
    assert.deepEqual(
      alternativeAddresses({ ip: 'plex.example.com', port: 443, useSsl: true }),
      [
        { ip: 'plex.example.com', port: 80, useSsl: false },
        { ip: 'plex.example.com', port: 443, useSsl: false },
      ]
    );
  });
});

describe('testPlexConnection', () => {
  it('connects without trying anything else when the address works', async () => {
    const tried: string[] = [];
    const result = await testPlexConnection(
      { ip: '192.168.1.5', port: 32400, useSsl: false },
      {
        probe: probeAnswering(['http://192.168.1.5:32400'], tried),
        resolve: homeResolver,
      }
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.identity, identity);
    assert.deepEqual(tried, ['http://192.168.1.5:32400']);
  });

  it('suggests https on 443 when Cloudflare drops port 32400', async () => {
    const tried: string[] = [];
    const result = await testPlexConnection(
      { ip: 'plex.example.com', port: 32400, useSsl: false },
      {
        probe: probeAnswering(['https://plex.example.com:443'], tried),
        resolve: cloudflareResolver,
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'cloudflare-port');
    assert.equal(
      result.message,
      'Could not reach Plex at http://plex.example.com:32400 (timed out)'
    );
    assert.deepEqual(result.suggestion, {
      ip: 'plex.example.com',
      port: 443,
      useSsl: true,
    });
    assert.deepEqual(tried, [
      'http://plex.example.com:32400',
      'https://plex.example.com:443',
    ]);
    assert.equal(
      explainPlexConnection(result),
      "plex.example.com goes through Cloudflare, which does not pass port 32400. Use https on port 443 (through your reverse proxy) or Plex's local address."
    );
  });

  it('falls back to http on 80 when 443 does not answer', async () => {
    const result = await testPlexConnection(
      { ip: 'plex.example.com', port: 32400, useSsl: false },
      {
        probe: probeAnswering(['http://plex.example.com:80']),
        resolve: homeResolver,
      }
    );

    assert.equal(result.reason, 'nonstandard-port-timeout');
    assert.deepEqual(result.suggestion, {
      ip: 'plex.example.com',
      port: 80,
      useSsl: false,
    });
    assert.deepEqual(
      result.attempts.map((attempt) => attempt.ok),
      [false, true]
    );
  });

  it('has no suggestion when nothing answers', async () => {
    const result = await testPlexConnection(
      { ip: '10.0.0.9', port: 32400, useSsl: false },
      { probe: probeAnswering([]), resolve: homeResolver }
    );

    assert.equal(result.ok, false);
    assert.equal(result.suggestion, undefined);
    // An IP address on a LAN is not a reverse proxy problem
    assert.equal(result.reason, undefined);
    assert.equal(result.attempts.length, 3);
    assert.equal(explainPlexConnection(result), undefined);
  });

  it('does not look elsewhere when Plex turns the token down', async () => {
    const tried: string[] = [];
    const result = await testPlexConnection(
      { ip: 'plex.local', port: 32400, useSsl: false },
      {
        probe: async (address) => {
          tried.push(urlOf(address));
          throw statusError(urlOf(address), 401);
        },
        resolve: homeResolver,
      }
    );

    assert.equal(result.reason, 'unauthorized');
    assert.equal(result.suggestion, undefined);
    assert.deepEqual(tried, ['http://plex.local:32400']);
  });
});
