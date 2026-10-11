import type { ScanNotifier } from '@server/lib/scanners/scanHealth';
import {
  SCAN_FAILURE_THRESHOLD,
  ScanHealth,
} from '@server/lib/scanners/scanHealth';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const setup = () => {
  const sent: { kind: string; subject: string; message?: string }[] = [];
  const notify: ScanNotifier = (kind, payload) =>
    sent.push({ kind, subject: payload.subject, message: payload.message });

  return { health: new ScanHealth(notify), sent };
};

describe('ScanHealth', () => {
  it('raises an alert and notifies once after 3 failures in a row', () => {
    const { health, sent } = setup();
    const success = new Date('2026-10-01T12:00:00Z');
    health.recordSuccess('plex-recently-added-scan', 'plex', success);

    for (let i = 1; i < SCAN_FAILURE_THRESHOLD; i++) {
      health.recordFailure('plex-recently-added-scan', 'plex', 'timed out');
    }

    assert.deepEqual(health.alerts(), []);
    assert.equal(sent.length, 0);

    health.recordFailure(
      'plex-recently-added-scan',
      'plex',
      'Could not reach Plex at http://plex.example.com:32400 (timed out)'
    );

    const [alert] = health.alerts();
    assert.equal(alert.service, 'plex');
    assert.equal(alert.consecutiveFailures, 3);
    assert.equal(alert.lastSuccess, success);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'failing');
    assert.equal(
      sent[0].message,
      'Plex scans are failing: Could not reach Plex at http://plex.example.com:32400 (timed out). Last success: 2026-10-01 12:00 UTC.'
    );

    // No more notifications while it keeps failing, from either Plex job
    health.recordFailure('plex-recently-added-scan', 'plex', 'timed out');
    for (let i = 0; i < SCAN_FAILURE_THRESHOLD; i++) {
      health.recordFailure('plex-full-scan', 'plex', 'timed out');
    }
    assert.equal(sent.length, 1);
    // One alert per service
    assert.equal(health.alerts().length, 1);
    assert.equal(
      health.get('plex-recently-added-scan')?.consecutiveFailures,
      4
    );
  });

  it('recovers once every job of the service works again', () => {
    const { health, sent } = setup();

    for (let i = 0; i < SCAN_FAILURE_THRESHOLD; i++) {
      health.recordFailure('plex-recently-added-scan', 'plex', 'timed out');
      health.recordFailure('plex-full-scan', 'plex', 'timed out');
    }

    health.recordSuccess('plex-recently-added-scan', 'plex');
    assert.equal(health.alerts().length, 1);
    assert.equal(sent.filter((n) => n.kind === 'recovered').length, 0);

    health.recordSuccess('plex-full-scan', 'plex');
    assert.deepEqual(health.alerts(), []);
    assert.deepEqual(
      sent.map((n) => n.kind),
      ['failing', 'recovered']
    );

    // A new streak notifies again
    for (let i = 0; i < SCAN_FAILURE_THRESHOLD; i++) {
      health.recordFailure('plex-full-scan', 'plex', 'timed out');
    }
    assert.deepEqual(
      sent.map((n) => n.kind),
      ['failing', 'recovered', 'failing']
    );
  });

  it('a success in between resets the count', () => {
    const { health, sent } = setup();

    health.recordFailure('sonarr-scan', 'sonarr', 'refused');
    health.recordFailure('sonarr-scan', 'sonarr', 'refused');
    health.recordSuccess('sonarr-scan', 'sonarr');
    health.recordFailure('sonarr-scan', 'sonarr', 'refused');
    health.recordFailure('sonarr-scan', 'sonarr', 'refused');

    assert.equal(health.get('sonarr-scan')?.consecutiveFailures, 2);
    assert.equal(health.get('sonarr-scan')?.lastError, 'refused');
    assert.deepEqual(health.alerts(), []);
    assert.equal(sent.length, 0);
  });

  it('keeps services apart', () => {
    const { health, sent } = setup();

    for (let i = 0; i < SCAN_FAILURE_THRESHOLD; i++) {
      health.recordFailure('radarr-scan', 'radarr', 'refused');
      health.recordFailure('lidarr-scan', 'lidarr', 'timed out');
    }

    assert.deepEqual(
      health
        .alerts()
        .map((alert) => alert.service)
        .sort(),
      ['lidarr', 'radarr']
    );
    assert.equal(sent.length, 2);
    assert.match(sent[0].message ?? '', /Last success: never/);
  });
});
