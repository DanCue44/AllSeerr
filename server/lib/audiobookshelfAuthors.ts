import type { AudiobookshelfAuthor } from '@server/api/audiobookshelf';
import AudiobookshelfAPI from '@server/api/audiobookshelf';
import {
  DEFAULT_AUDIOBOOKSHELF_MATCH_REGION,
  isAudiobookshelfMatchRegion,
} from '@server/constants/audiobookshelf';
import type { AudiobookshelfAuthorMatchResponse } from '@server/interfaces/api/settingsInterfaces';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { runInBackground } from '@server/utils/backgroundTasks';

// Audiobookshelf only fetches an author's photo and bio when the author is
// matched, which an admin does by hand. AllSeerr matches the authors of the
// books it finds in the library, one at a time with a pause in between, so
// Audnexus and Audiobookshelf are not flooded.

// An author checked recently is left alone for this long: one that got no
// photo is asked about again at most weekly, one that failed sooner
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT = 10000;
// Matching downloads the photo, which may take longer than a plain read
const MATCH_TIMEOUT = 20000;
// Pause after each match
const DEFAULT_MATCH_DELAY_MS = 1500;
// How long "Match authors now" waits before answering with what it has
// matched so far, under the time a reverse proxy gives a request
const DEFAULT_MATCH_ALL_WAIT_MS = 45000;

let matchDelayMs = DEFAULT_MATCH_DELAY_MS;
let matchAllWaitMs = DEFAULT_MATCH_ALL_WAIT_MS;

// When each author, and each item whose authors were looked at, was last
// checked, and whether that check failed
const authorChecks = new Map<string, { at: number; failed: boolean }>();
const itemChecks = new Map<string, number>();
// Everything that talks to Audiobookshelf here runs one after the other
let chain: Promise<unknown> = Promise.resolve();
let matchAllJob:
  | { result: AudiobookshelfAuthorMatchResponse; promise: Promise<void> }
  | undefined;

export interface AudiobookshelfAuthorMatchTarget {
  url: string;
  apiKey: string;
  region: string;
}

/**
 * Where and how authors are matched, or undefined when Audiobookshelf has
 * no address or no admin API key, which matching needs
 */
export const getAuthorMatchTarget = ():
  | AudiobookshelfAuthorMatchTarget
  | undefined => {
  const settings = getSettings().audiobookshelf;
  const url = settings.url?.trim().replace(/\/+$/, '');
  const apiKey = settings.adminApiKey?.trim();

  if (!url || !apiKey) {
    return undefined;
  }

  return {
    url,
    apiKey,
    region: isAudiobookshelfMatchRegion(settings.authorMatchRegion)
      ? settings.authorMatchRegion
      : DEFAULT_AUDIOBOOKSHELF_MATCH_REGION,
  };
};

const sleep = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : undefined;

const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
  const run = chain.then(task);
  chain = run.catch(() => undefined);
  return run;
};

const createClient = (
  target: AudiobookshelfAuthorMatchTarget,
  timeout = REQUEST_TIMEOUT
) => new AudiobookshelfAPI({ url: target.url, apiKey: target.apiKey, timeout });

const authorKey = (target: AudiobookshelfAuthorMatchTarget, id: string) =>
  `${target.url}:${id}`;

const isDue = (key: string, now = Date.now()): boolean => {
  const check = authorChecks.get(key);

  return (
    !check || now - check.at > (check.failed ? FAILURE_RETRY_MS : RECHECK_MS)
  );
};

type MatchOutcome = 'matched' | 'noPhoto' | 'failed';

/**
 * Matches an author without a photo, by ASIN when Audiobookshelf has one
 * and by name otherwise, then pauses before the next match
 */
const matchAuthor = async (
  target: AudiobookshelfAuthorMatchTarget,
  author: AudiobookshelfAuthor
): Promise<MatchOutcome> => {
  const key = authorKey(target, author.id);
  let outcome: MatchOutcome;

  try {
    const matched = await createClient(target, MATCH_TIMEOUT).matchAuthor(
      author.id,
      author.asin
        ? { asin: author.asin, region: target.region }
        : { q: author.name, region: target.region }
    );

    outcome = matched?.imagePath ? 'matched' : 'noPhoto';

    if (outcome === 'matched') {
      logger.info('Matched an author in Audiobookshelf, who now has a photo', {
        label: 'Audiobookshelf',
        authorId: author.id,
        author: author.name,
      });
    } else {
      logger.debug('Audnexus has no photo for an author', {
        label: 'Audiobookshelf',
        authorId: author.id,
        author: author.name,
      });
    }
  } catch (e) {
    outcome = 'failed';
    logger.debug('Failed to match an author in Audiobookshelf', {
      label: 'Audiobookshelf',
      authorId: author.id,
      author: author.name,
      errorMessage: e.message,
    });
  }

  authorChecks.set(key, { at: Date.now(), failed: outcome === 'failed' });
  await sleep(matchDelayMs);

  return outcome;
};

const matchItemAuthors = async (
  target: AudiobookshelfAuthorMatchTarget,
  itemId: string
): Promise<void> => {
  const client = createClient(target);
  let authors: { id: string; name: string }[];

  try {
    authors = await client.getItemAuthors(itemId);
  } catch (e) {
    logger.debug('Failed to read the authors of an Audiobookshelf item', {
      label: 'Audiobookshelf',
      itemId,
      errorMessage: e.message,
    });
    itemChecks.delete(`${target.url}:${itemId}`);
    return;
  }

  for (const { id } of authors) {
    const key = authorKey(target, id);

    if (!isDue(key)) {
      continue;
    }

    let author: AudiobookshelfAuthor;

    try {
      author = await client.getAuthor(id);
    } catch (e) {
      logger.debug('Failed to read an Audiobookshelf author', {
        label: 'Audiobookshelf',
        authorId: id,
        errorMessage: e.message,
      });
      authorChecks.set(key, { at: Date.now(), failed: true });
      continue;
    }

    if (author.imagePath) {
      authorChecks.set(key, { at: Date.now(), failed: false });
      continue;
    }

    await matchAuthor(target, author);
  }
};

/**
 * Matches the authors of library items AllSeerr just learned about, in the
 * background, when an admin API key is set. Authors with a photo are left
 * alone, and an author or item checked recently is not checked again.
 */
export const queueAuthorMatchForItems = (
  itemIds: (string | null | undefined)[]
): void => {
  const target = getAuthorMatchTarget();

  if (!target) {
    return;
  }

  const now = Date.now();

  for (const itemId of new Set(itemIds)) {
    if (!itemId) {
      continue;
    }

    const key = `${target.url}:${itemId}`;
    const checkedAt = itemChecks.get(key);

    if (checkedAt !== undefined && now - checkedAt <= RECHECK_MS) {
      continue;
    }

    itemChecks.set(key, now);
    logger.debug('Checking the authors of an Audiobookshelf item', {
      label: 'Audiobookshelf',
      itemId,
    });
    runInBackground(exclusive(() => matchItemAuthors(target, itemId)));
  }
};

/**
 * The libraries authors are matched in: the audiobook and ebook libraries
 */
const getMatchLibraries = (): string[] => {
  const settings = getSettings().audiobookshelf;

  return [
    ...new Set(
      [settings.libraryId, settings.ebookLibraryId]
        .map((id) => id?.trim())
        .filter((id): id is string => !!id)
    ),
  ];
};

export class AuthorMatchUnavailableError extends Error {}

const runMatchAll = async (
  target: AudiobookshelfAuthorMatchTarget,
  libraryIds: string[],
  result: AudiobookshelfAuthorMatchResponse
): Promise<void> => {
  const client = createClient(target);
  const authors = new Map<string, AudiobookshelfAuthor>();

  for (const libraryId of libraryIds) {
    for (const author of await client.getLibraryAuthors(libraryId)) {
      authors.set(author.id, author);
    }
  }

  result.total = authors.size;

  for (const author of authors.values()) {
    if (author.imagePath) {
      authorChecks.set(authorKey(target, author.id), {
        at: Date.now(),
        failed: false,
      });
      continue;
    }

    result[await matchAuthor(target, author)]++;
  }
};

/**
 * Matches every author without a photo in the configured libraries, also
 * those checked recently. Answers once done, or after a while with the
 * counts so far while the rest is matched in the background. Asking again
 * while it runs answers with the progress of the run under way.
 */
export const matchAllAudiobookshelfAuthors =
  async (): Promise<AudiobookshelfAuthorMatchResponse> => {
    const target = getAuthorMatchTarget();

    if (!target) {
      throw new AuthorMatchUnavailableError(
        'Audiobookshelf has no address or no admin API key.'
      );
    }

    const libraryIds = getMatchLibraries();

    if (!libraryIds.length) {
      throw new AuthorMatchUnavailableError(
        'No Audiobookshelf library is set.'
      );
    }

    if (!matchAllJob) {
      const result: AudiobookshelfAuthorMatchResponse = {
        total: 0,
        matched: 0,
        noPhoto: 0,
        failed: 0,
        done: false,
      };
      const promise = exclusive(() =>
        runMatchAll(target, libraryIds, result)
      ).finally(() => {
        result.done = true;
        matchAllJob = undefined;
        logger.info('Finished matching Audiobookshelf authors', {
          label: 'Audiobookshelf',
          total: result.total,
          matched: result.matched,
          noPhoto: result.noPhoto,
          failed: result.failed,
        });
      });

      matchAllJob = { result, promise };
      runInBackground(promise);
    }

    const job = matchAllJob;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        job.promise,
        new Promise((resolve) => {
          timer = setTimeout(resolve, matchAllWaitMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }

    return { ...job.result };
  };

/**
 * For tests: forgets what was checked and sets the pauses
 */
export const resetAuthorMatchState = ({
  delayMs = DEFAULT_MATCH_DELAY_MS,
  waitMs = DEFAULT_MATCH_ALL_WAIT_MS,
}: { delayMs?: number; waitMs?: number } = {}): void => {
  authorChecks.clear();
  itemChecks.clear();
  matchAllJob = undefined;
  chain = Promise.resolve();
  matchDelayMs = delayMs;
  matchAllWaitMs = waitMs;
};
