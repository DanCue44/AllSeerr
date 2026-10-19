import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NOBOOKENDS_DEVICE_LABEL_MAX_LENGTH,
  sanitizeNoBookEndsDeviceLabel,
} from '@server/utils/nobookendsDeviceLabel';

describe('sanitizeNoBookEndsDeviceLabel', () => {
  it('keeps a plain device name', () => {
    assert.equal(sanitizeNoBookEndsDeviceLabel('iPhone 16'), 'iPhone 16');
    assert.equal(sanitizeNoBookEndsDeviceLabel('  Galaxy S24 '), 'Galaxy S24');
  });

  it('is null for nothing usable', () => {
    assert.equal(sanitizeNoBookEndsDeviceLabel(undefined), null);
    assert.equal(sanitizeNoBookEndsDeviceLabel(42), null);
    assert.equal(sanitizeNoBookEndsDeviceLabel(['iPhone']), null);
    assert.equal(sanitizeNoBookEndsDeviceLabel('   '), null);
    assert.equal(sanitizeNoBookEndsDeviceLabel('\u0000‮'), null);
  });

  it('removes control characters, markup and extra spaces', () => {
    assert.equal(
      sanitizeNoBookEndsDeviceLabel('Dan\u0007s\n\tiPad‮ <b>'),
      'Dan s iPad b'
    );
  });

  it('shortens a long name', () => {
    const label = sanitizeNoBookEndsDeviceLabel('a'.repeat(500));
    assert.equal(label?.length, NOBOOKENDS_DEVICE_LABEL_MAX_LENGTH);
  });
});
