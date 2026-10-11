import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { Tag } from '@server/api/servarr/base';
import type ChaptarrAPI from '@server/api/servarr/chaptarr';
import type {
  ChaptarrAuthor,
  ChaptarrReleaseProfile,
} from '@server/api/servarr/chaptarr';
import type { BookLanguageCode } from '@server/constants/bookLanguages';
import { BOOK_LANGUAGES } from '@server/constants/bookLanguages';
import {
  applyChaptarrLanguageTag,
  buildChaptarrLanguageProfile,
  ensureChaptarrLanguage,
  getChaptarrLanguageTags,
  isEditionInLanguage,
  withLanguageTag,
} from '@server/lib/chaptarrLanguages';

// Chaptarr's term syntax: /pattern/modifiers, with .NET's modifiers
const PERL_REGEX = /^\/(.*)\/([a-z]*)$/;

const toRegExp = (term: string): RegExp => {
  const match = PERL_REGEX.exec(term);
  assert.ok(match, `${term} is not a regex term`);
  return new RegExp(match[1], match[2]);
};

const matchesAny = (terms: string[], title: string): boolean =>
  terms.some((term) => toRegExp(term).test(title));

class FakeChaptarr {
  public isChaptarr = true;
  public tags: Tag[] = [];
  public profiles: ChaptarrReleaseProfile[] = [];
  public authors: Record<number, ChaptarrAuthor> = {};
  public calls: string[] = [];

  async getCapabilities() {
    return { appName: 'Chaptarr', version: '1', isChaptarr: this.isChaptarr };
  }

  async getChaptarrTags() {
    return this.tags.map((tag) => ({ ...tag }));
  }

  async createChaptarrTag(label: string) {
    const tag = { id: this.tags.length + 1, label };
    this.tags.push(tag);
    this.calls.push(`create tag ${label}`);
    return tag;
  }

  async getReleaseProfiles() {
    return this.profiles.map((profile) => ({ ...profile }));
  }

  async createReleaseProfile(profile: ChaptarrReleaseProfile) {
    const created = { ...profile, id: this.profiles.length + 1 };
    this.profiles.push(created);
    this.calls.push(`create profile ${profile.tags.join(',')}`);
    return created;
  }

  async updateReleaseProfile(profile: ChaptarrReleaseProfile) {
    this.profiles = this.profiles.map((existing) =>
      existing.id === profile.id ? { ...profile } : existing
    );
    this.calls.push(`update profile ${profile.id}`);
  }

  async getAuthor(authorId: number) {
    return { ...this.authors[authorId] };
  }

  async updateAuthor(author: ChaptarrAuthor) {
    this.authors[author.id as number] = { ...author };
    this.calls.push(`update author ${author.id}`);
  }
}

const asApi = (fake: FakeChaptarr) => fake as unknown as ChaptarrAPI;

describe('buildChaptarrLanguageProfile', () => {
  const english = buildChaptarrLanguageProfile('en');

  it('writes every term as a regex Chaptarr can read', () => {
    for (const { code } of BOOK_LANGUAGES) {
      const { required, ignored } = buildChaptarrLanguageProfile(code);

      for (const term of [...required, ...ignored]) {
        const match = PERL_REGEX.exec(term);
        assert.ok(match, `${code}: ${term}`);
        // Chaptarr only knows these modifiers and refuses others
        assert.match(match[2], /^[imsxn]*$/);
        // Some Chaptarr lists split terms on commas
        assert.ok(!term.includes(','), `${code}: ${term} has a comma`);
        assert.doesNotThrow(() => toRegExp(term));
      }

      // Chaptarr refuses a profile without any term
      assert.ok(required.length + ignored.length > 0, code);
    }
  });

  it('keeps English releases and rejects ones that name another language', () => {
    assert.deepStrictEqual(english.required, []);

    for (const title of [
      'Jussi Adler-Olsen - Kvinden i buret (Danish Edition)',
      'Stephen King - Es [German]',
      'Stephen King - Der Anschlag ungekürzt',
      'Stephen King - Das Monster Hoerbuch',
      'Ken Follett - De pijlers van de aarde NL',
      'Agatha Christie - Dix petits negres.FRENCH.EPUB',
      'Elena Ferrante - Lamica geniale (Italian translation)',
      'Truman Capote - Biografie',
      'Haruki Murakami - Noruwei no mori (Japanese)',
      'Haruki Murakami - ノルウェイの森',
      'Leo Tolstoy - Война и мир',
      'Jo Nesbo - Snømannen lydbok',
      'Anne Frank - Het Achterhuis (Nederlands)',
      'J.K. Rowling - Harry Potter (German/English)',
    ]) {
      assert.ok(matchesAny(english.ignored, title), title);
    }
  });

  it('leaves English titles that only use a language name as a word', () => {
    for (const title of [
      'Ann Patchett - The Dutch House',
      'David Ebershoff - The Danish Girl (Unabridged)',
      'Elle Kennedy - The Spanish Love Deception (Spanish Love Deception #1)',
      'John Fowles - The French Lieutenants Woman',
      'Alan Furst - The Polish Officer',
      'James Patterson - The Russian',
      'Stephen King - IT',
      'Cormac McCarthy - NO Country for Old Men',
      'Roman Holiday - A Novel',
      'Isabel Allende - The Japanese Lover [MP3]',
      'Truman Capote - In Cold Blood.epub',
      'Jane Austen - Pride and Prejudice (Penguin Classics)',
    ]) {
      assert.ok(!matchesAny(english.ignored, title), title);
    }
  });

  it('requires other languages to be named and rejects the others', () => {
    const spanish = buildChaptarrLanguageProfile('es');

    for (const title of [
      'Gabriel Garcia Marquez - Cien anos de soledad [Spanish]',
      'Carlos Ruiz Zafon - La sombra del viento (Español)',
      'Isabel Allende - La casa de los espiritus ES',
    ]) {
      assert.ok(matchesAny(spanish.required, title), title);
      assert.ok(!matchesAny(spanish.ignored, title), title);
    }

    assert.ok(
      !matchesAny(spanish.required, 'Jane Austen - Pride and Prejudice')
    );
    // Only the capital ES is a language tag
    assert.ok(!matchesAny(spanish.required, 'Juan es mi amigo'));
    assert.ok(
      matchesAny(spanish.ignored, 'Isabel Allende - Eva Luna (English Edition)')
    );
    assert.ok(matchesAny(spanish.ignored, 'Isabel Allende - Eva Luna Deutsch'));
  });

  it('finds languages written in their own script', () => {
    const russian = buildChaptarrLanguageProfile('ru');
    const korean = buildChaptarrLanguageProfile('ko');

    assert.ok(matchesAny(russian.required, 'Лев Толстой - Война и мир'));
    assert.ok(matchesAny(korean.required, '한강 - 채식주의자'));
    assert.ok(!matchesAny(korean.required, 'Han Kang - The Vegetarian'));
  });
});

describe('isEditionInLanguage', () => {
  it('reads ISO codes and language names', () => {
    assert.ok(isEditionInLanguage({ language: 'eng' }, 'en'));
    assert.ok(isEditionInLanguage({ language: 'English' }, 'en'));
    assert.ok(isEditionInLanguage({ language: 'ger' }, 'de'));
    assert.ok(isEditionInLanguage({ language: 'deu' }, 'de'));
    assert.ok(isEditionInLanguage({ language: 'nob' }, 'no'));
    assert.ok(!isEditionInLanguage({ language: 'dan' }, 'en'));
    assert.ok(!isEditionInLanguage({}, 'en'));
  });
});

describe('ensureChaptarrLanguage', () => {
  let chaptarr: FakeChaptarr;

  beforeEach(() => {
    chaptarr = new FakeChaptarr();
  });

  it('creates the tag and the release profile of a language once', async () => {
    const first = await ensureChaptarrLanguage(asApi(chaptarr), 'es');
    const second = await ensureChaptarrLanguage(asApi(chaptarr), 'es');

    assert.deepStrictEqual(chaptarr.calls, [
      'create tag allseerr-lang-es',
      'create profile 1',
    ]);
    assert.deepStrictEqual(first, { tagId: 1, managedTagIds: [1] });
    assert.deepStrictEqual(second, first);

    const [profile] = chaptarr.profiles;
    const terms = buildChaptarrLanguageProfile('es');
    assert.deepStrictEqual(profile, {
      id: 1,
      enabled: true,
      required: terms.required,
      ignored: terms.ignored,
      indexerId: 0,
      tags: [1],
    });
  });

  it('updates a profile whose terms changed and keeps it disabled', async () => {
    chaptarr.tags = [{ id: 4, label: 'allseerr-lang-en' }];
    chaptarr.profiles = [
      // The profile made by hand applies to every author and is left alone
      {
        id: 1,
        enabled: true,
        required: [],
        ignored: ['/\\b(danish)\\b/i'],
        indexerId: 0,
        tags: [],
      },
      {
        id: 2,
        enabled: false,
        required: [],
        ignored: ['/\\b(danish)\\b/i'],
        indexerId: 0,
        tags: [4],
      },
    ];

    await ensureChaptarrLanguage(asApi(chaptarr), 'en');
    await ensureChaptarrLanguage(asApi(chaptarr), 'en');

    assert.deepStrictEqual(chaptarr.calls, ['update profile 2']);
    assert.deepStrictEqual(chaptarr.profiles[0].ignored, ['/\\b(danish)\\b/i']);
    assert.strictEqual(chaptarr.profiles[1].enabled, false);
    assert.deepStrictEqual(
      chaptarr.profiles[1].ignored,
      buildChaptarrLanguageProfile('en').ignored
    );
  });

  it('does not take over a profile shared with other tags', async () => {
    chaptarr.tags = [
      { id: 1, label: 'allseerr-lang-en' },
      { id: 2, label: 'kids' },
    ];
    chaptarr.profiles = [
      {
        id: 1,
        enabled: true,
        required: ['/kids/i'],
        ignored: [],
        indexerId: 0,
        tags: [1, 2],
      },
    ];

    await ensureChaptarrLanguage(asApi(chaptarr), 'en');

    assert.deepStrictEqual(chaptarr.calls, ['create profile 1']);
    assert.deepStrictEqual(chaptarr.profiles[0].required, ['/kids/i']);
  });

  it('sets nothing up for any language but returns the language tags', async () => {
    chaptarr.tags = [
      { id: 1, label: 'allseerr-lang-en' },
      { id: 2, label: 'kids' },
      { id: 3, label: 'allseerr-lang-de' },
    ];

    const tags = await ensureChaptarrLanguage(asApi(chaptarr), 'any');

    assert.deepStrictEqual(tags, { managedTagIds: [1, 3] });
    assert.deepStrictEqual(chaptarr.calls, []);
  });

  it('leaves Readarr compatible servers alone', async () => {
    chaptarr.isChaptarr = false;

    assert.strictEqual(
      await getChaptarrLanguageTags(asApi(chaptarr), 'en'),
      undefined
    );
    assert.deepStrictEqual(chaptarr.calls, []);
  });

  it('carries on without a language when Chaptarr refuses it', async () => {
    chaptarr.createReleaseProfile = async () => {
      throw new Error('Validation failed');
    };

    assert.strictEqual(
      await getChaptarrLanguageTags(asApi(chaptarr), 'fr'),
      undefined
    );
  });
});

describe('author language tags', () => {
  const languageTags = (tagId: number | undefined, ...managed: number[]) => ({
    tagId,
    managedTagIds: [...managed, ...(tagId ? [tagId] : [])],
  });

  it('swaps the language tag and keeps the other tags', () => {
    assert.deepStrictEqual(withLanguageTag([7, 1], languageTags(2, 1)), [7, 2]);
    assert.deepStrictEqual(withLanguageTag([7, 2], languageTags(2, 1)), [7, 2]);
    assert.deepStrictEqual(
      withLanguageTag([7, 1, 3], languageTags(undefined, 1, 3)),
      [7]
    );
  });

  const author = (fields: Partial<ChaptarrAuthor>): ChaptarrAuthor => ({
    id: 9,
    authorName: 'Jo Nesbo',
    foreignAuthorId: 'gr:9',
    ...fields,
  });

  it('tags the ebook tags of an author for an ebook', async () => {
    const chaptarr = new FakeChaptarr();
    chaptarr.authors[9] = author({
      tags: [7, 1],
      ebookTags: [1],
      audiobookTags: [7],
    });

    await applyChaptarrLanguageTag(asApi(chaptarr), 9, 'ebook', {
      tagId: 2,
      managedTagIds: [1, 2],
    });

    assert.deepStrictEqual(chaptarr.authors[9].ebookTags, [2]);
    assert.deepStrictEqual(chaptarr.authors[9].audiobookTags, [7]);
    assert.deepStrictEqual(chaptarr.authors[9].tags, [2, 7]);
  });

  it('tags the audiobook tags of an author for an audiobook', async () => {
    const chaptarr = new FakeChaptarr();
    chaptarr.authors[9] = author({
      tags: [5],
      ebookTags: [5],
      audiobookTags: [],
    });

    await applyChaptarrLanguageTag(asApi(chaptarr), 9, 'audiobook', {
      tagId: 2,
      managedTagIds: [2],
    });

    assert.deepStrictEqual(chaptarr.authors[9].ebookTags, [5]);
    assert.deepStrictEqual(chaptarr.authors[9].audiobookTags, [2]);
  });

  it('keeps both formats of an author with only combined tags', async () => {
    const chaptarr = new FakeChaptarr();
    chaptarr.authors[9] = author({
      tags: [5],
      ebookTags: null,
      audiobookTags: null,
    });

    await applyChaptarrLanguageTag(asApi(chaptarr), 9, 'ebook', {
      tagId: 2,
      managedTagIds: [2],
    });

    assert.deepStrictEqual(chaptarr.authors[9].ebookTags, [5, 2]);
    assert.deepStrictEqual(chaptarr.authors[9].audiobookTags, [5]);
  });

  it('leaves an author that already has the tag alone', async () => {
    const chaptarr = new FakeChaptarr();
    chaptarr.authors[9] = author({ ebookTags: [5, 2], audiobookTags: [] });

    await applyChaptarrLanguageTag(asApi(chaptarr), 9, 'ebook', {
      tagId: 2,
      managedTagIds: [2],
    });

    assert.deepStrictEqual(chaptarr.calls, []);
  });
});

describe('language codes', () => {
  it('has markers for every requestable language', () => {
    const codes: BookLanguageCode[] = BOOK_LANGUAGES.map(({ code }) => code);

    for (const code of codes) {
      assert.doesNotThrow(() => buildChaptarrLanguageProfile(code), code);
    }
  });
});
