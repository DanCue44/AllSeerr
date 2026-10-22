import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSeedingFileName } from '@server/lib/seedingNames';

describe('parseSeedingFileName', () => {
  it('splits a ratio filler file into title, author and format', () => {
    assert.deepStrictEqual(
      parseSeedingFileName('When Mikan Road Was Ours - D K Furutani.m4b'),
      {
        title: 'When Mikan Road Was Ours',
        author: 'D K Furutani',
        mediaType: 'audiobook',
      }
    );
    assert.deepStrictEqual(
      parseSeedingFileName('Ghostface Killer - M Never.m4b'),
      {
        title: 'Ghostface Killer',
        author: 'M Never',
        mediaType: 'audiobook',
      }
    );
  });

  it('reads ebook and comic extensions', () => {
    assert.strictEqual(
      parseSeedingFileName('Bound and Unbound - Ali Hazelwood.epub').mediaType,
      'ebook'
    );
    assert.strictEqual(
      parseSeedingFileName('Witch Hat Atelier v08.cbz').mediaType,
      'comic'
    );
    assert.strictEqual(
      parseSeedingFileName('Some Book.pdf').mediaType,
      'ebook'
    );
  });

  it('keeps the name whole when the part after the dash is not an author', () => {
    assert.deepStrictEqual(parseSeedingFileName('Dune - Book 1 (2019).mp3'), {
      title: 'Dune - Book 1 (2019)',
      author: null,
      mediaType: 'audiobook',
    });
  });

  it('leaves names without a known extension alone', () => {
    assert.deepStrictEqual(parseSeedingFileName('Project Hail Mary [MP3]'), {
      title: 'Project Hail Mary [MP3]',
      author: null,
      mediaType: null,
    });
    assert.deepStrictEqual(parseSeedingFileName('Notes.v2'), {
      title: 'Notes.v2',
      author: null,
      mediaType: null,
    });
  });

  it('uses the last dash, so titles with dashes keep them', () => {
    assert.deepStrictEqual(
      parseSeedingFileName('Spider-Man - The Novel - Peter David.m4b'),
      {
        title: 'Spider-Man - The Novel',
        author: 'Peter David',
        mediaType: 'audiobook',
      }
    );
  });
});
