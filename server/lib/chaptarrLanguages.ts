import type ChaptarrAPI from '@server/api/servarr/chaptarr';
import type {
  ChaptarrAuthor,
  ChaptarrEdition,
  ChaptarrMediaType,
  ChaptarrReleaseProfile,
} from '@server/api/servarr/chaptarr';
import type {
  BookLanguage,
  BookLanguageCode,
} from '@server/constants/bookLanguages';
import {
  BOOK_LANGUAGE_ANY,
  getBookLanguageName,
} from '@server/constants/bookLanguages';
import logger from '@server/logger';

/**
 * How releases in a language name it. Release profiles match these against
 * release titles, which also hold the book title, so every term has to stay
 * clear of words English titles use.
 */
interface LanguageMarkers {
  // English names of the language. They are English words too, as in The
  // Dutch House or The Danish Girl, so they only count where a release
  // names its language: in brackets or before "edition" and the like.
  names: string[];
  // Names of the language in the language itself, matched anywhere
  native: string[];
  // Words only releases in the language use, matched anywhere
  words: string[];
  // Language tags of release names, matched case sensitively. Tags that
  // are common English words in capitals (IT, NO, SE) are left out.
  codes: string[];
  // Characters of the language's script, matched anywhere
  script?: string;
  // How editions in Chaptarr's metadata name the language
  editionLanguages: string[];
}

type MarkedLanguage = BookLanguageCode | 'hu' | 'cs';

/**
 * Release markers by language. Hungarian and Czech cannot be requested but
 * are kept out of the other languages' releases. Change a term here and the
 * release profiles are updated the next time a book is sent to Chaptarr.
 */
export const LANGUAGE_MARKERS: Record<MarkedLanguage, LanguageMarkers> = {
  en: {
    names: ['english'],
    native: [],
    words: [],
    codes: [],
    editionLanguages: ['en', 'eng', 'english'],
  },
  es: {
    names: ['spanish'],
    native: ['espanol', 'español', 'castellano'],
    words: ['edicion', 'edición', 'traduccion', 'traducción'],
    codes: ['ES', 'ESP'],
    editionLanguages: ['es', 'spa', 'spanish', 'español', 'espanol'],
  },
  fr: {
    names: ['french'],
    native: ['francais', 'français'],
    words: ['livre', 'traduit'],
    codes: ['FR'],
    editionLanguages: ['fr', 'fra', 'fre', 'french', 'français', 'francais'],
  },
  de: {
    names: ['german'],
    native: ['deutsch'],
    words: [
      'ungekürzt',
      'ungekurzt',
      'gekürzt',
      'gekurzt',
      'hörbuch',
      'horbuch',
      'hoerbuch',
      'hörspiel',
      'horspiel',
      'hoerspiel',
      'autorisierte',
      'ausgabe',
    ],
    codes: ['DE', 'GER'],
    editionLanguages: ['de', 'deu', 'ger', 'german', 'deutsch'],
  },
  it: {
    names: ['italian'],
    native: ['italiano'],
    words: ['edizione', 'tradotto', 'romanzo'],
    codes: ['ITA'],
    editionLanguages: ['it', 'ita', 'italian', 'italiano'],
  },
  pt: {
    names: ['portuguese', 'brazilian'],
    native: ['portugues', 'português', 'brasileiro'],
    words: ['edição', 'edicao', 'traduzido', 'audiolivro', 'livro'],
    codes: ['PT'],
    editionLanguages: ['pt', 'por', 'portuguese', 'português', 'portugues'],
  },
  nl: {
    names: ['dutch', 'flemish'],
    native: ['nederlands', 'vlaams'],
    words: ['luisterboek', 'vertaald', 'uitgave'],
    codes: ['NL'],
    editionLanguages: ['nl', 'nld', 'dut', 'dutch', 'nederlands'],
  },
  sv: {
    names: ['swedish'],
    native: ['svenska'],
    words: ['ljudbok', 'utgåva', 'utgava'],
    codes: ['SWE'],
    editionLanguages: ['sv', 'swe', 'swedish', 'svenska'],
  },
  da: {
    names: ['danish'],
    native: ['dansk'],
    words: ['lydbog', 'udgave', 'oversat'],
    codes: ['DK'],
    editionLanguages: ['da', 'dan', 'danish', 'dansk'],
  },
  no: {
    names: ['norwegian'],
    native: ['norsk', 'bokmål', 'bokmal'],
    words: ['lydbok', 'utgave', 'oversatt'],
    codes: [],
    editionLanguages: [
      'no',
      'nb',
      'nn',
      'nor',
      'nob',
      'nno',
      'norwegian',
      'norsk',
    ],
  },
  fi: {
    names: ['finnish'],
    native: ['suomi', 'suomeksi'],
    words: [],
    codes: ['FI'],
    editionLanguages: ['fi', 'fin', 'finnish', 'suomi'],
  },
  pl: {
    names: ['polish'],
    native: ['polski', 'polska'],
    words: ['wydanie'],
    codes: ['PL'],
    editionLanguages: ['pl', 'pol', 'polish', 'polski'],
  },
  ru: {
    names: ['russian'],
    native: [],
    words: [],
    codes: ['RU', 'RUS'],
    script: '\\u0400-\\u04FF',
    editionLanguages: ['ru', 'rus', 'russian'],
  },
  ja: {
    names: ['japanese'],
    native: ['nihongo'],
    words: [],
    codes: ['JPN'],
    // Kana, as kanji are shared with Chinese
    script: '\\u3040-\\u30FF',
    editionLanguages: ['ja', 'jpn', 'japanese'],
  },
  zh: {
    names: ['chinese', 'mandarin'],
    native: ['zhongwen'],
    words: [],
    codes: ['CHS', 'CHT'],
    script: '\\u4E00-\\u9FFF',
    editionLanguages: ['zh', 'zho', 'chi', 'chinese'],
  },
  ko: {
    names: ['korean'],
    native: ['hangugeo'],
    words: [],
    codes: ['KOR'],
    script: '\\uAC00-\\uD7AF',
    editionLanguages: ['ko', 'kor', 'korean'],
  },
  hu: {
    names: ['hungarian'],
    native: ['magyar'],
    words: [],
    codes: ['HU'],
    editionLanguages: [],
  },
  cs: {
    names: ['czech'],
    native: ['cesky', 'cestina'],
    words: [],
    codes: ['CZ'],
    editionLanguages: [],
  },
};

// Words of several languages other than English, kept out of English
// releases only
const SHARED_FOREIGN_WORDS = [
  'biografie',
  'biografia',
  'biografi',
  'audiolibro',
];

// Words after a language name that mark it as the language of a release
const LANGUAGE_CONTEXT_WORDS = [
  'edition',
  'version',
  'translation',
  'translated',
  'language',
  'audiobook',
  'ebook',
];

export const CHAPTARR_LANGUAGE_TAG_PREFIX = 'allseerr-lang-';

export const getChaptarrLanguageTagLabel = (code: BookLanguageCode): string =>
  `${CHAPTARR_LANGUAGE_TAG_PREFIX}${code}`;

const alternation = (terms: string[]): string => [...new Set(terms)].join('|');

const wordPattern = (terms: string[], flags = 'i'): string[] =>
  terms.length ? [`/\\b(${alternation(terms)})\\b/${flags}`] : [];

/**
 * Patterns that find where a release names its language with an English
 * language name: "[German]", "(German/English)", "Spanish translation",
 * "(Dutch Edition)" or "Title.GERMAN.EPUB". A name in brackets has to end
 * there or be followed by another language, so series names in brackets
 * such as "(Spanish Love Deception #1)" do not count.
 */
const languageNamePatterns = (names: string[]): string[] => {
  if (!names.length) {
    return [];
  }

  const list = alternation(names);
  const upper = alternation(names.map((name) => name.toUpperCase()));
  const context = alternation(LANGUAGE_CONTEXT_WORDS);

  return [
    `/[\\[({]\\s*(in\\s+)?(${list})\\s*([\\])}/&+]|$)/i`,
    `/\\b(${list})\\s+(${context})\\b/i`,
    `/[._-](${upper})([._-]|$)/`,
  ];
};

const otherLanguages = (code: BookLanguageCode): LanguageMarkers[] =>
  (Object.keys(LANGUAGE_MARKERS) as MarkedLanguage[])
    .filter((other) => other !== code)
    .map((other) => LANGUAGE_MARKERS[other]);

export interface ChaptarrLanguageProfileTerms {
  required: string[];
  ignored: string[];
}

/**
 * The terms of the release profile for a language. English releases rarely
 * name their language, so English rejects releases that name any other
 * language instead. Every other language requires releases to name it, as
 * there are too many other languages to reject one by one, and also rejects
 * releases that name another language.
 */
export const buildChaptarrLanguageProfile = (
  code: BookLanguageCode
): ChaptarrLanguageProfileTerms => {
  const others = otherLanguages(code);
  const otherNames = others.flatMap((other) => other.names);
  const otherNative = others.flatMap((other) => other.native);

  if (code === 'en') {
    const scripts = others
      .map((other) => other.script)
      .filter((script): script is string => !!script);

    return {
      required: [],
      ignored: [
        ...languageNamePatterns(otherNames),
        ...wordPattern(otherNative),
        ...wordPattern(
          others.flatMap((other) => other.codes),
          ''
        ),
        ...wordPattern([
          ...others.flatMap((other) => other.words),
          ...SHARED_FOREIGN_WORDS,
        ]),
        ...(scripts.length ? [`/[${scripts.join('')}]/`] : []),
      ],
    };
  }

  const markers = LANGUAGE_MARKERS[code];

  return {
    required: [
      ...wordPattern([...markers.names, ...markers.native, ...markers.words]),
      ...wordPattern(markers.codes, ''),
      ...(markers.script ? [`/[${markers.script}]/`] : []),
    ],
    ignored: [...languageNamePatterns(otherNames), ...wordPattern(otherNative)],
  };
};

/**
 * Whether an edition from Chaptarr's metadata is in a language. Editions
 * name their language by ISO 639 code or by name, or not at all.
 */
export const isEditionInLanguage = (
  edition: Pick<ChaptarrEdition, 'language'>,
  code: BookLanguageCode
): boolean => {
  const language =
    typeof edition.language === 'string'
      ? edition.language.trim().toLowerCase()
      : '';

  return (
    !!language && LANGUAGE_MARKERS[code].editionLanguages.includes(language)
  );
};

export interface ChaptarrLanguageTags {
  // The tag of the requested language, missing for any language
  tagId?: number;
  // Every language tag AllSeerr manages, including the requested one
  managedTagIds: number[];
}

const sameTerms = (a: string[] = [], b: string[] = []): boolean =>
  a.length === b.length && a.every((term, index) => term === b[index]);

/**
 * Makes sure Chaptarr has the tag and the release profile of a language.
 * The profile applies to the authors carrying the tag. Chaptarr release
 * profiles have no name, so AllSeerr knows its profile by having only the
 * language tag. A profile whose terms are out of date is updated; one an
 * admin disabled stays disabled. Nothing is set up for any language, but
 * the language tags are still returned so they can be taken off an author.
 */
export const ensureChaptarrLanguage = async (
  chaptarr: ChaptarrAPI,
  language: BookLanguage
): Promise<ChaptarrLanguageTags> => {
  const tags = await chaptarr.getChaptarrTags();
  const managedTagIds = tags
    .filter((tag) =>
      tag.label.toLowerCase().startsWith(CHAPTARR_LANGUAGE_TAG_PREFIX)
    )
    .map((tag) => tag.id);

  if (language === BOOK_LANGUAGE_ANY) {
    return { managedTagIds };
  }

  const label = getChaptarrLanguageTagLabel(language);
  let tag = tags.find((existing) => existing.label.toLowerCase() === label);

  if (!tag) {
    tag = await chaptarr.createChaptarrTag(label);
    logger.info('Created language tag in Chaptarr', {
      label: 'Chaptarr',
      tag: label,
      tagId: tag.id,
    });
  }

  const tagId = tag.id;
  const terms = buildChaptarrLanguageProfile(language);
  const profiles = await chaptarr.getReleaseProfiles();
  const profile = profiles.find(
    (existing) => existing.tags?.length === 1 && existing.tags[0] === tagId
  );

  if (!profile) {
    const created: ChaptarrReleaseProfile = {
      enabled: true,
      required: terms.required,
      ignored: terms.ignored,
      indexerId: 0,
      tags: [tagId],
    };

    await chaptarr.createReleaseProfile(created);
    logger.info('Created language release profile in Chaptarr', {
      label: 'Chaptarr',
      language: getBookLanguageName(language),
      tagId,
    });
  } else if (
    !sameTerms(profile.required, terms.required) ||
    !sameTerms(profile.ignored, terms.ignored)
  ) {
    await chaptarr.updateReleaseProfile({
      ...profile,
      required: terms.required,
      ignored: terms.ignored,
    });
    logger.info('Updated language release profile in Chaptarr', {
      label: 'Chaptarr',
      language: getBookLanguageName(language),
      profileId: profile.id,
    });
  }

  return {
    tagId,
    managedTagIds: [...new Set([...managedTagIds, tagId])],
  };
};

/**
 * The tags of an author for a format with the language tag in place of any
 * other language tag. Tags AllSeerr does not manage are kept.
 */
export const withLanguageTag = (
  tags: number[],
  languageTags: ChaptarrLanguageTags
): number[] => [
  ...tags.filter(
    (tagId) =>
      tagId === languageTags.tagId ||
      !languageTags.managedTagIds.includes(tagId)
  ),
  ...(languageTags.tagId !== undefined && !tags.includes(languageTags.tagId)
    ? [languageTags.tagId]
    : []),
];

/**
 * Tags an author with a language for one format. Chaptarr picks release
 * profiles by the author's tags of the format a release is for, so the
 * language applies to every book of the author in that format: a new
 * request in another language takes the place of the earlier one.
 */
export const applyChaptarrLanguageTag = async (
  chaptarr: ChaptarrAPI,
  authorId: number,
  mediaType: ChaptarrMediaType,
  languageTags: ChaptarrLanguageTags
): Promise<void> => {
  const author = await chaptarr.getAuthor(authorId);
  const key = mediaType === 'ebook' ? 'ebookTags' : 'audiobookTags';
  // An author without per format tags has its tags for both
  const current = author[key] ?? author.tags ?? [];
  const tags = withLanguageTag(current, languageTags);

  if (
    current.length === tags.length &&
    tags.every((tagId) => current.includes(tagId))
  ) {
    return;
  }

  // Both formats are sent, as Chaptarr drops the tags of a format left
  // out, and the combined tags follow them
  const other = mediaType === 'ebook' ? 'audiobookTags' : 'ebookTags';
  const otherTags = author[other] ?? author.tags ?? [];
  const updated: ChaptarrAuthor = {
    ...author,
    [key]: tags,
    [other]: otherTags,
    tags: [...new Set([...tags, ...otherTags])],
  };

  await chaptarr.updateAuthor(updated);
  logger.info('Tagged author with the requested language in Chaptarr', {
    label: 'Chaptarr',
    authorId,
    authorName: author.authorName,
    mediaType,
    tags,
  });
};

/**
 * The language tags for a request, with the language's tag and release
 * profile set up. Readarr compatible servers other than Chaptarr have no
 * per format tags and are left alone. A failure is only logged, the book
 * is still requested, without a language.
 */
export const getChaptarrLanguageTags = async (
  chaptarr: ChaptarrAPI,
  language: BookLanguage,
  context: Record<string, unknown> = {}
): Promise<ChaptarrLanguageTags | undefined> => {
  try {
    const { isChaptarr } = await chaptarr.getCapabilities();

    if (!isChaptarr) {
      return undefined;
    }

    return await ensureChaptarrLanguage(chaptarr, language);
  } catch (e) {
    logger.warn('Could not set up the requested language in Chaptarr', {
      label: 'Chaptarr',
      ...context,
      language,
      errorMessage: e.message,
    });

    return undefined;
  }
};
