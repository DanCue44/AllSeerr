import logger from '@server/logger';
import { settleBackgroundTasks } from '@server/utils/backgroundTasks';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { after, before } from 'node:test';
import { Test } from 'supertest';

// supertest serves the app over a real loopback socket, so only external hosts
// can be refused
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

const blocked = new Set<string>();

function stripPort(host: string): string {
  const bracketed = host.match(/^\[(.+)\]/);
  if (bracketed) {
    return bracketed[1];
  }

  const parts = host.split(':');
  return parts.length === 2 ? parts[0] : host;
}

function hostnameOf(args: unknown[]): string {
  const [first, second] = args;
  const fromUrl =
    typeof first === 'string' || first instanceof URL
      ? new URL(String(first)).hostname
      : undefined;

  const options = (fromUrl !== undefined ? second : first) as
    | { hostname?: string; host?: string }
    | undefined;
  const fromOptions =
    typeof options === 'object' && options !== null
      ? (options.hostname ??
        (options.host ? stripPort(options.host) : undefined))
      : undefined;

  return stripPort(fromOptions ?? fromUrl ?? 'localhost');
}

function blockOutboundRequests(
  mod: typeof http | typeof https,
  scheme: string
) {
  // get() calls the module's internal request(), not the exported one
  for (const name of ['request', 'get'] as const) {
    const original = mod[name] as (...args: unknown[]) => unknown;

    mod[name] = ((...args: unknown[]) => {
      const hostname = hostnameOf(args);

      if (!LOOPBACK.has(hostname)) {
        const target = `${scheme}//${hostname}`;
        blocked.add(target);
        throw new Error(
          `Blocked outbound request to ${target}. Stub the API client this test uses, or set ALLOW_NETWORK=true.`
        );
      }

      return original(...args);
    }) as typeof mod.request;
  }
}

if (process.env.ALLOW_NETWORK != 'true') {
  blockOutboundRequests(http, 'http:');
  blockOutboundRequests(https, 'https:');
}

// supertest serves an app on a port picked by the OS on every interface, then
// connects to 127.0.0.1. On macOS another process can bind 127.0.0.1 to the
// same port, and that more specific socket takes the connection, so a request
// lands in another test file's app (401s, resets and timeouts). Binding the
// app to 127.0.0.1 makes its own socket the most specific one.
type SupertestInternals = {
  url: string;
  _server?: http.Server;
  _listening?: Promise<void>;
  _path?: string;
};

const supertestProto = Test.prototype as unknown as SupertestInternals & {
  serverAddress(app: http.Server, path: string): string;
  end(fn?: unknown): unknown;
};
const supertestEnd = supertestProto.end;

supertestProto.serverAddress = function (
  this: SupertestInternals,
  app: http.Server,
  path: string
) {
  const address = app.address() as AddressInfo | null;
  if (address) {
    return `http://127.0.0.1:${address.port}${path}`;
  }

  const server = app.listen(0, '127.0.0.1');
  this._server = server;
  this._path = path;
  this._listening = new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  // The port is only known once the server listens, see end(); the host
  // and path are already right for the agent's cookies
  return `http://127.0.0.1${path}`;
};

supertestProto.end = function (this: SupertestInternals, fn?: unknown) {
  const listening = this._listening;
  if (!listening) {
    return supertestEnd.call(this, fn);
  }

  this._listening = undefined;
  listening.then(
    () => {
      const { port } = this._server?.address() as AddressInfo;
      this.url = `http://127.0.0.1:${port}${this._path}`;
      supertestEnd.call(this, fn);
    },
    () => supertestEnd.call(this, fn)
  );
  return this;
};

before(() => {
  if (process.env.VERBOSE != 'true') logger.silent = true;
});

after(async () => {
  // detached work that is still running could reach the network later
  await settleBackgroundTasks();

  if (process.env.VERBOSE != 'true') logger.silent = false;

  // callers that swallow the error would otherwise leave the suite green
  if (blocked.size) {
    throw new Error(
      `Test reached the network: ${[...blocked].join(', ')}. Stub the API client this test uses.`
    );
  }
});
