import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type {
  TmdbKeyword,
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import OverrideRule from '@server/entity/OverrideRule';
import type { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';

export type OverrideRulesResult = {
  rootFolder: string | null;
  profileId: number | null;
  tags: number[] | null;
};

export type OverrideRuleMatchContext = {
  mediaType: MediaType;
  // Music has no TMDB details, so only the user condition applies to it
  tmdbMedia?: TmdbMovieDetails | TmdbTvDetails;
  requestUser: User;
};

/**
 * Checks the conditions of a rule (users, genres, languages and keywords)
 * against the requested media and user
 */
export function matchesOverrideRule(
  rule: OverrideRule,
  { mediaType, tmdbMedia, requestUser }: OverrideRuleMatchContext
): boolean {
  if (!tmdbMedia) {
    return (
      !rule.genre &&
      !rule.language &&
      !rule.keywords &&
      (!rule.users ||
        rule.users
          .split(',')
          .some((userId) => Number(userId) === requestUser.id))
    );
  }

  const hasAnimeKeyword =
    'results' in tmdbMedia.keywords &&
    tmdbMedia.keywords.results.some(
      (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
    );

  // Skip override rules if the media is an anime TV show as anime TV
  // is handled by default and override rules do not explicitly include
  // the anime keyword
  if (
    mediaType === MediaType.TV &&
    hasAnimeKeyword &&
    (!rule.keywords ||
      !rule.keywords.split(',').map(Number).includes(ANIME_KEYWORD_ID))
  ) {
    return false;
  }

  if (
    rule.users &&
    !rule.users.split(',').some((userId) => Number(userId) === requestUser.id)
  ) {
    return false;
  }
  if (
    rule.genre &&
    !rule.genre
      .split(',')
      .some((genreId) =>
        tmdbMedia.genres.map((genre) => genre.id).includes(Number(genreId))
      )
  ) {
    return false;
  }
  if (
    rule.language &&
    !rule.language
      .split('|')
      .some((languageId) => languageId === tmdbMedia.original_language)
  ) {
    return false;
  }
  if (
    rule.keywords &&
    !rule.keywords.split(',').some((keywordId) => {
      let keywordList: TmdbKeyword[] = [];

      if ('keywords' in tmdbMedia.keywords) {
        keywordList = tmdbMedia.keywords.keywords;
      } else if ('results' in tmdbMedia.keywords) {
        keywordList = tmdbMedia.keywords.results;
      }

      return keywordList
        .map((keyword: TmdbKeyword) => keyword.id)
        .includes(Number(keywordId));
    })
  ) {
    return false;
  }
  return true;
}

function getServices(mediaType: MediaType) {
  const settings = getSettings();

  switch (mediaType) {
    case MediaType.MOVIE:
      return settings.radarr;
    case MediaType.MUSIC:
      return settings.lidarr;
    default:
      return settings.sonarr;
  }
}

function getServiceIdField(
  mediaType: MediaType
): 'radarrServiceId' | 'sonarrServiceId' | 'lidarrServiceId' {
  switch (mediaType) {
    case MediaType.MOVIE:
      return 'radarrServiceId';
    case MediaType.MUSIC:
      return 'lidarrServiceId';
    default:
      return 'sonarrServiceId';
  }
}

function getDefaultServiceId(
  mediaType: MediaType,
  is4k: boolean
): number | undefined {
  // Lidarr servers have no 4K variant
  return getServices(mediaType).find(
    (service) =>
      (mediaType === MediaType.MUSIC || service.is4k === is4k) &&
      service.isDefault
  )?.id;
}

async function overrideRules({
  mediaType,
  is4k,
  tmdbMedia,
  requestUser,
  tags = null,
  serviceId,
}: {
  mediaType: MediaType;
  is4k: boolean;
  tmdbMedia?: TmdbMovieDetails | TmdbTvDetails;
  requestUser: User;
  tags?: number[] | null;
  serviceId?: number;
}): Promise<OverrideRulesResult> {
  let rootFolder: string | null = null;
  let profileId: number | null = null;

  const serviceIdField = getServiceIdField(mediaType);
  if (serviceId === undefined) {
    serviceId = getDefaultServiceId(mediaType, is4k);
  }

  const overrideRuleRepository = getRepository(OverrideRule);
  const rules =
    serviceId === undefined
      ? []
      : await overrideRuleRepository.find({
          where: { [serviceIdField]: serviceId },
        });

  const appliedOverrideRules = rules.filter(
    (rule) =>
      // Rules that only auto-approve have no settings to apply
      (rule.rootFolder || rule.profileId || rule.tags) &&
      matchesOverrideRule(rule, { mediaType, tmdbMedia, requestUser })
  );

  // hacky way to prioritize rules
  // TODO: make this better
  const hasSpecificOverrideValue = (
    rule: OverrideRule,
    key: keyof OverrideRule
  ) => {
    const value = rule[key];
    if (value == null) return false;
    return typeof value !== 'string' || value.trim() !== '';
  };
  const prioritizedRule = appliedOverrideRules.sort((a, b) => {
    const keys: (keyof OverrideRule)[] = ['genre', 'language', 'keywords'];
    const aSpecificity = keys.filter((key) =>
      hasSpecificOverrideValue(a, key)
    ).length;
    const bSpecificity = keys.filter((key) =>
      hasSpecificOverrideValue(b, key)
    ).length;
    // Take the rule with the most specific condition first
    return bSpecificity - aSpecificity;
  })[0];

  if (prioritizedRule) {
    if (prioritizedRule.rootFolder) {
      rootFolder = prioritizedRule.rootFolder;
    }
    if (prioritizedRule.profileId) {
      profileId = prioritizedRule.profileId;
    }
    if (prioritizedRule.tags) {
      tags = [
        ...new Set([
          ...(tags || []),
          ...prioritizedRule.tags.split(',').map((tag) => Number(tag)),
        ]),
      ];
    }
  }

  return { rootFolder, profileId, tags };
}

/**
 * Checks whether an auto-approve rule matches the request. Rules only apply
 * to the service they target, so a 4K request can only be auto-approved by a
 * rule on a 4K service.
 */
export async function matchesAutoApproveRule({
  mediaType,
  is4k,
  tmdbMedia,
  requestUser,
  serviceId,
  seasonCount,
}: {
  mediaType: MediaType;
  is4k: boolean;
  tmdbMedia?: TmdbMovieDetails | TmdbTvDetails;
  requestUser: User;
  serviceId?: number;
  seasonCount?: number;
}): Promise<boolean> {
  if (serviceId === undefined) {
    serviceId = getDefaultServiceId(mediaType, is4k);
  }

  const service = getServices(mediaType).find((s) => s.id === serviceId);

  if (!service || (mediaType !== MediaType.MUSIC && service.is4k !== is4k)) {
    return false;
  }

  const serviceIdField = getServiceIdField(mediaType);
  const overrideRuleRepository = getRepository(OverrideRule);
  const rules = await overrideRuleRepository.find({
    where: { [serviceIdField]: serviceId, autoApprove: true },
  });

  return rules.some(
    (rule) =>
      matchesOverrideRule(rule, { mediaType, tmdbMedia, requestUser }) &&
      // The season limit only applies to series requests
      (mediaType !== MediaType.TV ||
        !rule.maxSeasons ||
        (seasonCount ?? 0) <= rule.maxSeasons)
  );
}

export default overrideRules;
