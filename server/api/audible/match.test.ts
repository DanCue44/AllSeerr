import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AudibleProduct } from './interfaces';
import {
  findAudiobookMatch,
  getAuthorLastNames,
  isTitleMatch,
  normalizeTitle,
} from './match';

const product = (
  title: string,
  authors: string[],
  extra: Partial<AudibleProduct> = {}
): AudibleProduct => ({
  asin: `ASIN-${title}`,
  title,
  authors: authors.map((name) => ({ name })),
  ...extra,
});

describe('normalizeTitle', () => {
  it('drops case, punctuation, a leading article and the subtitle', () => {
    assert.equal(normalizeTitle('Fantastic Mr. Fox'), 'fantastic mr fox');
    assert.equal(
      normalizeTitle('The Hobbit: Or There and Back Again'),
      'hobbit'
    );
    assert.equal(normalizeTitle('Dune (Unabridged)'), 'dune');
    assert.equal(normalizeTitle("Ender's Game"), 'enders game');
    assert.equal(normalizeTitle('Pride & Prejudice'), 'pride and prejudice');
    assert.equal(normalizeTitle('Les Misérables'), 'les miserables');
  });
});

describe('getAuthorLastNames', () => {
  it('takes the last name of each author', () => {
    assert.deepEqual(
      [...getAuthorLastNames(['J. R. R. Tolkien'])],
      ['tolkien']
    );
    assert.deepEqual(
      [...getAuthorLastNames(['Neil Gaiman, Terry Pratchett'])].sort(),
      ['gaiman', 'pratchett']
    );
    assert.deepEqual(
      [...getAuthorLastNames(['Martin Luther King Jr.'])],
      ['king']
    );
  });
});

describe('isTitleMatch', () => {
  it('matches equal titles and titles that differ only by a subtitle', () => {
    assert.ok(isTitleMatch('Fantastic Mr Fox', 'Fantastic Mr. Fox'));
    assert.ok(isTitleMatch('Dune', 'Dune: Dune, Book 1'));
    assert.ok(
      isTitleMatch(
        'The Name of the Wind',
        'The Name of the Wind: The Kingkiller Chronicle, Day 1'
      )
    );
  });

  it('allows a contained title only when it covers most of the other', () => {
    assert.ok(
      isTitleMatch(
        "Harry Potter and the Sorcerer's Stone",
        "Harry Potter and the Sorcerer's Stone, Book 1"
      )
    );
    assert.ok(
      !isTitleMatch(
        'Fantastic Mr Fox',
        'Fantastic Mr. Fox and Other Animal Stories'
      )
    );
    assert.ok(!isTitleMatch('Dune', 'Dune Messiah'));
  });
});

describe('findAudiobookMatch', () => {
  it('finds the edition by the same author', () => {
    const match = findAudiobookMatch(
      'Fantastic Mr Fox',
      ['Roald Dahl'],
      [
        product('The Roald Dahl Audio Collection', ['Roald Dahl']),
        product('Fantastic Mr. Fox', ['Roald Dahl'], { asin: 'B0BB3F6HKX' }),
      ]
    );

    assert.equal(match?.asin, 'B0BB3F6HKX');
  });

  it('skips summaries, workbooks and study guides', () => {
    const products = [
      product('Atomic Habits', ['Quick Reads'], {
        subtitle: 'Summary of the Book by James Clear',
      }),
      product('Atomic Habits: Workbook', ['James Clear']),
      product('Study Guide: Atomic Habits', ['James Clear']),
    ];

    assert.equal(
      findAudiobookMatch('Atomic Habits', ['James Clear'], products),
      undefined
    );
  });

  it('keeps companions when the book itself is one', () => {
    const match = findAudiobookMatch(
      'The Artist’s Way Workbook',
      ['Julia Cameron'],
      [product("The Artist's Way Workbook", ['Julia Cameron'])]
    );

    assert.ok(match);
  });

  it('requires the author to match', () => {
    assert.equal(
      findAudiobookMatch(
        'Dune',
        ['Frank Herbert'],
        [product('Dune', ['Brian Herbertson'])]
      ),
      undefined
    );
    assert.equal(
      findAudiobookMatch('Dune', [], [product('Dune', ['Frank Herbert'])]),
      undefined
    );
  });

  it('matches on the main title when the book has a subtitle', () => {
    const match = findAudiobookMatch(
      'Sapiens: A Brief History of Humankind',
      ['Yuval Noah Harari'],
      [product('Sapiens', ['Yuval Noah Harari'])]
    );

    assert.ok(match);
  });
});
