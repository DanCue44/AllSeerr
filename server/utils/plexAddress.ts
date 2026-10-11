// Shared by the server and the settings page, so it has no Node imports

export interface PlexAddress {
  ip: string;
  port: number;
  useSsl: boolean;
}

export class PlexAddressError extends Error {}

// Plex Media Server only answers at the root of a host. Its API and apps do
// not work under a sub path such as https://example.com/plex.
export const PLEX_SUB_PATH_MESSAGE =
  'Plex cannot be reached under a sub path such as /plex. Use the address of the server itself, or a reverse proxy that serves Plex at the root of its own (sub)domain.';

const IPV6 = /^[0-9a-f]*:[0-9a-f:.]*:[0-9a-f.]*$/i;

const ADDRESS =
  /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\[[0-9a-f:.]+\]|[^\s:/?#[\]@]+)(?::(\d*))?(\/[^?#]*)?(?:[?#].*)?$/i;

export const isIpv6 = (host: string): boolean => IPV6.test(host);

// True when the hostname field holds more than a host: a scheme, a port or
// a path
export const looksLikePlexUrl = (input: string): boolean => {
  const value = (input ?? '').trim();

  return (
    !!value &&
    !isIpv6(value) &&
    (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
      /[/?#]/.test(value) ||
      /:\d*$/.test(value))
  );
};

const validPort = (port: number): number => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PlexAddressError('The port must be a number from 1 to 65535.');
  }

  return port;
};

/**
 * Reads the hostname field, which may hold a full URL such as
 * https://plex.example.com or http://192.168.1.5:32400, and splits it into
 * the separate host, port and SSL settings. A plain hostname keeps the port
 * and SSL values it was given. A URL without a port uses the default port of
 * its protocol.
 */
export const parsePlexAddress = ({
  ip,
  port,
  useSsl,
}: {
  ip: string;
  port?: number | string | null;
  useSsl?: boolean | null;
}): PlexAddress => {
  const input = (ip ?? '').trim();

  if (!input) {
    throw new PlexAddressError('A hostname or IP address is required.');
  }

  // A bare IPv6 address is full of colons but holds no port
  if (isIpv6(input)) {
    return { ip: input, port: validPort(Number(port)), useSsl: !!useSsl };
  }

  const match = input.match(ADDRESS);

  if (!match) {
    throw new PlexAddressError(`"${input}" is not a valid address.`);
  }

  const [, rawScheme, rawHost, rawPort, path] = match;
  const scheme = rawScheme?.toLowerCase();

  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new PlexAddressError('Only http and https addresses are supported.');
  }

  if (path && path !== '/') {
    throw new PlexAddressError(PLEX_SUB_PATH_MESSAGE);
  }

  const ssl = scheme ? scheme === 'https' : !!useSsl;
  const parsedPort = rawPort
    ? Number(rawPort)
    : scheme
      ? ssl
        ? 443
        : 80
      : Number(port);

  return {
    ip: rawHost.replace(/^\[(.*)\]$/, '$1').toLowerCase(),
    port: validPort(parsedPort),
    useSsl: ssl,
  };
};

export const plexAddressUrl = ({ ip, port, useSsl }: PlexAddress): string =>
  `${useSsl ? 'https' : 'http'}://${isIpv6(ip) ? `[${ip}]` : ip}:${port}`;
