import type { MediaRequest } from '@server/entity/MediaRequest';
import type {
  ServiceCommonServer,
  ServiceCommonServerWithDetails,
} from '@server/interfaces/api/serviceInterfaces';
import useSWR from 'swr';

interface OverrideStatus {
  server?: string;
  profile?: string;
  rootFolder?: string;
  languageProfile?: string;
}

const useRequestOverride = (request: MediaRequest): OverrideStatus => {
  const service =
    request.type === 'movie'
      ? 'radarr'
      : request.type === 'music'
        ? 'lidarr'
        : 'sonarr';
  // LazyLibrarian takes no request options, so books have no overrides
  const hasOverrides = request.type !== 'book';
  const { data: allServers } = useSWR<ServiceCommonServer[]>(
    hasOverrides ? `/api/v1/service/${service}` : null
  );

  const { data } = useSWR<ServiceCommonServerWithDetails>(
    hasOverrides ? `/api/v1/service/${service}/${request.serverId}` : null
  );

  if (!data || !allServers) {
    return {};
  }

  const defaultServer = allServers.find(
    (server) => server.is4k === request.is4k && server.isDefault
  );

  const activeServer = allServers.find(
    (server) => server.id === request.serverId
  );

  return {
    server:
      activeServer && request.serverId !== defaultServer?.id
        ? activeServer.name
        : undefined,
    profile:
      defaultServer?.activeProfileId !== request.profileId
        ? data.profiles.find((profile) => profile.id === request.profileId)
            ?.name
        : undefined,
    rootFolder:
      defaultServer?.activeDirectory !== request.rootFolder
        ? request.rootFolder
        : undefined,
    languageProfile:
      request.type === 'tv' &&
      defaultServer?.activeLanguageProfileId !== request.languageProfileId
        ? data.languageProfiles?.find(
            (profile) => profile.id === request.languageProfileId
          )?.name
        : undefined,
  };
};

export default useRequestOverride;
