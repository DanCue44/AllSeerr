import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanBookSubjects,
  getBookSubjectLabel,
  isBookSubjectSlug,
  MAX_BOOK_SUBJECT_LENGTH,
  toBookSubjectSlug,
} from '@server/lib/bookSubjects';

describe('cleanBookSubjects', () => {
  it('rejoins phrases split into single words', () => {
    assert.deepStrictEqual(
      cleanBookSubjects(['True', 'Crime', 'Murder', 'Mystery']),
      ['True crime', 'Murder mystery']
    );
  });

  it('tidies the subjects of In Cold Blood', () => {
    assert.deepStrictEqual(
      cleanBookSubjects([
        'True',
        'Crime',
        'Murder',
        'Mystery',
        'Cas, Études de',
        'Meurtre',
        'Análisis de casos',
        'Asesinato',
        'Case studies',
        'Murder -- Kansas -- Case studies.',
        'Smith, Perry Edward, 1928-1965',
        'Kansas',
      ]),
      ['True crime', 'Murder mystery', 'Case studies', 'Murder', 'Kansas']
    );
  });

  it('drops foreign catalog words that stand alone', () => {
    assert.deepStrictEqual(
      cleanBookSubjects(['Roman', 'Deutsch', 'Roman history']),
      ['Roman history']
    );
  });

  it('keeps single words that are not part of a phrase', () => {
    assert.deepStrictEqual(cleanBookSubjects(['Crime', 'Fiction']), [
      'Crime',
      'Fiction',
    ]);
  });

  it('drops duplicates regardless of case', () => {
    assert.deepStrictEqual(cleanBookSubjects(['Habit', 'habit', 'Self-help']), [
      'Habit',
      'Self-help',
    ]);
  });

  it('limits the number of subjects', () => {
    assert.strictEqual(
      cleanBookSubjects(['A1', 'B2', 'C3', 'D4'], 2).length,
      2
    );
  });
});

describe('toBookSubjectSlug', () => {
  it('turns typed subjects into OpenLibrary keys', () => {
    assert.strictEqual(toBookSubjectSlug('Science fiction'), 'science_fiction');
    assert.strictEqual(toBookSubjectSlug('  Thrillers  '), 'thrillers');
    assert.strictEqual(toBookSubjectSlug('COOKING'), 'cooking');
  });

  it('keeps hyphens, which are part of some keys', () => {
    assert.strictEqual(toBookSubjectSlug('Self-help'), 'self-help');
  });

  it('drops punctuation the way OpenLibrary keys do', () => {
    assert.strictEqual(
      toBookSubjectSlug('Adventure / thriller'),
      'adventure__thriller'
    );
    assert.strictEqual(
      toBookSubjectSlug('Fiction - Espionage / Thriller'),
      'fiction_-_espionage__thriller'
    );
    assert.strictEqual(
      toBookSubjectSlug("Children's stories"),
      'childrens_stories'
    );
  });

  it('folds accents and repeated spaces', () => {
    assert.strictEqual(
      toBookSubjectSlug('Ciencia   ficción'),
      'ciencia_ficcion'
    );
  });

  it('reads subject links and keys', () => {
    assert.strictEqual(
      toBookSubjectSlug('https://openlibrary.org/subjects/science_fiction'),
      'science_fiction'
    );
    assert.strictEqual(
      toBookSubjectSlug('/subjects/self-help.json?limit=1'),
      'self-help'
    );
    assert.strictEqual(toBookSubjectSlug('science_fiction'), 'science_fiction');
  });

  it('leaves nothing when there are no letters or digits', () => {
    assert.strictEqual(toBookSubjectSlug(''), '');
    assert.strictEqual(toBookSubjectSlug('  /?!  '), '');
  });

  it('caps the length', () => {
    assert.strictEqual(
      toBookSubjectSlug('a'.repeat(MAX_BOOK_SUBJECT_LENGTH + 20)).length,
      MAX_BOOK_SUBJECT_LENGTH
    );
  });
});

describe('isBookSubjectSlug', () => {
  it('accepts OpenLibrary subject keys', () => {
    assert.ok(isBookSubjectSlug('science_fiction'));
    assert.ok(isBookSubjectSlug('self-help'));
    assert.ok(isBookSubjectSlug('fiction_-_espionage__thriller'));
  });

  it('rejects anything else', () => {
    assert.ok(!isBookSubjectSlug(''));
    assert.ok(!isBookSubjectSlug('Science fiction'));
    assert.ok(!isBookSubjectSlug('person:harry_potter'));
    assert.ok(!isBookSubjectSlug('../etc'));
    assert.ok(!isBookSubjectSlug('a'.repeat(MAX_BOOK_SUBJECT_LENGTH + 1)));
  });
});

describe('getBookSubjectLabel', () => {
  it('reads a key as words', () => {
    assert.strictEqual(
      getBookSubjectLabel('science_fiction'),
      'science fiction'
    );
    assert.strictEqual(
      getBookSubjectLabel('adventure__thriller'),
      'adventure thriller'
    );
  });
});
