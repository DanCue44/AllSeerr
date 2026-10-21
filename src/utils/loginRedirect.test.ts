import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  getLoginPath,
  getSafeNextPath,
  rememberLoginNext,
  takeLoginNext,
} from './loginRedirect';

describe('getSafeNextPath', () => {
  it('allows the NoBookEnds pages with their query', () => {
    assert.equal(getSafeNextPath('/nobookends/connect'), '/nobookends/connect');
    assert.equal(
      getSafeNextPath('/nobookends/connect?device=iPhone%2016'),
      '/nobookends/connect?device=iPhone%2016'
    );
    assert.equal(
      getSafeNextPath(['/nobookends/connect', '/settings']),
      '/nobookends/connect'
    );
  });

  it('allows the sign in with Allseerr and invite pages', () => {
    assert.equal(getSafeNextPath('/signin/abc-123'), '/signin/abc-123');
    assert.equal(getSafeNextPath('/invite/Zx_9-a'), '/invite/Zx_9-a');
    assert.equal(getSafeNextPath('/signin'), null);
  });

  it('refuses pages that are not on the allowlist', () => {
    for (const value of [
      '/',
      '/settings',
      '/nobookends',
      '/nobookendsx/connect',
      '/login?next=/nobookends/connect',
    ]) {
      assert.equal(getSafeNextPath(value), null, value);
    }
  });

  it('refuses addresses on other sites', () => {
    for (const value of [
      'https://evil.example.com/nobookends/connect',
      '//evil.example.com/nobookends/connect',
      '/\\evil.example.com/nobookends/connect',
      '\\\\evil.example.com/nobookends/connect',
      'javascript:alert(1)//nobookends/connect',
      'nobookends/connect',
      '/nobookends//evil.example.com',
      '/nobookends/\\evil.example.com',
      '/nobookends/%2F%2Fevil.example.com',
      '/nobookends/%5Cevil.example.com',
    ]) {
      assert.equal(getSafeNextPath(value), null, value);
    }
  });

  it('refuses paths that climb out of the allowlist', () => {
    for (const value of [
      '/nobookends/../settings',
      '/nobookends/%2e%2e/settings',
      '/nobookends/./connect',
    ]) {
      assert.equal(getSafeNextPath(value), null, value);
    }
  });

  it('refuses anything that is not a sensible string', () => {
    for (const value of [
      undefined,
      null,
      42,
      {},
      '',
      '/nobookends/connect\n',
      '/nobookends/connect%00',
      '/nobookends/%E0%A4%A',
      `/nobookends/${'a'.repeat(600)}`,
    ]) {
      assert.equal(getSafeNextPath(value), null, String(value));
    }
  });
});

describe('getLoginPath', () => {
  it('adds the way back only when it is allowed', () => {
    assert.equal(
      getLoginPath('/nobookends/connect?device=Pixel%209'),
      '/login?next=%2Fnobookends%2Fconnect%3Fdevice%3DPixel%25209'
    );
    assert.equal(getLoginPath('/settings'), '/login');
    assert.equal(getLoginPath(undefined), '/login');
  });
});

describe('takeLoginNext', () => {
  const store = new Map<string, string>();
  const globals = globalThis as { window?: unknown };

  globals.window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };

  afterEach(() => store.clear());

  it('prefers the query, then the kept page, then home', () => {
    rememberLoginNext('/nobookends/connect?device=kept');
    assert.equal(
      takeLoginNext('/nobookends/connect?device=query'),
      '/nobookends/connect?device=query'
    );

    rememberLoginNext('/nobookends/connect?device=kept');
    assert.equal(takeLoginNext(undefined), '/nobookends/connect?device=kept');

    // It is forgotten once used
    assert.equal(takeLoginNext(undefined), '/');
  });

  it('never keeps a page that is not allowed', () => {
    rememberLoginNext('https://evil.example.com');
    assert.equal(takeLoginNext('/settings'), '/');
  });
});
