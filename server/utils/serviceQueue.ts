import AsyncLock from '@server/utils/asyncLock';

// Adds to Lidarr, LazyLibrarian and Chaptarr run one at a time, so a bulk
// request does not send dozens of adds at once. Lidarr and Chaptarr would
// otherwise try to add the artist or author once per album or book, and
// LazyLibrarian reads its whole library for every book it is sent.
const serviceQueue = new AsyncLock();

export const lidarrKey = (serverId: number) => `lidarr:${serverId}`;
export const LAZYLIBRARIAN_KEY = 'lazylibrarian';
export const chaptarrKey = (serverId: number) => `chaptarr:${serverId}`;

export default serviceQueue;
