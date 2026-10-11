import type { TmdbWatchProviders } from '@server/api/themoviedb/interfaces';
import { getSettings } from '@server/lib/settings';

export interface BlockingWatchProvider {
  id: number;
  name: string;
}

/**
 * Parses the stored provider list ("8|1796") into TMDB provider ids.
 */
export const parseBlockedWatchProviders = (value?: string): number[] =>
  (value ?? '')
    .split(/[|,]/)
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

/**
 * The region used to decide whether a title is streaming. Follows the
 * streaming region, then the discover region, then US.
 */
export const getBlockRegion = (): string => {
  const { main } = getSettings();
  return main.streamingRegion || main.discoverRegion || 'US';
};

/**
 * Returns the blocked subscription providers a title is streaming on.
 * Only flatrate (subscription) offers count. Rent, buy, free and ad
 * supported offers never block a request.
 */
export const findBlockingProviders = (
  watchProviders: { [iso_3166_1: string]: TmdbWatchProviders } | undefined,
  region: string,
  blockedIds: number[]
): BlockingWatchProvider[] => {
  if (!blockedIds.length || !watchProviders) {
    return [];
  }

  const flatrate = watchProviders[region]?.flatrate ?? [];

  return flatrate
    .filter((provider) => blockedIds.includes(provider.provider_id))
    .map((provider) => ({
      id: provider.provider_id,
      name: provider.provider_name,
    }));
};

/**
 * Checks a title against the configured blocked providers.
 */
export const getBlockingProviders = (
  watchProviders: { [iso_3166_1: string]: TmdbWatchProviders } | undefined
): BlockingWatchProvider[] =>
  findBlockingProviders(
    watchProviders,
    getBlockRegion(),
    parseBlockedWatchProviders(getSettings().main.blockedWatchProviders)
  );
