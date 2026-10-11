import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GoogleBooksVolume } from './interfaces';
import { findEbookEvidence, findMatchingVolumes, hasEbookSign } from './match';

type VolumeRow = [
  id: string,
  title: string,
  subtitle: string | null,
  authors: string[],
  language: string,
  isEbook: boolean,
  epub: boolean,
  pdf: boolean,
];

const volume = ([
  id,
  title,
  subtitle,
  authors,
  language,
  isEbook,
  epub,
  pdf,
]: VolumeRow): GoogleBooksVolume => ({
  id,
  volumeInfo: { title, subtitle: subtitle ?? undefined, authors, language },
  saleInfo: { country: 'US', isEbook },
  accessInfo: { epub: { isAvailable: epub }, pdf: { isAvailable: pdf } },
});

// Trimmed from a live search for "Atomic Habits inauthor:Clear" in the US.
// The main English volumes say isEbook false, a Tamil edition says true,
// and the companions that do sell ebooks must not count.
const atomicHabits: GoogleBooksVolume[] = (
  [
    [
      'WmqyDwAAQBAJ',
      'Atomic Habits (Tamil)',
      null,
      ['James Clear'],
      'ta',
      true,
      true,
      true,
    ],
    [
      '-a5puQEACAAJ',
      'Atomic Habits',
      'An Easy and Proven Way to Build Good Habits and Break Bad Ones',
      ['James Clear'],
      'en',
      false,
      false,
      false,
    ],
    [
      'FJ5hEQAAQBAJ',
      'The Atomic Habits Workbook',
      'Official Companion to the #1 Worldwide Bestseller',
      ['James Clear'],
      'en',
      true,
      true,
      false,
    ],
    [
      'fFCjDQAAQBAJ',
      'Atomic Habits',
      'The life-changing million-copy #1 bestseller',
      ['James Clear'],
      'en',
      false,
      true,
      true,
    ],
    [
      '5K69vgEACAAJ',
      'Summary and Analysis',
      'Atomic Habits by James Clear : an Easy and Proven Way to Build Good Habits and Break Bad Ones',
      ['Black Book'],
      'en',
      false,
      false,
      false,
    ],
    [
      'G5L3EQAAQBAJ',
      'ATOMIC HABITS AND JAMES CLEAR APPROACH',
      'A Simple, Proven System for Building Good Habits and Breaking Bad Ones',
      ['James Craft '],
      'en',
      true,
      true,
      true,
    ],
    [
      'tVX00AEACAAJ',
      'Atomic Habits',
      'An Easy & Proven Way to Build Good Habits & Break Bad Ones',
      ['James Clear'],
      'en',
      false,
      false,
      false,
    ],
    [
      'p6gUEQAAQBAJ',
      'Workbook & Summary - Atomic Habits - Based On The Book By James Clear',
      null,
      ['Sapiens Quick Books'],
      'en',
      true,
      true,
      true,
    ],
  ] satisfies VolumeRow[]
).map(volume);

// Trimmed from the same search for "Dune inauthor:Herbert": Google lists the
// novel without any ebook sign, only a box set and other books have one
const dune: GoogleBooksVolume[] = (
  [
    [
      'AQk_EAAAQBAJ',
      'Dune (Movie Tie-In)',
      null,
      ['Frank Herbert'],
      'en',
      false,
      false,
      false,
    ],
    [
      'ZnwFAQAAIAAJ',
      'Dune',
      null,
      ['Frank Herbert'],
      'en',
      false,
      false,
      false,
    ],
    [
      'TSlIEQAAQBAJ',
      "Frank Herbert's Dune Saga 3-Book Boxed Set",
      'Dune, Dune Messiah, and Children of Dune',
      ['FRANK. HERBERT'],
      'en',
      false,
      false,
      true,
    ],
    [
      '-eAMEAAAQBAJ',
      "Frank Herbert's Dune Saga Collection: Books 1-3",
      null,
      ['Frank Herbert'],
      'en',
      true,
      true,
      false,
    ],
    [
      '6KotD0FXLEwC',
      'The Green Brain',
      null,
      ['Frank Herbert'],
      'en',
      true,
      true,
      false,
    ],
  ] satisfies VolumeRow[]
).map(volume);

describe('hasEbookSign', () => {
  it('counts isEbook, an epub or a pdf', () => {
    const base: VolumeRow = ['id', 'T', null, ['A'], 'en', false, false, false];

    assert.equal(hasEbookSign(volume(base)), false);
    assert.equal(
      hasEbookSign(volume(['id', 'T', null, ['A'], 'en', true, false, false])),
      true
    );
    assert.equal(
      hasEbookSign(volume(['id', 'T', null, ['A'], 'en', false, true, false])),
      true
    );
    assert.equal(
      hasEbookSign(volume(['id', 'T', null, ['A'], 'en', false, false, true])),
      true
    );
    assert.equal(hasEbookSign({ id: 'bare' }), false);
  });
});

describe('findMatchingVolumes', () => {
  it('keeps editions by the author and drops companions and lookalikes', () => {
    const ids = findMatchingVolumes(
      'Atomic Habits',
      ['James Clear'],
      atomicHabits
    ).map((entry) => entry.id);

    assert.deepEqual(ids, [
      'WmqyDwAAQBAJ',
      '-a5puQEACAAJ',
      'fFCjDQAAQBAJ',
      'tVX00AEACAAJ',
    ]);
  });
});

describe('findEbookEvidence', () => {
  it('finds the ebook across noisy volumes, preferring the book language', () => {
    assert.deepEqual(
      findEbookEvidence('Atomic Habits', ['James Clear'], atomicHabits, 'en'),
      { exists: true, volumeId: 'fFCjDQAAQBAJ' }
    );
  });

  it('counts an edition in another language when it is the only sign', () => {
    const tamilOnly = atomicHabits.filter(
      (entry) => entry.id !== 'fFCjDQAAQBAJ'
    );

    assert.deepEqual(
      findEbookEvidence('Atomic Habits', ['James Clear'], tamilOnly, 'en'),
      { exists: true, volumeId: 'WmqyDwAAQBAJ' }
    );
  });

  it('ignores ebooks of companions written about the book', () => {
    const companions = atomicHabits.filter((entry) =>
      ['FJ5hEQAAQBAJ', 'G5L3EQAAQBAJ', 'p6gUEQAAQBAJ'].includes(entry.id)
    );

    assert.deepEqual(
      findEbookEvidence('Atomic Habits', ['James Clear'], companions),
      { exists: null }
    );
  });

  it('reports no ebook when every matching volume lacks a sign', () => {
    assert.deepEqual(findEbookEvidence('Dune', ['Frank Herbert'], dune), {
      exists: false,
    });
  });

  it('reports unknown when Google has no volume of the book', () => {
    assert.deepEqual(
      findEbookEvidence('An Unlisted Pamphlet', ['Frank Herbert'], dune),
      { exists: null }
    );
    assert.deepEqual(findEbookEvidence('Dune', [], dune), { exists: null });
  });
});
