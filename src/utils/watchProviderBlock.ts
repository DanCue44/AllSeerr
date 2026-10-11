import type {
  WatchProviderDetails,
  WatchProviders,
} from '@server/models/common';

/**
 * Parses the stored provider list ("8|1796") into TMDB provider ids.
 */
export const parseBlockedWatchProviders = (value?: string): number[] =>
  (value ?? '')
    .split(/[|,]/)
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

/**
 * Returns the blocked subscription providers a title is streaming on in the
 * server's streaming region. Mirrors the check made when a request is created.
 */
export const getBlockingProviders = (
  watchProviders: WatchProviders[] | undefined,
  region: string,
  blockedWatchProviders: string
): WatchProviderDetails[] => {
  const blockedIds = parseBlockedWatchProviders(blockedWatchProviders);

  if (!blockedIds.length || !watchProviders) {
    return [];
  }

  return (
    watchProviders
      .find((provider) => provider.iso_3166_1 === region)
      ?.flatrate?.filter((provider) => blockedIds.includes(provider.id)) ?? []
  );
};
