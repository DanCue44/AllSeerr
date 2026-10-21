import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  allowsExplicitContent,
  canRequestWork,
  isAdultWork,
  isAgeLimit,
  KavitaAgeRating,
  toKavitaAgeRestriction,
  toKavitaAgeRoles,
  toKomgaAgeRestriction,
} from '@server/lib/userAccess/ageLimits';

describe('age limits', () => {
  it('knows its limits', () => {
    assert.equal(isAgeLimit('kids'), true);
    assert.equal(isAgeLimit('teen'), true);
    assert.equal(isAgeLimit('adult'), false);
    assert.equal(isAgeLimit(undefined), false);
  });

  it('maps to the highest Kavita rating each age allows', () => {
    assert.deepEqual(toKavitaAgeRestriction('kids', false), {
      ageRating: KavitaAgeRating.G,
      includeUnknowns: false,
    });
    assert.deepEqual(toKavitaAgeRestriction('tween', true), {
      ageRating: KavitaAgeRating.KidsToAdults,
      includeUnknowns: true,
    });
    assert.deepEqual(toKavitaAgeRestriction('teen', false), {
      ageRating: KavitaAgeRating.Mature15Plus,
      includeUnknowns: false,
    });
    assert.deepEqual(toKavitaAgeRestriction('none', false), {
      ageRating: KavitaAgeRating.NotApplicable,
      includeUnknowns: true,
    });
    assert.deepEqual(toKavitaAgeRestriction(null, false), {
      ageRating: KavitaAgeRating.NotApplicable,
      includeUnknowns: true,
    });
  });

  it('names the Kavita roles its sign in sync reads', () => {
    assert.deepEqual(toKavitaAgeRoles('teen', false), [
      'age-restriction-Mature15Plus',
    ]);
    assert.deepEqual(toKavitaAgeRoles('kids', true), [
      'age-restriction-G',
      'age-restriction-include-unknowns',
    ]);
    assert.deepEqual(toKavitaAgeRoles('none', true), []);
  });

  it('hides unrated Komga series unless they are allowed', () => {
    assert.deepEqual(toKomgaAgeRestriction('kids', false), {
      age: 9,
      restriction: 'ALLOW_ONLY',
    });
    // Exclude hides series rated at or over the age and keeps unrated ones
    assert.deepEqual(toKomgaAgeRestriction('tween', true), {
      age: 13,
      restriction: 'EXCLUDE',
    });
    assert.deepEqual(toKomgaAgeRestriction(undefined, false), {
      age: 0,
      restriction: 'NONE',
    });
  });

  it('hides explicit Audiobookshelf books under any limit', () => {
    assert.equal(allowsExplicitContent('teen'), false);
    assert.equal(allowsExplicitContent('none'), true);
    assert.equal(allowsExplicitContent(null), true);
  });

  it('spots works written for adults by their subjects', () => {
    assert.equal(isAdultWork(['Fiction', 'Erotica']), true);
    assert.equal(isAdultWork(['Fiction, erotica, general']), true);
    assert.equal(isAdultWork(['Erotic romance']), true);
    assert.equal(isAdultWork(['Romance', 'Fantasy']), false);
    assert.equal(isAdultWork(['Exotic animals']), false);
    assert.equal(isAdultWork(undefined), false);
  });

  it('lets only people without a limit request works for adults', () => {
    assert.equal(canRequestWork('teen', ['Erotica']), false);
    assert.equal(canRequestWork('teen', ['Fantasy']), true);
    assert.equal(canRequestWork(null, ['Erotica']), true);
  });
});
