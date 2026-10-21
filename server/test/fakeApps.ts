import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Stand-ins for Audiobookshelf, Kavita and Komga that keep their accounts
 * in memory and answer the admin calls Allseerr makes, shaped like the real
 * apps' answers
 */

export interface FakeApp {
  url: string;
  close(): Promise<void>;
  calls: { method: string; path: string; body: unknown }[];
}

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.statusCode = status;
  if (body !== undefined) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } else {
    res.end();
  }
};

const startFake = async (
  handle: (
    req: IncomingMessage,
    url: URL,
    body: unknown
  ) => { status: number; body?: unknown }
): Promise<FakeApp> => {
  const calls: FakeApp['calls'] = [];
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const body = await readBody(req);
    calls.push({ method: req.method ?? 'GET', path: url.pathname, body });
    const { status, body: responseBody } = handle(req, url, body);
    send(res, status, responseBody);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};

export interface FakeAbsUser {
  id: string;
  username: string;
  email: string | null;
  type: string;
  isActive: boolean;
  password?: string;
  permissions: Record<string, unknown>;
}

export const startFakeAudiobookshelf = async (apiKey: string) => {
  const users: FakeAbsUser[] = [
    {
      id: 'root',
      username: 'root',
      email: null,
      type: 'root',
      isActive: true,
      permissions: {},
    },
  ];
  let next = 1;
  const app = await startFake((req, url, body) => {
    if (url.pathname === '/status') {
      return { status: 200, body: { serverVersion: '2.37.1' } };
    }
    if (req.headers.authorization !== `Bearer ${apiKey}`) {
      return { status: 401 };
    }

    const b = body as Record<string, unknown>;
    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);

    if (url.pathname === '/api/me') {
      return { status: 200, body: { id: 'root', type: 'root' } };
    }
    if (url.pathname === '/api/libraries') {
      return {
        status: 200,
        body: {
          libraries: [
            { id: 'lib-audio', name: 'Audiobooks' },
            { id: 'lib-ebooks', name: 'Ebooks' },
          ],
        },
      };
    }
    if (url.pathname === '/api/users' && req.method === 'GET') {
      return { status: 200, body: { users } };
    }
    if (url.pathname === '/api/users' && req.method === 'POST') {
      if (users.some((u) => u.username === b.username)) {
        return { status: 400, body: 'Username already taken' };
      }
      const user: FakeAbsUser = {
        id: `abs-${next++}`,
        username: String(b.username),
        email: (b.email as string) ?? null,
        type: String(b.type ?? 'user'),
        isActive: !!b.isActive,
        password: String(b.password),
        permissions: {
          ...(b.permissions as Record<string, unknown>),
          librariesAccessible: b.librariesAccessible,
        },
      };
      users.push(user);
      return { status: 200, body: { user } };
    }
    if (userMatch && req.method === 'PATCH') {
      const user = users.find((u) => u.id === userMatch[1]);
      if (!user) {
        return { status: 404 };
      }
      if (user.type === 'root') {
        return { status: 403 };
      }
      if (b.isActive !== undefined) {
        user.isActive = !!b.isActive;
      }
      if (typeof b.password === 'string') {
        user.password = b.password;
      }
      if (b.permissions) {
        user.permissions = b.permissions as Record<string, unknown>;
      }
      return { status: 200, body: { success: true } };
    }
    if (userMatch && req.method === 'DELETE') {
      const index = users.findIndex((u) => u.id === userMatch[1]);
      if (index < 0) {
        return { status: 404 };
      }
      users.splice(index, 1);
      return { status: 200, body: { success: true } };
    }

    return { status: 404 };
  });

  return { ...app, users };
};

export interface FakeKavitaMember {
  id: number;
  username: string;
  email: string;
  isPending: boolean;
  roles: string[];
  libraries: { id: number; name: string }[];
  ageRestriction: { ageRating: number; includeUnknowns: boolean };
  identityProvider: number;
  password?: string;
  inviteToken?: string;
}

export const startFakeKavita = async (apiKey: string) => {
  const libraries = [
    { id: 1, name: 'Comics' },
    { id: 2, name: 'Manga' },
  ];
  const members: FakeKavitaMember[] = [
    {
      id: 1,
      username: 'admin',
      email: 'admin@example.com',
      isPending: false,
      roles: ['Admin'],
      libraries,
      ageRestriction: { ageRating: -1, includeUnknowns: true },
      identityProvider: 0,
    },
  ];
  let next = 2;
  let tokens = 0;
  const validTokens = new Set<string>();

  const app = await startFake((req, url, body) => {
    const b = body as Record<string, unknown>;

    if (url.pathname === '/api/Plugin/authenticate' && req.method === 'POST') {
      if (url.searchParams.get('apiKey') !== apiKey) {
        return { status: 401 };
      }
      const token = `token-${++tokens}`;
      validTokens.add(token);
      return { status: 200, body: { username: 'admin', token } };
    }
    if (url.pathname === '/api/Account/confirm-email') {
      const member = members.find((m) => m.email === b.email);
      if (!member || member.inviteToken !== b.token) {
        return { status: 400, body: 'invalid-email-confirmation' };
      }
      member.username = String(b.username);
      member.password = String(b.password);
      member.isPending = false;
      member.inviteToken = undefined;
      return { status: 200, body: { username: member.username } };
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !validTokens.has(token)) {
      return { status: 401 };
    }

    if (url.pathname === '/api/Server/server-info-slim') {
      return { status: 200, body: { kavitaVersion: '0.9.1.4' } };
    }
    if (url.pathname === '/api/Library/libraries') {
      return { status: 200, body: libraries };
    }
    if (url.pathname === '/api/Users' && req.method === 'GET') {
      return { status: 200, body: members };
    }
    if (url.pathname === '/api/Account/invite') {
      if (members.some((m) => m.email === b.email)) {
        return { status: 400, body: 'user-already-invited' };
      }
      const inviteToken = `invite-${next}`;
      members.push({
        id: next++,
        username: String(b.email),
        email: String(b.email),
        isPending: true,
        roles: [...(b.roles as string[]), 'Pleb'],
        libraries: [],
        ageRestriction: b.ageRestriction as FakeKavitaMember['ageRestriction'],
        identityProvider: 0,
        inviteToken,
      });
      return {
        status: 200,
        body: {
          emailLink: `http://kavita/registration/confirm-email?token=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(String(b.email))}`,
          emailSent: false,
        },
      };
    }
    if (url.pathname === '/api/Account/update') {
      const member = members.find((m) => m.id === b.userId);
      if (!member) {
        return { status: 400 };
      }
      member.roles = [...(b.roles as string[]), 'Pleb'];
      member.libraries = libraries.filter((l) =>
        (b.libraries as number[]).includes(l.id)
      );
      member.ageRestriction =
        b.ageRestriction as FakeKavitaMember['ageRestriction'];
      member.identityProvider = b.identityProvider as number;
      return { status: 200 };
    }
    if (url.pathname === '/api/Account/reset-password') {
      const member = members.find((m) => m.username === b.userName);
      if (member) {
        member.password = String(b.password);
      }
      return { status: 200 };
    }
    if (url.pathname === '/api/Users/delete-user' && req.method === 'DELETE') {
      const index = members.findIndex(
        (m) => m.username === url.searchParams.get('username')
      );
      if (index < 0) {
        return { status: 400 };
      }
      members.splice(index, 1);
      return { status: 200 };
    }

    return { status: 404 };
  });

  return {
    ...app,
    members,
    expireTokens: () => validTokens.clear(),
  };
};

export interface FakeKomgaUser {
  id: string;
  email: string;
  roles: string[];
  sharedAllLibraries: boolean;
  sharedLibrariesIds: string[];
  ageRestriction?: { age: number; restriction: string };
  password?: string;
}

export const startFakeKomga = async (apiKey: string) => {
  const users: FakeKomgaUser[] = [
    {
      id: 'admin',
      email: 'admin@example.com',
      roles: ['ADMIN', 'FILE_DOWNLOAD', 'PAGE_STREAMING'],
      sharedAllLibraries: true,
      sharedLibrariesIds: [],
    },
  ];
  let next = 1;

  const app = await startFake((req, url, body) => {
    if (req.headers['x-api-key'] !== apiKey) {
      return { status: 401 };
    }

    const b = body as Record<string, unknown>;
    const userMatch = url.pathname.match(/^\/api\/v2\/users\/([^/]+)$/);
    const passwordMatch = url.pathname.match(
      /^\/api\/v2\/users\/([^/]+)\/password$/
    );

    if (url.pathname === '/api/v2/users/me') {
      return { status: 200, body: users[0] };
    }
    if (url.pathname === '/actuator/info') {
      return { status: 200, body: { build: { version: '1.29.1' } } };
    }
    if (url.pathname === '/api/v1/libraries') {
      return {
        status: 200,
        body: [
          { id: 'kc', name: 'Comics' },
          { id: 'km', name: 'Manga' },
        ],
      };
    }
    if (url.pathname === '/api/v2/users' && req.method === 'GET') {
      return { status: 200, body: users };
    }
    if (url.pathname === '/api/v2/users' && req.method === 'POST') {
      if (users.some((u) => u.email === b.email)) {
        return { status: 400 };
      }
      const shared = b.sharedLibraries as {
        all: boolean;
        libraryIds: string[];
      };
      const user: FakeKomgaUser = {
        id: `komga-${next++}`,
        email: String(b.email),
        roles: b.roles as string[],
        sharedAllLibraries: shared.all,
        sharedLibrariesIds: shared.libraryIds,
        ageRestriction: b.ageRestriction as FakeKomgaUser['ageRestriction'],
        password: String(b.password),
      };
      users.push(user);
      return { status: 201, body: user };
    }
    if (passwordMatch && req.method === 'PATCH') {
      const user = users.find((u) => u.id === passwordMatch[1]);
      if (!user) {
        return { status: 404 };
      }
      user.password = String(b.password);
      return { status: 204 };
    }
    if (userMatch && req.method === 'PATCH') {
      const user = users.find((u) => u.id === userMatch[1]);
      if (!user) {
        return { status: 404 };
      }
      const shared = b.sharedLibraries as {
        all: boolean;
        libraryIds: string[];
      };
      user.roles = b.roles as string[];
      user.sharedAllLibraries = shared.all;
      user.sharedLibrariesIds = shared.libraryIds;
      user.ageRestriction = b.ageRestriction as FakeKomgaUser['ageRestriction'];
      return { status: 204 };
    }
    if (userMatch && req.method === 'DELETE') {
      const index = users.findIndex((u) => u.id === userMatch[1]);
      if (index < 0) {
        return { status: 404 };
      }
      users.splice(index, 1);
      return { status: 204 };
    }

    return { status: 404 };
  });

  return { ...app, users };
};
