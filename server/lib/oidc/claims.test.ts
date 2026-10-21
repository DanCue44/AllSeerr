import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OidcClaimsInput } from '@server/lib/oidc/claims';
import { buildOidcClaims, kavitaRoleClaims } from '@server/lib/oidc/claims';

const person: OidcClaimsInput = {
  userId: 7,
  displayName: 'Kid',
  username: 'kid',
  email: 'kid@example.com',
  isAdmin: false,
  access: { enabled: true, libraryIds: null },
  libraryNames: { '1': 'Comics', '2': 'Manga' },
  ageLimit: 'tween',
  includeUnrated: false,
};

describe('sign in claims', () => {
  it('gives Kavita every library for all libraries, by name', () => {
    assert.deepEqual(kavitaRoleClaims(person), [
      'Login',
      'Download',
      'Change Password',
      'library-Comics',
      'library-Manga',
      'age-restriction-KidsToAdults',
    ]);
  });

  it('gives no Kavita roles without access, so Kavita refuses the sign in', () => {
    assert.deepEqual(
      kavitaRoleClaims({
        ...person,
        access: { enabled: false, libraryIds: null },
      }),
      []
    );
  });

  it('makes Allseerr admins Kavita admins', () => {
    assert.deepEqual(kavitaRoleClaims({ ...person, isAdmin: true }), [
      'Admin',
      'Login',
      'Download',
      'Change Password',
    ]);
  });

  it('gives Audiobookshelf a listener with the chosen libraries', () => {
    const claims = buildOidcClaims('audiobookshelf', {
      ...person,
      access: { enabled: true, libraryIds: ['lib-audio'] },
    });

    assert.deepEqual(claims.abs_groups, ['user']);
    assert.deepEqual(claims.abs_permissions, {
      canDownload: true,
      canUpload: false,
      canDelete: false,
      canUpdate: false,
      canAccessExplicitContent: false,
      canAccessAllLibraries: false,
      canAccessAllTags: true,
      canCreateEReader: false,
      tagsAreDenylist: false,
      allowedLibraries: ['lib-audio'],
      allowedTags: [],
    });
    assert.equal(claims.role, undefined);
  });

  it('gives no Audiobookshelf group without access, so it refuses the sign in', () => {
    const claims = buildOidcClaims('audiobookshelf', {
      ...person,
      access: null,
    });
    assert.deepEqual(claims.abs_groups, []);
  });

  it('leaves out addresses Allseerr made up for apps that need one', () => {
    const claims = buildOidcClaims('komga', {
      ...person,
      email: 'kid@allseerr.invalid',
    });
    assert.equal(claims.email, undefined);
    assert.equal(claims.sub, '7');
    assert.equal(claims.age_limit, 'tween');
  });
});
