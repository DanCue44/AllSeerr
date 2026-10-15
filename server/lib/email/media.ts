import { MediaType } from '@server/constants/media';

/** Pill color of a request status in the media emails. */
export type EmailStatusTone = 'blue' | 'green' | 'red' | 'amber';

export interface EmailStatus {
  label: string;
  tone: EmailStatusTone;
}

// The longest overview shown in an email, the providers' own summaries are
// already cut near 500 characters
const OVERVIEW_LIMIT = 700;

/**
 * A larger TMDB poster for the email, which shows it at the full width of
 * the message. Other image hosts are left alone.
 */
export const getEmailPosterUrl = (url?: string): string | undefined => {
  if (!url) {
    return undefined;
  }

  return url.replace(
    /^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//,
    (_match, base: string) => `${base}w780/`
  );
};

/**
 * Splits a book or album subject such as "Dune by Frank Herbert (1965)" into
 * the title with its year and the author or artist, shown on their own line.
 * Movies and series keep their subject as the title.
 */
export const splitEmailMediaTitle = (
  subject: string,
  mediaType?: MediaType
): { title: string; byline?: string } => {
  if (mediaType !== MediaType.BOOK && mediaType !== MediaType.MUSIC) {
    return { title: subject };
  }

  const year = subject.match(/\s\((\d{4})\)$/);
  const rest = year ? subject.slice(0, year.index) : subject;
  const at = rest.lastIndexOf(' by ');

  if (at <= 0) {
    return { title: subject };
  }

  const name = rest.slice(at + 4).trim();

  return {
    title: `${rest.slice(0, at)}${year ? ` (${year[1]})` : ''}`,
    byline: name || undefined,
  };
};

/** Caps a long overview at a word boundary with an ellipsis. */
export const capEmailOverview = (
  text?: string,
  limit = OVERVIEW_LIMIT
): string | undefined => {
  const trimmed = text?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= limit) {
    return trimmed;
  }

  const cut = trimmed.slice(0, limit);
  const space = cut.lastIndexOf(' ');

  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(
    /[\s.,;:]+$/,
    ''
  )}…`;
};
