// Languages books can be requested in, by ISO 639-1 code
export const BOOK_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
] as const;

export type BookLanguageCode = (typeof BOOK_LANGUAGES)[number]['code'];

// A book requested in any language is downloaded in whichever one is found
export const BOOK_LANGUAGE_ANY = 'any';

export type BookLanguage = BookLanguageCode | typeof BOOK_LANGUAGE_ANY;

export const DEFAULT_BOOK_LANGUAGE: BookLanguage = 'en';

export const BOOK_LANGUAGE_CODES: BookLanguage[] = [
  ...BOOK_LANGUAGES.map((language) => language.code),
  BOOK_LANGUAGE_ANY,
];

export const isBookLanguage = (value: unknown): value is BookLanguage =>
  typeof value === 'string' &&
  (BOOK_LANGUAGE_CODES as string[]).includes(value);

/**
 * The English name of a book language, as used in notifications and in the
 * services books are sent to
 */
export const getBookLanguageName = (language: BookLanguage): string =>
  language === BOOK_LANGUAGE_ANY
    ? 'Any Language'
    : (BOOK_LANGUAGES.find((entry) => entry.code === language)?.name ??
      language);

/**
 * The language books are requested in for a user: the user's own choice,
 * otherwise the server default. Unknown values are skipped, so a language
 * that is no longer supported falls back to the next one.
 */
export const getEffectiveBookLanguage = (
  userLanguage?: string | null,
  serverLanguage?: string | null
): BookLanguage =>
  isBookLanguage(userLanguage)
    ? userLanguage
    : isBookLanguage(serverLanguage)
      ? serverLanguage
      : DEFAULT_BOOK_LANGUAGE;

/**
 * The language a book request is made in. A requested language is only
 * honored for users who manage requests, everyone else requests in their
 * effective language.
 */
export const resolveRequestBookLanguage = ({
  requested,
  canManage,
  userLanguage,
  serverLanguage,
}: {
  requested?: string | null;
  canManage: boolean;
  userLanguage?: string | null;
  serverLanguage?: string | null;
}): BookLanguage =>
  canManage && isBookLanguage(requested)
    ? requested
    : getEffectiveBookLanguage(userLanguage, serverLanguage);
