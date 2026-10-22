import logger from '@server/logger';
import { LRUCache } from 'lru-cache';

/**
 * Remembers when an external service stops answering, so every page that
 * needs it fails at once instead of each request waiting in the rate limit
 * queue for a connection that is refused or times out. The service is tried
 * again after a short pause that grows while it stays down.
 */

// First pause after a failure, in ms
const FIRST_PAUSE = 30 * 1000;
// Longest pause while a service stays down, in ms
const LONGEST_PAUSE = 5 * 60 * 1000;

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

interface ServiceState {
  failures: number;
  pausedUntil: number;
}

const services = new Map<string, ServiceState>();

export class ServiceUnavailableError extends Error {
  public readonly code = 'ESERVICEUNAVAILABLE';

  constructor(service: string, retryInMs: number) {
    super(
      `${service} is not answering, trying again in ${Math.ceil(
        retryInMs / 1000
      )}s`
    );
    this.name = 'ServiceUnavailableError';
  }
}

export const getServiceKey = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
};

/**
 * Whether an error means the service itself is down or overloaded, rather than
 * a problem with one request (a 404 or a bad parameter)
 */
export const isServiceFailure = (error: unknown): boolean => {
  const e = error as {
    code?: string;
    response?: { status?: number };
  };

  if (e?.response?.status !== undefined) {
    return e.response.status >= 500 || e.response.status === 429;
  }

  return !!e?.code && NETWORK_ERROR_CODES.has(e.code);
};

/**
 * Throws a ServiceUnavailableError while the service is paused
 */
export const assertServiceAvailable = (
  service: string,
  now = Date.now()
): void => {
  const state = services.get(service);

  if (state && state.pausedUntil > now) {
    throw new ServiceUnavailableError(service, state.pausedUntil - now);
  }
};

export const recordServiceSuccess = (service: string): void => {
  if (services.has(service)) {
    services.delete(service);
    logger.info(`${service} is answering again`, { label: 'External API' });
  }
};

export const recordServiceFailure = (
  service: string,
  error: unknown,
  now = Date.now()
): void => {
  if (!isServiceFailure(error)) {
    return;
  }

  const state = services.get(service) ?? { failures: 0, pausedUntil: 0 };
  const failures = state.failures + 1;
  const pause = Math.min(FIRST_PAUSE * 2 ** (failures - 1), LONGEST_PAUSE);

  services.set(service, { failures, pausedUntil: now + pause });

  if (failures === 1 || pause === LONGEST_PAUSE) {
    logger.warn(`${service} is not answering, pausing requests`, {
      label: 'External API',
      pauseSeconds: pause / 1000,
      errorMessage: (error as Error)?.message,
    });
  }
};

export const resetServiceHealth = (): void => {
  services.clear();
};

/**
 * The last good answer of a request, kept for a week so a page can still
 * show something while the service is down. Only clients that opt in with
 * staleIfError use it, so private data from local services is never kept.
 */
const staleAnswers = new LRUCache<string, { value: unknown }>({
  max: 5000,
  ttl: 7 * 24 * 60 * 60 * 1000,
});

export const rememberStaleAnswer = (key: string, value: unknown): void => {
  staleAnswers.set(key, { value });
};

export const getStaleAnswer = <T>(key: string): T | undefined =>
  staleAnswers.get(key)?.value as T | undefined;

export const clearStaleAnswers = (): void => {
  staleAnswers.clear();
};
