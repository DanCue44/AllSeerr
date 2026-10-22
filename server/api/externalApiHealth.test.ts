import {
  ServiceUnavailableError,
  assertServiceAvailable,
  clearStaleAnswers,
  isServiceFailure,
  recordServiceFailure,
  recordServiceSuccess,
  resetServiceHealth,
} from '@server/api/externalApiHealth';
import ExternalAPI from '@server/api/externalapi';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

class TestCatalog extends ExternalAPI {
  constructor(publicCatalog: boolean) {
    super('https://catalog.example.test', {}, { publicCatalog });
  }

  public installAdapter(adapter: AxiosAdapter): void {
    this.axios.defaults.adapter = adapter;
  }

  public fetch<T>(endpoint: string): Promise<T> {
    return this.get<T>(endpoint, undefined, 0);
  }
}

const ok =
  (data: unknown): AxiosAdapter =>
  async (config: InternalAxiosRequestConfig) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });

const refused: AxiosAdapter = async (config) => {
  throw new AxiosError(
    'connect ECONNREFUSED',
    'ECONNREFUSED',
    config,
    undefined
  );
};

describe('external API health', () => {
  beforeEach(() => {
    resetServiceHealth();
    clearStaleAnswers();
  });

  afterEach(() => {
    resetServiceHealth();
    clearStaleAnswers();
  });

  it('counts outages and overload, not per-request errors', () => {
    assert.equal(isServiceFailure({ code: 'ECONNREFUSED' }), true);
    assert.equal(isServiceFailure({ code: 'ETIMEDOUT' }), true);
    assert.equal(isServiceFailure({ response: { status: 503 } }), true);
    assert.equal(isServiceFailure({ response: { status: 429 } }), true);
    assert.equal(isServiceFailure({ response: { status: 404 } }), false);
    assert.equal(isServiceFailure({ response: { status: 401 } }), false);
    assert.equal(isServiceFailure(new Error('bad input')), false);
  });

  it('pauses a failing service and lets it through again after the pause', () => {
    const service = 'https://down.example.test';
    const now = 1_000_000;

    recordServiceFailure(service, { code: 'ECONNREFUSED' }, now);

    assert.throws(
      () => assertServiceAvailable(service, now + 1000),
      ServiceUnavailableError
    );
    assert.doesNotThrow(() => assertServiceAvailable(service, now + 31_000));
  });

  it('grows the pause while the service stays down, up to five minutes', () => {
    const service = 'https://down.example.test';
    const now = 1_000_000;

    for (let i = 0; i < 10; i++) {
      recordServiceFailure(service, { code: 'ECONNREFUSED' }, now);
    }

    assert.throws(
      () => assertServiceAvailable(service, now + 299_000),
      ServiceUnavailableError
    );
    assert.doesNotThrow(() => assertServiceAvailable(service, now + 301_000));
  });

  it('clears the pause after a success', () => {
    const service = 'https://down.example.test';

    recordServiceFailure(service, { code: 'ECONNREFUSED' });
    recordServiceSuccess(service);

    assert.doesNotThrow(() => assertServiceAvailable(service));
  });

  it('fails at once while a public catalog is down', async () => {
    const api = new TestCatalog(true);
    let calls = 0;
    api.installAdapter(async (config) => {
      calls++;
      return refused(config);
    });

    await assert.rejects(api.fetch('/first'));
    await assert.rejects(api.fetch('/second'), ServiceUnavailableError);
    assert.equal(calls, 1);
  });

  it('serves the last good answer while a public catalog is down', async () => {
    const api = new TestCatalog(true);

    api.installAdapter(ok({ title: 'Dune' }));
    assert.deepEqual(await api.fetch('/works/OL1W'), { title: 'Dune' });

    api.installAdapter(refused);
    assert.deepEqual(await api.fetch('/works/OL1W'), { title: 'Dune' });
    assert.deepEqual(await api.fetch('/works/OL1W'), { title: 'Dune' });
  });

  it('leaves other services alone', async () => {
    const api = new TestCatalog(false);
    let calls = 0;
    api.installAdapter(async (config) => {
      calls++;
      return refused(config);
    });

    await assert.rejects(api.fetch('/status'));
    await assert.rejects(api.fetch('/status'));
    assert.equal(calls, 2);
  });
});
