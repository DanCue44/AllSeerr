import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getBookLanguageName,
  getEffectiveBookLanguage,
  isBookLanguage,
  resolveRequestBookLanguage,
} from '@server/constants/bookLanguages';

describe('book languages', () => {
  it('knows the supported codes and any language', () => {
    assert.ok(isBookLanguage('en'));
    assert.ok(isBookLanguage('no'));
    assert.ok(isBookLanguage('any'));
    assert.ok(!isBookLanguage('xx'));
    assert.ok(!isBookLanguage(''));
    assert.ok(!isBookLanguage(null));
    assert.strictEqual(getBookLanguageName('es'), 'Spanish');
    assert.strictEqual(getBookLanguageName('any'), 'Any Language');
  });

  it('uses the user language, then the server default, then English', () => {
    assert.strictEqual(getEffectiveBookLanguage('de', 'es'), 'de');
    assert.strictEqual(getEffectiveBookLanguage(null, 'es'), 'es');
    assert.strictEqual(getEffectiveBookLanguage('xx', 'es'), 'es');
    assert.strictEqual(getEffectiveBookLanguage(undefined, undefined), 'en');
    assert.strictEqual(getEffectiveBookLanguage('any', 'es'), 'any');
  });

  it('takes the requested language over the user and server ones', () => {
    assert.strictEqual(
      resolveRequestBookLanguage({
        requested: 'fr',
        canManage: true,
        userLanguage: 'de',
        serverLanguage: 'es',
      }),
      'fr'
    );
    assert.strictEqual(
      resolveRequestBookLanguage({
        requested: undefined,
        canManage: true,
        userLanguage: 'de',
        serverLanguage: 'es',
      }),
      'de'
    );
  });

  it('ignores the requested language of users who do not manage requests', () => {
    assert.strictEqual(
      resolveRequestBookLanguage({
        requested: 'fr',
        canManage: false,
        userLanguage: null,
        serverLanguage: 'es',
      }),
      'es'
    );
    assert.strictEqual(
      resolveRequestBookLanguage({
        requested: 'fr',
        canManage: false,
        userLanguage: 'de',
        serverLanguage: 'es',
      }),
      'de'
    );
  });
});
