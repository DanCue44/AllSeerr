import type { AudiobookEdition } from '@server/models/Book';

// The audiobook answer of useEditionAvailability
interface AudiobookAvailability extends Partial<AudiobookEdition> {
  exists: boolean | null;
}

/**
 * The audiobook edition shown on a book page: the one the book came with,
 * or else the answer of the availability lookup the page already makes
 */
export const pickAudiobookEdition = (
  saved?: AudiobookEdition | null,
  availability?: AudiobookAvailability
): AudiobookEdition | undefined => {
  if (saved) {
    return saved;
  }

  if (!availability?.exists) {
    return undefined;
  }

  return {
    asin: availability.asin,
    narrators: availability.narrators ?? [],
    runtimeMinutes: availability.runtimeMinutes,
    coverUrl: availability.coverUrl,
  };
};

/**
 * A length in minutes as hours and minutes, for "25h 18m"
 */
export const splitRuntime = (
  runtimeMinutes: number
): { hours: number; minutes: number } => ({
  hours: Math.floor(runtimeMinutes / 60),
  minutes: runtimeMinutes % 60,
});
