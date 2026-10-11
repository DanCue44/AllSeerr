import type { PlexAddress } from '@server/utils/plexAddress';
import { plexAddressUrl } from '@server/utils/plexAddress';
import { describeRequestError } from '@server/utils/requestError';
import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';

export {
  PlexAddressError,
  parsePlexAddress,
  plexAddressUrl,
} from '@server/utils/plexAddress';
export type { PlexAddress } from '@server/utils/plexAddress';

// Ports Cloudflare proxies. Anything else never reaches the origin.
// https://developers.cloudflare.com/fundamentals/reference/network-ports/
export const CLOUDFLARE_PORTS = new Set([
  80, 443, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096, 8080, 8443, 8880,
]);

// https://www.cloudflare.com/ips/
const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

const cloudflareRanges = new BlockList();
CLOUDFLARE_IPV4.forEach((range) => {
  const [net, prefix] = range.split('/');
  cloudflareRanges.addSubnet(net, Number(prefix), 'ipv4');
});
CLOUDFLARE_IPV6.forEach((range) => {
  const [net, prefix] = range.split('/');
  cloudflareRanges.addSubnet(net, Number(prefix), 'ipv6');
});

export const isCloudflareIp = (ip: string): boolean => {
  const family = isIP(ip);

  if (family === 4) {
    return cloudflareRanges.check(ip, 'ipv4');
  }

  if (family === 6) {
    return cloudflareRanges.check(ip, 'ipv6');
  }

  return false;
};

export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) =>
  (await dns.lookup(host, { all: true })).map((entry) => entry.address);

export const resolvesToCloudflare = async (
  host: string,
  resolve: HostResolver = defaultResolver
): Promise<boolean> => {
  if (isIP(host)) {
    return isCloudflareIp(host);
  }

  try {
    return (await resolve(host)).some(isCloudflareIp);
  } catch {
    return false;
  }
};

export interface PlexServerIdentity {
  machineId: string;
  name: string;
}

// Asks one address for its server identity. Throws when it is not Plex.
export type PlexProbe = (
  address: PlexAddress,
  options: { timeout: number }
) => Promise<PlexServerIdentity>;

export type PlexConnectionReason =
  // The host is behind Cloudflare and the port is one Cloudflare drops
  | 'cloudflare-port'
  // A domain timed out on a port a reverse proxy or CDN rarely serves
  | 'nonstandard-port-timeout'
  // Plex answered but turned the token down
  | 'unauthorized';

export interface PlexConnectionResult {
  ok: boolean;
  address: PlexAddress;
  url: string;
  identity?: PlexServerIdentity;
  // Why the address failed
  message?: string;
  reason?: PlexConnectionReason;
  // An address that did connect, for the admin to choose
  suggestion?: PlexAddress;
  // Every alternative that was tried and how it went
  attempts: { url: string; ok: boolean; message?: string }[];
}

const PRIMARY_TIMEOUT = 10000;
const ALTERNATIVE_TIMEOUT = 5000;

const sameAddress = (a: PlexAddress, b: PlexAddress) =>
  a.ip.toLowerCase() === b.ip.toLowerCase() &&
  a.port === b.port &&
  a.useSsl === b.useSsl;

// Other ways to reach the same host, most likely first: https through a
// reverse proxy, plain http on 80, then the other protocol on the same port.
export const alternativeAddresses = (address: PlexAddress): PlexAddress[] => {
  const candidates: PlexAddress[] = [
    { ip: address.ip, port: 443, useSsl: true },
    { ip: address.ip, port: 80, useSsl: false },
    { ip: address.ip, port: address.port, useSsl: !address.useSsl },
  ];

  return candidates.filter(
    (candidate, index) =>
      !sameAddress(candidate, address) &&
      candidates.findIndex((other) => sameAddress(other, candidate)) === index
  );
};

/**
 * Tests a Plex address. When it cannot be reached, nearby addresses on the
 * same host are tried and the first that works is suggested. Nothing is
 * saved here.
 */
export const testPlexConnection = async (
  address: PlexAddress,
  {
    probe,
    resolve,
    primaryTimeout = PRIMARY_TIMEOUT,
    alternativeTimeout = ALTERNATIVE_TIMEOUT,
  }: {
    probe: PlexProbe;
    resolve?: HostResolver;
    primaryTimeout?: number;
    alternativeTimeout?: number;
  }
): Promise<PlexConnectionResult> => {
  const url = plexAddressUrl(address);

  try {
    const identity = await probe(address, { timeout: primaryTimeout });
    return { ok: true, address, url, identity, attempts: [] };
  } catch (e) {
    const details = describeRequestError(e, { service: 'Plex', url });

    if (details.status === 401) {
      return {
        ok: false,
        address,
        url,
        message: `Plex at ${url} did not accept the Plex token (401). Sign in to AllSeerr with the Plex account that owns the server.`,
        reason: 'unauthorized',
        attempts: [],
      };
    }

    const result: PlexConnectionResult = {
      ok: false,
      address,
      url,
      message: details.message,
      attempts: [],
    };

    const behindCloudflare = await resolvesToCloudflare(address.ip, resolve);

    if (behindCloudflare && !CLOUDFLARE_PORTS.has(address.port)) {
      result.reason = 'cloudflare-port';
    } else if (
      details.timedOut &&
      !isIP(address.ip) &&
      !CLOUDFLARE_PORTS.has(address.port)
    ) {
      result.reason = 'nonstandard-port-timeout';
    }

    for (const candidate of alternativeAddresses(address)) {
      const candidateUrl = plexAddressUrl(candidate);

      try {
        await probe(candidate, { timeout: alternativeTimeout });
        result.attempts.push({ url: candidateUrl, ok: true });
        result.suggestion = candidate;
        break;
      } catch (altError) {
        result.attempts.push({
          url: candidateUrl,
          ok: false,
          message: describeRequestError(altError, {
            service: 'Plex',
            url: candidateUrl,
          }).message,
        });
      }
    }

    return result;
  }
};

// A plain sentence for the API response and logs
export const explainPlexConnection = (
  result: PlexConnectionResult
): string | undefined => {
  const { ip, port } = result.address;

  switch (result.reason) {
    case 'cloudflare-port':
      return `${ip} goes through Cloudflare, which does not pass port ${port}. Use https on port 443 (through your reverse proxy) or Plex's local address.`;
    case 'nonstandard-port-timeout':
      return `${ip} did not answer on port ${port}. If it points to a reverse proxy or a CDN, use https on port 443 or Plex's local address.`;
    default:
      return undefined;
  }
};
