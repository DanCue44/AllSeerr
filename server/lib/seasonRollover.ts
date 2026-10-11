import {
  MediaRequestMonitorMode,
  MediaRequestStatus,
  MediaStatus,
  SeasonRolloverStatus,
} from '@server/constants/media';
import type {
  RollOff,
  RolloverEpisode,
  RolloverMediaSeason,
} from '@server/lib/currentSeasonRollover';

/**
 * A roll off deletes episode files, so it waits for a notice period before it
 * goes ahead. Admins are told which seasons are going and can keep them.
 *
 * Seasons are split in two:
 * - Seasons the current season request brought in are deleted once the notice
 *   period is over, unless an admin keeps them.
 * - Seasons that were already available when the request was made (or kept
 *   by an admin on an earlier roll off) are held for review and only deleted
 *   once an admin approves it.
 */

export interface RolloverRecord {
  status: SeasonRolloverStatus;
  // Deleted once deleteAfter has passed
  seasons: number[];
  // Held until an admin approves deleting them
  preexistingSeasons: number[];
  deletePreexisting: boolean;
  deleteAfter: Date;
}

export interface PreexistingRequest {
  is4k: boolean;
  status: MediaRequestStatus;
  monitorMode?: MediaRequestMonitorMode | null;
  preexistingSeasons?: number[] | null;
}

export type RolloverAction = 'notify' | 'wait' | 'execute' | 'keep';

export interface RolloverDecision {
  action: RolloverAction;
  // Seasons whose episode files are deleted and rows marked deleted
  deleteSeasons: number[];
}

const ACTIVE_STATUSES = [
  MediaRequestStatus.PENDING,
  MediaRequestStatus.APPROVED,
  MediaRequestStatus.COMPLETED,
];

const AVAILABLE_STATUSES = [
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
];

const unique = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((a, b) => a - b);

/**
 * The seasons (specials aside) that are available for a quality, recorded on
 * a current season request when it is made.
 */
export const getAvailableSeasonNumbers = (
  seasons: RolloverMediaSeason[],
  is4k: boolean
): number[] =>
  unique(
    seasons
      .filter(
        (season) =>
          season.seasonNumber > 0 &&
          AVAILABLE_STATUSES.includes(season[is4k ? 'status4k' : 'status'])
      )
      .map((season) => season.seasonNumber)
  );

/**
 * The seasons that were already there for every active current season request
 * of a quality. Null when any of them predates this being recorded, which
 * means every older season is held.
 */
export const getPreexistingSeasons = (
  requests: PreexistingRequest[],
  is4k: boolean
): number[] | null => {
  const currentRequests = requests.filter(
    (request) =>
      request.is4k === is4k &&
      ACTIVE_STATUSES.includes(request.status) &&
      request.monitorMode === MediaRequestMonitorMode.CURRENT
  );

  if (currentRequests.some((request) => !request.preexistingSeasons)) {
    return null;
  }

  return unique(
    currentRequests.flatMap((request) => request.preexistingSeasons ?? [])
  );
};

/**
 * Seasons held for review on a new roll off: the preexisting ones, plus any an
 * admin kept on an earlier roll off. Null holds everything.
 */
export const getHeldSeasons = (
  preexistingSeasons: number[] | null,
  keptRollovers: Pick<RolloverRecord, 'seasons' | 'preexistingSeasons'>[]
): number[] | null =>
  preexistingSeasons === null
    ? null
    : unique([
        ...preexistingSeasons,
        ...keptRollovers.flatMap((rollover) => [
          ...rollover.seasons,
          ...rollover.preexistingSeasons,
        ]),
      ]);

/**
 * The older seasons a roll off would actually delete something from: episode
 * files in Sonarr or season rows that still show as available.
 */
export const getRollOffSeasons = (
  rollOff: RollOff,
  episodes: RolloverEpisode[]
): number[] =>
  unique([
    ...episodes
      .filter(
        (episode) =>
          episode.hasFile &&
          !!episode.episodeFileId &&
          rollOff.episodeFileIds.includes(episode.episodeFileId)
      )
      .map((episode) => episode.seasonNumber),
    ...rollOff.seasonsToMarkDeleted,
  ]);

/**
 * Splits the seasons of a new roll off into the ones deleted after the notice
 * period and the ones held for review. Null held seasons hold everything.
 */
export const splitRolloverSeasons = (
  seasons: number[],
  heldSeasons: number[] | null
): Pick<RolloverRecord, 'seasons' | 'preexistingSeasons'> => ({
  seasons: unique(
    heldSeasons
      ? seasons.filter((seasonNumber) => !heldSeasons.includes(seasonNumber))
      : []
  ),
  preexistingSeasons: unique(
    heldSeasons
      ? seasons.filter((seasonNumber) => heldSeasons.includes(seasonNumber))
      : seasons
  ),
});

/**
 * Decides what a scan does with a roll off, given the record for the season
 * that started it (if there is one) and the older seasons that still have
 * something to delete:
 *
 * - notify: nothing is deleted yet, a record is made and admins are told.
 * - wait: the notice period is not over yet.
 * - keep: an admin kept the seasons, nothing is ever deleted for it.
 * - execute: requests move to the new season, and the approved seasons (if
 *   any) are deleted.
 */
export const decideRolloverAction = ({
  existing,
  now,
  seasons,
}: {
  existing?: RolloverRecord | null;
  now: Date;
  seasons: number[];
}): RolloverDecision => {
  if (existing?.status === SeasonRolloverStatus.KEPT) {
    return { action: 'keep', deleteSeasons: [] };
  }

  if (existing) {
    if (
      existing.status === SeasonRolloverStatus.PENDING &&
      existing.deleteAfter > now
    ) {
      return { action: 'wait', deleteSeasons: [] };
    }

    const approved = [
      ...existing.seasons,
      ...(existing.deletePreexisting ? existing.preexistingSeasons : []),
    ];

    return {
      action: 'execute',
      deleteSeasons: unique(
        seasons.filter((seasonNumber) => approved.includes(seasonNumber))
      ),
    };
  }

  if (seasons.length === 0) {
    return { action: 'execute', deleteSeasons: [] };
  }

  return { action: 'notify', deleteSeasons: [] };
};

/**
 * Where a pending record goes once its roll off has run: seasons still held
 * for review keep it open until an admin decides.
 */
export const getStatusAfterRollOff = (
  record: Pick<RolloverRecord, 'preexistingSeasons' | 'deletePreexisting'>
): SeasonRolloverStatus =>
  record.preexistingSeasons.length > 0 && !record.deletePreexisting
    ? SeasonRolloverStatus.REVIEW
    : SeasonRolloverStatus.COMPLETED;

/**
 * Narrows a roll off down to the seasons that may be deleted. Unmonitoring
 * and moving requests are left as they are.
 */
export const limitRollOff = (
  rollOff: RollOff,
  episodes: RolloverEpisode[],
  deleteSeasons: number[]
): RollOff => {
  const fileIds = new Set(
    episodes
      .filter(
        (episode) =>
          deleteSeasons.includes(episode.seasonNumber) &&
          !!episode.episodeFileId
      )
      .map((episode) => episode.episodeFileId as number)
  );

  return {
    ...rollOff,
    seasons: rollOff.seasons.filter((seasonNumber) =>
      deleteSeasons.includes(seasonNumber)
    ),
    episodeFileIds: rollOff.episodeFileIds.filter((id) => fileIds.has(id)),
    seasonsToMarkDeleted: rollOff.seasonsToMarkDeleted.filter((seasonNumber) =>
      deleteSeasons.includes(seasonNumber)
    ),
  };
};

const formatSeasons = (seasons: number[]): string =>
  `${seasons.length === 1 ? 'Season' : 'Seasons'} ${seasons.join(', ')}`;

export const formatRolloverDate = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/**
 * The notification text for a new roll off, for example: "Season 5 of The
 * Daily Show has started. Seasons 3, 4 will be deleted on Oct 11, 2026 unless
 * you keep them. Seasons 1, 2 were already here and are kept unless you
 * approve deleting them."
 */
export const getRolloverMessage = ({
  title,
  currentSeason,
  seasons,
  preexistingSeasons,
  deleteAfter,
}: {
  title: string;
  currentSeason: number;
  seasons: number[];
  preexistingSeasons: number[];
  deleteAfter: Date;
}): string =>
  [
    `Season ${currentSeason} of ${title} has started.`,
    ...(seasons.length > 0
      ? [
          `${formatSeasons(seasons)} will be deleted on ${formatRolloverDate(deleteAfter)} unless you keep ${seasons.length === 1 ? 'it' : 'them'}.`,
        ]
      : []),
    ...(preexistingSeasons.length > 0
      ? [
          `${formatSeasons(preexistingSeasons)} ${preexistingSeasons.length === 1 ? 'was' : 'were'} already here and ${preexistingSeasons.length === 1 ? 'is' : 'are'} kept unless you approve deleting ${preexistingSeasons.length === 1 ? 'it' : 'them'}.`,
        ]
      : []),
  ].join(' ');
