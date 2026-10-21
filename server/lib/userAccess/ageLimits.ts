/**
 * Age limits set once per person and passed on to every app that can
 * restrict content by age. Each limit is the oldest age a person may see
 * content rated for.
 */
export const AGE_LIMITS = ['none', 'teen', 'tween', 'kids'] as const;

export type AgeLimit = (typeof AGE_LIMITS)[number];

export const isAgeLimit = (value: unknown): value is AgeLimit =>
  typeof value === 'string' &&
  (AGE_LIMITS as readonly string[]).includes(value);

// The oldest rated age each limit allows, none has no limit
export const AGE_LIMIT_MAX_AGE: Record<Exclude<AgeLimit, 'none'>, number> = {
  kids: 9,
  tween: 12,
  teen: 15,
};

export const isRestricted = (
  limit: AgeLimit | null | undefined
): limit is Exclude<AgeLimit, 'none'> => !!limit && limit !== 'none';

/**
 * Kavita's AgeRating values used here, from Kavita's own enum. A user sees
 * content rated at or below the rating they are restricted to.
 */
export enum KavitaAgeRating {
  NotApplicable = -1,
  G = 4,
  KidsToAdults = 7,
  Mature15Plus = 9,
}

// The Kavita rating names its OpenID Connect sync reads from role claims
const KAVITA_RATING_NAMES: Record<KavitaAgeRating, string> = {
  [KavitaAgeRating.NotApplicable]: 'NotApplicable',
  [KavitaAgeRating.G]: 'G',
  [KavitaAgeRating.KidsToAdults]: 'KidsToAdults',
  [KavitaAgeRating.Mature15Plus]: 'Mature15Plus',
};

/**
 * The highest Kavita rating each limit allows. Everyone 10+ is 10, Teen is
 * 13 and Mature 17+ is 17, so each limit stops just below the next of them.
 */
const KAVITA_RATINGS: Record<Exclude<AgeLimit, 'none'>, KavitaAgeRating> = {
  kids: KavitaAgeRating.G,
  tween: KavitaAgeRating.KidsToAdults,
  teen: KavitaAgeRating.Mature15Plus,
};

export interface KavitaAgeRestriction {
  ageRating: KavitaAgeRating;
  includeUnknowns: boolean;
}

export const toKavitaAgeRestriction = (
  limit: AgeLimit | null | undefined,
  includeUnrated: boolean
): KavitaAgeRestriction =>
  isRestricted(limit)
    ? { ageRating: KAVITA_RATINGS[limit], includeUnknowns: includeUnrated }
    : { ageRating: KavitaAgeRating.NotApplicable, includeUnknowns: true };

/**
 * The role claims Kavita reads its age restriction from, when it syncs user
 * settings from Allseerr's sign in
 */
export const toKavitaAgeRoles = (
  limit: AgeLimit | null | undefined,
  includeUnrated: boolean
): string[] => {
  if (!isRestricted(limit)) {
    return [];
  }

  const roles = [
    `age-restriction-${KAVITA_RATING_NAMES[KAVITA_RATINGS[limit]]}`,
  ];

  if (includeUnrated) {
    roles.push('age-restriction-include-unknowns');
  }

  return roles;
};

export interface KomgaAgeRestriction {
  age: number;
  restriction: 'ALLOW_ONLY' | 'EXCLUDE' | 'NONE';
}

/**
 * Komga's age restriction. Allow only shows rated series at or under the
 * age, so unrated ones are hidden. Exclude hides series rated at or over
 * the age and shows unrated ones.
 */
export const toKomgaAgeRestriction = (
  limit: AgeLimit | null | undefined,
  includeUnrated: boolean
): KomgaAgeRestriction => {
  if (!isRestricted(limit)) {
    return { age: 0, restriction: 'NONE' };
  }

  const maxAge = AGE_LIMIT_MAX_AGE[limit];

  return includeUnrated
    ? { age: maxAge + 1, restriction: 'EXCLUDE' }
    : { age: maxAge, restriction: 'ALLOW_ONLY' };
};

/**
 * Audiobookshelf only knows explicit or not, so any limit hides explicit
 * books
 */
export const allowsExplicitContent = (
  limit: AgeLimit | null | undefined
): boolean => !isRestricted(limit);

// Subjects that mark a work as written for adults
const ADULT_SUBJECTS = [
  'erotica',
  'erotic fiction',
  'erotic literature',
  'erotic stories',
  'erotic romance',
  'pornography',
  'sexually explicit',
  'adult content',
];

const normalizeSubject = (subject: string): string =>
  subject
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether a work's subjects say it is written for adults
 */
export const isAdultWork = (subjects: readonly string[] | undefined): boolean =>
  (subjects ?? []).some((subject) => {
    const normalized = normalizeSubject(subject);

    return ADULT_SUBJECTS.some(
      (adult) =>
        normalized === adult ||
        normalized.startsWith(`${adult} `) ||
        normalized.endsWith(` ${adult}`) ||
        normalized.includes(` ${adult} `)
    );
  });

/**
 * Whether a person with this limit may request a work with these subjects
 */
export const canRequestWork = (
  limit: AgeLimit | null | undefined,
  subjects: readonly string[] | undefined
): boolean => !isRestricted(limit) || !isAdultWork(subjects);
