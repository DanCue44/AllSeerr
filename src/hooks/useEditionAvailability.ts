import axios from 'axios';
import useSWR from 'swr';

export type EditionFormat = 'ebook' | 'audiobook';

export interface EditionAvailability {
  // null when the catalog could not be asked
  exists: boolean | null;
  // Audible product of the audiobook, with its narrators, length in
  // minutes and cover
  asin?: string;
  narrators?: string[];
  runtimeMinutes?: number;
  coverUrl?: string;
  // Google Books volume of the ebook
  volumeId?: string;
}

interface AvailabilityQuery {
  olId: string;
  title: string;
  author?: string;
}

// Books are asked about in batches, so a page of cards costs one request
// per format
const BATCH_SIZE = 50;
const BATCH_DELAY = 60;
// Answers barely change, the server keeps them for days
const DEDUPE_INTERVAL = 24 * 60 * 60 * 1000;

// Audiobooks are looked up on Audible, ebooks on Google Books
const BATCH_URLS: Record<EditionFormat, string> = {
  ebook: '/api/v1/book/ebook-availability',
  audiobook: '/api/v1/book/audiobook-availability',
};

interface QueueEntry {
  query: AvailabilityQuery;
  resolve: (result: EditionAvailability) => void;
}

const queues: Record<EditionFormat, QueueEntry[]> = {
  ebook: [],
  audiobook: [],
};
const batchTimers: Partial<
  Record<EditionFormat, ReturnType<typeof setTimeout>>
> = {};

const flushQueue = async (format: EditionFormat) => {
  batchTimers[format] = undefined;
  const pending = queues[format];
  queues[format] = [];

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    try {
      const response = await axios.post<Record<string, EditionAvailability>>(
        BATCH_URLS[format],
        { books: batch.map((entry) => entry.query) }
      );

      batch.forEach((entry) =>
        entry.resolve(response.data[entry.query.olId] ?? { exists: null })
      );
    } catch {
      batch.forEach((entry) => entry.resolve({ exists: null }));
    }
  }
};

const queueAvailability = (format: EditionFormat, query: AvailabilityQuery) =>
  new Promise<EditionAvailability>((resolve) => {
    queues[format].push({ query, resolve });

    if (!batchTimers[format]) {
      batchTimers[format] = setTimeout(() => flushQueue(format), BATCH_DELAY);
    }
  });

/**
 * Whether the catalog of a format lists an edition of a book: Google Books
 * for ebooks, Audible for audiobooks. Cards pass the title and author so
 * lookups are batched; without them the book is looked up by its id alone.
 * Returns undefined until answered, and null exists when the catalog could
 * not be asked.
 */
const useEditionAvailability = (
  format: EditionFormat,
  query: AvailabilityQuery | undefined,
  enabled = true
): EditionAvailability | undefined => {
  const key = query && enabled ? `/api/v1/book/${query.olId}/${format}` : null;
  const { data } = useSWR<EditionAvailability>(
    key,
    query?.title
      ? () => queueAvailability(format, query)
      : (url: string) =>
          axios.get<EditionAvailability>(url).then((res) => res.data),
    {
      dedupingInterval: DEDUPE_INTERVAL,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );

  return data;
};

export default useEditionAvailability;
