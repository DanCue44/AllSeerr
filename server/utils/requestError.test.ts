import {
  describeRequestError,
  requestErrorLogFields,
} from '@server/utils/requestError';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('describeRequestError', () => {
  it('names the URL of a connect timeout with an empty message', () => {
    // How axios reports a connect timeout through Node's AggregateError
    const error = Object.assign(new Error(''), {
      code: 'ETIMEDOUT',
      config: {
        baseURL: 'http://plex.example.com:32400',
        url: '/library/sections/3/all?includeGuids=1',
      },
    });

    const details = describeRequestError(error, { service: 'Plex' });

    assert.equal(
      details.message,
      'Could not reach Plex at http://plex.example.com:32400/library/sections/3/all (timed out)'
    );
    assert.equal(details.timedOut, true);
    assert.equal(details.unreachable, true);
  });

  it('reads the code of an AggregateError', () => {
    const error = Object.assign(new AggregateError([], ''), {
      errors: [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }],
    });

    assert.equal(
      describeRequestError(error, {
        service: 'Sonarr',
        url: 'http://sonarr:8989',
      }).message,
      'Could not reach Sonarr at http://sonarr:8989 (connection refused)'
    );
  });

  it('reports the status of an HTTP error', () => {
    const error = Object.assign(
      new Error('Request failed with status code 404'),
      {
        response: { status: 404 },
        config: { baseURL: 'https://plex.example.com:443', url: '/x' },
      }
    );

    const fields = requestErrorLogFields(error, { service: 'Plex' });

    assert.deepEqual(fields, {
      errorMessage:
        'Plex at https://plex.example.com/x responded with status 404',
      status: 404,
      url: 'https://plex.example.com/x',
    });
  });

  it('keeps API keys in the query string out of the URL', () => {
    const error = Object.assign(new Error('timeout of 5000ms exceeded'), {
      code: 'ECONNABORTED',
      config: { url: 'http://ll:5299/api?apikey=secret&cmd=getIndex' },
    });

    assert.doesNotMatch(describeRequestError(error).message, /secret/);
  });

  it('falls back to the message of a plain error', () => {
    assert.equal(
      describeRequestError(new Error('Unable to find TMDB ID')).message,
      'Unable to find TMDB ID'
    );
    assert.equal(describeRequestError(new Error('')).message, 'Unknown error');
  });
});
