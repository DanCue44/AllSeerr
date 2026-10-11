import { nameSimilarity, reconcileLibraries } from '@server/lib/plexLibraries';
import type { Library } from '@server/lib/settings';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const lib = (
  id: string,
  name: string,
  type: Library['type'],
  enabled = false,
  lastScan?: number
): Library => ({ id, name, type, enabled, lastScan });

describe('nameSimilarity', () => {
  it('scores shared words', () => {
    assert.equal(nameSimilarity('Movies', 'movies'), 1);
    assert.equal(nameSimilarity('UFC PPV Events', 'UFC Events'), 0.8);
    assert.equal(nameSimilarity('Movies', 'TV Shows'), 0);
  });
});

describe('reconcileLibraries', () => {
  it('keeps libraries whose id and name did not change', () => {
    const result = reconcileLibraries(
      [lib('1', 'Movies', 'movie', true, 100), lib('2', 'TV Shows', 'show')],
      [lib('1', 'Movies', 'movie'), lib('2', 'TV Shows', 'show')]
    );

    assert.deepEqual(result.libraries, [
      lib('1', 'Movies', 'movie', true, 100),
      lib('2', 'TV Shows', 'show', false),
    ]);
    assert.deepEqual(result.remapped, []);
    assert.deepEqual(result.broken, []);
  });

  it('follows renumbered libraries by exact name', () => {
    // A Plex database restore gave every section a new id
    const result = reconcileLibraries(
      [
        lib('1', 'Movies', 'movie', true, 100),
        lib('2', 'TV Shows', 'show', true, 200),
        lib('3', 'Music', 'music'),
      ],
      [
        lib('11', 'TV Shows', 'show'),
        lib('12', 'Movies', 'movie'),
        lib('13', 'Music', 'music'),
      ]
    );

    assert.deepEqual(result.libraries, [
      lib('11', 'TV Shows', 'show', true, 200),
      lib('12', 'Movies', 'movie', true, 100),
      lib('13', 'Music', 'music', false),
    ]);
    assert.deepEqual(
      result.remapped.map(({ from, to, match }) => [from.id, to.id, match]),
      [
        ['2', '11', 'name'],
        ['1', '12', 'name'],
      ]
    );
    assert.deepEqual(result.broken, []);
  });

  it('prefers the name over an id Plex gave to another library', () => {
    const result = reconcileLibraries(
      [lib('1', 'Movies', 'movie', true), lib('2', 'Kids Movies', 'movie')],
      [lib('1', 'Kids Movies', 'movie'), lib('2', 'Movies', 'movie')]
    );

    assert.equal(result.libraries.find((l) => l.id === '2')?.enabled, true);
    assert.equal(result.libraries.find((l) => l.id === '1')?.enabled, false);
  });

  it('keeps a renamed library that kept its id and type', () => {
    const result = reconcileLibraries(
      [lib('5', 'Films', 'movie', true)],
      [lib('5', 'Movies', 'movie')]
    );

    assert.deepEqual(result.libraries, [lib('5', 'Movies', 'movie', true)]);
    assert.deepEqual(result.remapped, []);
  });

  it('moves "UFC PPV Events" to "UFC Events" when it is the clear match', () => {
    const result = reconcileLibraries(
      [
        lib('7', 'UFC PPV Events', 'show', true, 300),
        lib('2', 'TV Shows', 'show', true),
      ],
      [
        lib('21', 'TV Shows', 'show'),
        lib('22', 'UFC Events', 'show'),
        lib('23', 'UFC Events', 'movie'),
        lib('24', 'Documentaries', 'show'),
      ]
    );

    const ufc = result.remapped.find((entry) => entry.from.id === '7');
    assert.equal(ufc?.to.id, '22');
    assert.equal(ufc?.match, 'similar');
    assert.deepEqual(
      result.libraries.find((l) => l.id === '22'),
      lib('22', 'UFC Events', 'show', true, 300)
    );
    // The movie library of the same name is another type
    assert.equal(result.libraries.find((l) => l.id === '23')?.enabled, false);
    assert.deepEqual(result.broken, []);
  });

  it('leaves an ambiguous library broken and keeps the rest', () => {
    const saved = [
      lib('1', 'Movies', 'movie', true),
      lib('2', 'TV Shows', 'show', true, 200),
    ];
    const fresh = [
      lib('11', 'Movies HD', 'movie'),
      lib('12', 'Movies 4K', 'movie'),
      lib('13', 'TV Shows', 'show'),
    ];

    const result = reconcileLibraries(saved, fresh);

    assert.deepEqual(result.broken, [saved[0]]);
    assert.equal(result.libraries.find((l) => l.id === '13')?.enabled, true);
    assert.equal(result.libraries.find((l) => l.id === '11')?.enabled, false);
    assert.equal(result.libraries.find((l) => l.id === '12')?.enabled, false);
    assert.equal(result.libraries.length, 3);

    // The scanner keeps the broken library so it goes on being reported
    const kept = reconcileLibraries(saved, fresh, { keepBroken: true });
    assert.deepEqual(kept.libraries.at(-1), saved[0]);
  });

  it('does not move a library to a name that shares too little', () => {
    const result = reconcileLibraries(
      [lib('1', 'Anime Movies', 'movie', true)],
      [lib('2', 'Home Videos', 'movie')]
    );

    assert.equal(result.broken.length, 1);
    assert.equal(result.libraries[0].enabled, false);
  });

  it('matches libraries saved before types were recorded by id', () => {
    const untyped = { id: '1', name: 'Movies', enabled: true } as Library;
    const result = reconcileLibraries([untyped], [lib('1', 'Movies', 'movie')]);

    assert.deepEqual(result.libraries, [lib('1', 'Movies', 'movie', true)]);
  });
});
