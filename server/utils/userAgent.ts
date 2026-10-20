import { ALLSEERR_REPO_URL } from '@server/constants/repository';
import { getAppVersion } from '@server/utils/appVersion';
import type { InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

const USER_AGENT = `Allseerr/${getAppVersion()}`;

export const getUserAgent = (): string => {
  return USER_AGENT;
};

/**
 * For services that ask clients to say how to reach them, such as the
 * MetaBrainz ones and OpenLibrary
 */
export const getContactUserAgent = (): string =>
  `${USER_AGENT} (+${ALLSEERR_REPO_URL})`;

export function userAgentRequestInterceptor(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  if (!config.headers.has('User-Agent')) {
    config.headers.set('User-Agent', getUserAgent());
  }

  return config;
}

// default instance only, axios.create() clients register this themselves
axios.interceptors.request.use(userAgentRequestInterceptor);
