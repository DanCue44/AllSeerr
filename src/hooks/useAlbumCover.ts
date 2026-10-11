import { useEffect, useState } from 'react';

// Covers are asked for in batches, so a list of albums costs one request
const BATCH_SIZE = 20;
const BATCH_DELAY = 50;

const coverCache = new Map<string, string | null>();
const listeners = new Map<string, Set<(cover: string | null) => void>>();
let queuedIds = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | undefined;

const notify = (id: string, cover: string | null) => {
  coverCache.set(id, cover);
  listeners.get(id)?.forEach((listener) => listener(cover));
};

const fetchQueuedCovers = async () => {
  batchTimer = undefined;
  const ids = [...queuedIds];
  queuedIds = new Set();

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch(`/api/v1/coverart/batch/${batch.join(',')}`);
      const covers: Record<string, string | null> = response.ok
        ? await response.json()
        : {};

      batch.forEach((id) => notify(id, covers[id] ?? null));
    } catch {
      batch.forEach((id) => notify(id, null));
    }
  }
};

/**
 * Returns the cover of an album. Albums whose cover the server did not know
 * yet are looked up in the background, together with the rest of the list.
 */
const useAlbumCover = (
  mbId: string,
  posterPath?: string | null,
  needsCoverArt?: boolean
): string | null => {
  const [cover, setCover] = useState<string | null>(
    posterPath ?? coverCache.get(mbId) ?? null
  );

  useEffect(() => {
    if (posterPath) {
      setCover(posterPath);
      return;
    }

    if (!needsCoverArt) {
      return;
    }

    if (coverCache.has(mbId)) {
      setCover(coverCache.get(mbId) ?? null);
      return;
    }

    const listener = (newCover: string | null) => setCover(newCover);
    const idListeners = listeners.get(mbId) ?? new Set();
    idListeners.add(listener);
    listeners.set(mbId, idListeners);

    queuedIds.add(mbId);
    if (!batchTimer) {
      batchTimer = setTimeout(fetchQueuedCovers, BATCH_DELAY);
    }

    return () => {
      idListeners.delete(listener);
    };
  }, [mbId, posterPath, needsCoverArt]);

  return cover;
};

export default useAlbumCover;
