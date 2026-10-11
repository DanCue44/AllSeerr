import Spinner from '@app/assets/spinner.svg';
import UserAvatar from '@app/components/AllSeerr/RequestList/UserAvatar';
import { statusTone } from '@app/components/AllSeerr/Title/styles';
import CachedImage from '@app/components/Common/CachedImage';
import Tooltip from '@app/components/Common/Tooltip';
import DeclineRequestModal from '@app/components/DeclineRequestModal';
import DownloadBlock from '@app/components/DownloadBlock';
import RequestModal from '@app/components/RequestModal';
import RequestSeasonBadges from '@app/components/RequestSeasonBadges';
import useClickOutside from '@app/hooks/useClickOutside';
import useDeepLinks from '@app/hooks/useDeepLinks';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  getRequestDownloadStatus,
  refreshIntervalHelper,
} from '@app/utils/refreshIntervalHelper';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  Cog6ToothIcon,
  PencilIcon,
  PlayIcon,
  ServerStackIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { RequestResultsResponse } from '@server/interfaces/api/requestInterfaces';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import {
  getRequestDownloadKey,
  getRequestStatusKey,
} from '@server/lib/bookRequests';
import type { DownloadingItem } from '@server/lib/downloadtracker';
import type { BookDetails } from '@server/models/Book';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.AllSeerr.RequestList', {
  typeMovie: 'Movie',
  typeMovie4k: '4K Movie',
  typeTv: 'TV',
  typeTv4k: '4K TV',
  typeAlbum: 'Album',
  typeBook: 'Book',
  typeAudiobook: 'Audiobook',
  typeDate: '{type} · {date}',
  waitingApproval: 'Waiting for approval',
  downloadingProgress: 'Downloading {progress}%',
  readyWatch: 'Ready to watch',
  readyListen: 'Ready to listen',
  readyRead: 'Ready to read',
  partlyReady: 'Partly ready',
  declinedReason: 'Declined: {reason}',
  byArtist: 'by {artist}',
  requestedAgo: 'Requested {date}',
  modifiedBy: 'Modified {date} by {user}',
  profile: 'Profile: {name}',
  rootFolder: 'Folder: {path}',
  server: 'Server: {name}',
  approve: 'Approve',
  decline: 'Decline',
  editRequest: 'Edit Request',
  deleteRequest: 'Delete Request',
  cancelRequest: 'Cancel Request',
  retryRequest: 'Retry Request',
  removeFromArr: 'Remove from {arr}',
  playOn: 'Play on {server}',
  manageMedia: 'Manage',
  openInArr: 'Open in {arr}',
  failedRetry: 'Something went wrong while retrying the request.',
  failedModify: 'Something went wrong while modifying the request.',
  removeMediaError: 'Something went wrong while removing the media.',
  mediaNotFound: '{mediaType} Not Found',
  tmdbId: 'TMDB ID {id}',
  tvdbId: 'TheTVDB ID {id}',
  unknownTitle: 'Unknown Title',
});

type RequestTitle = MovieDetails | TvDetails | MusicDetails | BookDetails;
type RequestData = NonFunctionProperties<MediaRequest> & {
  profileName?: string;
  canRemove?: boolean;
};

const isMusic = (title: RequestTitle): title is MusicDetails =>
  (title as MusicDetails).mediaType === 'album';

const isBook = (title: RequestTitle): title is BookDetails =>
  (title as BookDetails).mediaType === 'book';

const isMovie = (title: RequestTitle): title is MovieDetails =>
  !isMusic(title) &&
  !isBook(title) &&
  (title as MovieDetails).title !== undefined;

const getTitleName = (title: RequestTitle): string =>
  isMovie(title) || isMusic(title) || isBook(title) ? title.title : title.name;

const getTitleYear = (title: RequestTitle): string | undefined =>
  isBook(title)
    ? title.firstPublishYear?.toString()
    : (isMovie(title) || isMusic(title)
        ? title.releaseDate
        : title.firstAirDate
      )?.slice(0, 4);

const getMediaPath = (request: NonFunctionProperties<MediaRequest>): string =>
  request.type === 'music'
    ? `/music/${request.media.mbId}`
    : request.type === 'book'
      ? `/book/${request.media.olId}`
      : `/${request.type}/${request.media.tmdbId}`;

const arrName = (type: MediaRequest['type'], bookService?: string) =>
  type === 'movie'
    ? 'Radarr'
    : type === 'music'
      ? 'Lidarr'
      : type === 'book'
        ? bookService === 'chaptarr'
          ? 'Chaptarr'
          : 'LazyLibrarian'
        : 'Sonarr';

const serviceName = (type: MediaRequest['type']) =>
  type === 'movie'
    ? 'radarr'
    : type === 'music'
      ? 'lidarr'
      : type === 'tv'
        ? 'sonarr'
        : null;

const secondsAgo = (date: Date | string) =>
  Math.floor((new Date(date).getTime() - Date.now()) / 1000);

const statusPill =
  'inline-flex w-fit items-center rounded-full px-3 py-1.5 text-[13px] font-semibold';
const iconButton =
  'inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-as-line-strong bg-as-raised text-as-ink transition hover:bg-as-line disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4';
const iconButtonOk = `${iconButton} hover:!bg-[#1d3b33] hover:text-[#a8e6c4]`;
const iconButtonBad = `${iconButton} hover:!bg-[#3b2427] hover:text-[#f2b0aa]`;
const cardShell = 'flex flex-col gap-2 rounded-[20px] bg-as-surface p-[18px]';

/** Round icon action with a tooltip. */
const IconAction = ({
  label,
  onClick,
  disabled,
  className = iconButton,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <Tooltip content={label}>
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  </Tooltip>
);

/** Round icon link with a tooltip. */
const IconLink = ({
  label,
  href,
  external,
  children,
}: {
  label: string;
  href: string;
  external?: boolean;
  children: ReactNode;
}) => (
  <Tooltip content={label}>
    {external ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={iconButton}
        aria-label={label}
      >
        {children}
      </a>
    ) : (
      <Link href={href} className={iconButton} aria-label={label}>
        {children}
      </Link>
    )}
  </Tooltip>
);

/**
 * Round icon action that asks "Are you sure?" on the first click and runs
 * on the second.
 */
const ConfirmIconAction = ({
  label,
  onConfirm,
  children,
}: {
  label: string;
  onConfirm: () => void;
  children: ReactNode;
}) => {
  const intl = useIntl();
  const ref = useRef<HTMLButtonElement>(null);
  const [armed, setArmed] = useState(false);
  useClickOutside(ref, () => setArmed(false));

  return (
    <Tooltip content={armed ? undefined : label}>
      <span className="inline-flex">
        <button
          ref={ref}
          type="button"
          aria-label={
            armed ? intl.formatMessage(globalMessages.areyousure) : label
          }
          className={
            armed
              ? 'inline-flex h-9 items-center rounded-full bg-[#3b2427] px-3 text-[13px] font-semibold text-[#f2b0aa] transition hover:brightness-110'
              : iconButtonBad
          }
          onClick={() => {
            if (armed) {
              setArmed(false);
              onConfirm();
            } else {
              setArmed(true);
            }
          }}
        >
          {armed ? intl.formatMessage(globalMessages.areyousure) : children}
        </button>
      </span>
    </Tooltip>
  );
};

/** Who requested it and when, plus who last changed it. */
const RequestMeta = ({
  requestData,
  showRequester,
}: {
  requestData: NonFunctionProperties<MediaRequest>;
  showRequester: boolean;
}) => {
  const intl = useIntl();

  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs text-as-ink-muted">
      {showRequester ? (
        <Link
          href={`/users/${requestData.requestedBy.id}`}
          className="group flex min-w-0 items-center gap-2"
        >
          <UserAvatar
            id={requestData.requestedBy.id}
            name={requestData.requestedBy.displayName}
            avatar={requestData.requestedBy.avatar}
            size={24}
          />
          <span className="min-w-0 truncate">
            <span className="font-semibold text-as-ink-soft group-hover:text-as-ink group-hover:underline">
              {requestData.requestedBy.displayName}
            </span>{' '}
            <FormattedRelativeTime
              value={secondsAgo(requestData.createdAt)}
              updateIntervalInSeconds={1}
              numeric="auto"
            />
          </span>
        </Link>
      ) : (
        <span className="truncate">
          {intl.formatMessage(messages.requestedAgo, {
            date: (
              <FormattedRelativeTime
                value={secondsAgo(requestData.createdAt)}
                updateIntervalInSeconds={1}
                numeric="auto"
              />
            ),
          })}
        </span>
      )}
      {requestData.modifiedBy && (
        <span className="truncate">
          {intl.formatMessage(messages.modifiedBy, {
            date: (
              <FormattedRelativeTime
                value={secondsAgo(requestData.updatedAt)}
                updateIntervalInSeconds={1}
                numeric="auto"
              />
            ),
            user: (
              <Link
                href={`/users/${requestData.modifiedBy.id}`}
                className="font-semibold text-as-ink-soft hover:text-as-ink hover:underline"
              >
                {requestData.modifiedBy.displayName}
              </Link>
            ),
          })}
        </span>
      )}
    </div>
  );
};

const progressOf = (downloads: DownloadingItem[]) => {
  const size = downloads.reduce((total, item) => total + item.size, 0);
  const left = downloads.reduce((total, item) => total + item.sizeLeft, 0);

  return size ? Math.round(((size - left) / size) * 100) : 0;
};

/** Status pill, or a progress bar while downloading. */
const RequestStatus = ({
  requestData,
  downloads,
  titleName,
}: {
  requestData: NonFunctionProperties<MediaRequest>;
  downloads: DownloadingItem[];
  titleName: string;
}) => {
  const intl = useIntl();
  const mediaStatus = requestData.media[getRequestStatusKey(requestData)];
  const managePath = `${getMediaPath(requestData)}?manage=1`;

  if (requestData.status === MediaRequestStatus.DECLINED) {
    return (
      <span className={`${statusPill} ${statusTone.bad}`}>
        {intl.formatMessage(globalMessages.declined)}
      </span>
    );
  }

  if (requestData.status === MediaRequestStatus.FAILED) {
    return (
      <Link
        href={managePath}
        className={`${statusPill} ${statusTone.bad} hover:brightness-110`}
      >
        {intl.formatMessage(globalMessages.failed)}
      </Link>
    );
  }

  if (requestData.status === MediaRequestStatus.PENDING) {
    const pill = (
      <span className={`${statusPill} bg-[#3b2a25] text-[#ffd2c0]`}>
        {intl.formatMessage(messages.waitingApproval)}
      </span>
    );

    return mediaStatus === MediaStatus.DELETED ? (
      <Link href={managePath} className="w-fit hover:brightness-110">
        {pill}
      </Link>
    ) : (
      pill
    );
  }

  if (downloads.length > 0) {
    const progress = progressOf(downloads);

    return (
      <Tooltip
        content={
          <div className="max-h-96 overflow-y-auto">
            {downloads.map((item) => (
              <DownloadBlock
                key={`download-${item.downloadId}-${item.episode?.seasonNumber}-${item.episode?.episodeNumber}`}
                downloadItem={item}
                is4k={requestData.is4k}
                title={titleName}
              />
            ))}
          </div>
        }
        className="!p-0"
      >
        <div className="flex flex-col gap-1.5 py-1">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[#1e3247]"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[#aac8f0] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[13px] font-semibold text-[#aac8f0]">
            {intl.formatMessage(messages.downloadingProgress, { progress })}
          </span>
        </div>
      </Tooltip>
    );
  }

  switch (mediaStatus) {
    case MediaStatus.AVAILABLE:
      return (
        <span className={`${statusPill} ${statusTone.ok}`}>
          {intl.formatMessage(
            requestData.type === 'music'
              ? messages.readyListen
              : requestData.type === 'book'
                ? requestData.isAudiobook
                  ? messages.readyListen
                  : messages.readyRead
                : messages.readyWatch
          )}
        </span>
      );
    case MediaStatus.PARTIALLY_AVAILABLE:
      return (
        <span className={`${statusPill} ${statusTone.ok}`}>
          {intl.formatMessage(messages.partlyReady)}
        </span>
      );
    case MediaStatus.PROCESSING:
      return (
        <span className={`${statusPill} ${statusTone.info}`}>
          {intl.formatMessage(globalMessages.processing)}
        </span>
      );
    case MediaStatus.DELETED:
      return (
        <span className={`${statusPill} ${statusTone.bad}`}>
          {intl.formatMessage(globalMessages.deleted)}
        </span>
      );
    case MediaStatus.BLOCKLISTED:
      return (
        <span className={`${statusPill} ${statusTone.bad}`}>
          {intl.formatMessage(globalMessages.blocklisted)}
        </span>
      );
    case MediaStatus.PENDING:
      return (
        <span className={`${statusPill} ${statusTone.info}`}>
          {intl.formatMessage(globalMessages.requested)}
        </span>
      );
    default:
      return requestData.status === MediaRequestStatus.APPROVED ? (
        <span className={`${statusPill} ${statusTone.info}`}>
          {intl.formatMessage(globalMessages.requested)}
        </span>
      ) : (
        <span className={`${statusPill} ${statusTone.neutral}`}>
          {intl.formatMessage(globalMessages.unavailable)}
        </span>
      );
  }
};

const typeMessage = (request: NonFunctionProperties<MediaRequest>) =>
  request.type === 'movie'
    ? request.is4k
      ? messages.typeMovie4k
      : messages.typeMovie
    : request.type === 'tv'
      ? request.is4k
        ? messages.typeTv4k
        : messages.typeTv
      : request.type === 'music'
        ? messages.typeAlbum
        : request.isAudiobook
          ? messages.typeAudiobook
          : messages.typeBook;

/** First line of the card: "{Type} · {short date}". */
const TypeLine = ({
  request,
}: {
  request: NonFunctionProperties<MediaRequest>;
}) => {
  const intl = useIntl();
  const created = new Date(request.createdAt);

  return (
    <div className="text-xs text-as-ink-muted">
      {intl.formatMessage(messages.typeDate, {
        type: intl.formatMessage(typeMessage(request)),
        date: intl.formatDate(created, {
          month: 'short',
          day: 'numeric',
          year:
            created.getFullYear() === new Date().getFullYear()
              ? undefined
              : 'numeric',
        }),
      })}
    </div>
  );
};

interface RequestCardErrorProps {
  requestData?: RequestData;
  revalidateList: () => void;
  showRequester: boolean;
}

/** Card for a request whose title could not be loaded. */
const RequestCardError = ({
  requestData,
  revalidateList,
  showRequester,
}: RequestCardErrorProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  const deleteMedia = async () => {
    await axios.delete(`/api/v1/media/${requestData?.media.id}`);
    revalidateList();
    mutate('/api/v1/request/count');
  };

  const downloads = getRequestDownloadStatus(
    requestData
      ? requestData.media?.[getRequestDownloadKey(requestData)]
      : undefined,
    requestData?.type === 'tv'
      ? (requestData?.seasons ?? []).map((season) => season.seasonNumber)
      : []
  );

  return (
    <div className={`${cardShell} ring-1 ring-[#f2b0aa]/40`}>
      {requestData && <TypeLine request={requestData} />}
      <div className="text-[17px] font-bold text-as-ink">
        {intl.formatMessage(messages.mediaNotFound, {
          mediaType: intl.formatMessage(
            requestData
              ? requestData.type === 'movie'
                ? globalMessages.movie
                : requestData.type === 'music'
                  ? globalMessages.album
                  : requestData.type === 'book'
                    ? globalMessages.book
                    : globalMessages.tvshow
              : globalMessages.request
          ),
        })}
      </div>
      {requestData && hasPermission(Permission.MANAGE_REQUESTS) && (
        <div className="flex flex-col text-sm text-as-ink-soft">
          {requestData.media.tmdbId && (
            <span>
              {intl.formatMessage(messages.tmdbId, {
                id: requestData.media.tmdbId,
              })}
            </span>
          )}
          {requestData.media.tvdbId && (
            <span>
              {intl.formatMessage(messages.tvdbId, {
                id: requestData.media.tvdbId,
              })}
            </span>
          )}
        </div>
      )}
      {requestData && (
        <>
          <RequestStatus
            requestData={requestData}
            downloads={downloads}
            titleName={intl.formatMessage(messages.unknownTitle)}
          />
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <RequestMeta
              requestData={requestData}
              showRequester={showRequester}
            />
            {hasPermission(Permission.MANAGE_REQUESTS) &&
              requestData.media.id && (
                <ConfirmIconAction
                  label={intl.formatMessage(messages.deleteRequest)}
                  onConfirm={() => deleteMedia()}
                >
                  <TrashIcon />
                </ConfirmIconAction>
              )}
          </div>
        </>
      )}
    </div>
  );
};

interface RequestCardProps {
  request: RequestResultsResponse['results'][number];
  revalidateList: () => void;
  // Show the requester's avatar and name in the footer
  showRequester: boolean;
}

/**
 * One request in the Ambient request grid. Same data and actions as the
 * classic RequestItem.
 */
const RequestCard = ({
  request,
  revalidateList,
  showRequester,
}: RequestCardProps) => {
  const { ref, inView } = useInView({ triggerOnce: true });
  const { addToast } = useToasts();
  const intl = useIntl();
  const settings = useSettings();
  const { user, hasPermission } = useUser();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [isRetrying, setRetrying] = useState(false);
  const [updatingType, setUpdatingType] = useState<
    'approve' | 'decline' | null
  >(null);

  const isManager = hasPermission(Permission.MANAGE_REQUESTS);
  const url =
    request.type === 'movie'
      ? `/api/v1/movie/${request.media.tmdbId}`
      : request.type === 'music'
        ? `/api/v1/music/${request.media.mbId}`
        : request.type === 'book'
          ? `/api/v1/book/${request.media.olId}`
          : `/api/v1/tv/${request.media.tmdbId}`;
  const { data: title, error } = useSWR<RequestTitle>(inView ? url : null);
  const { data: requestData, mutate: revalidate } = useSWR<RequestData>(
    `/api/v1/request/${request.id}`,
    {
      fallbackData: request,
      refreshInterval: refreshIntervalHelper(
        {
          downloadStatus: request.media.downloadStatus,
          downloadStatus4k: request.media.downloadStatus4k,
          downloadStatusAudio: request.media.downloadStatusAudio,
        },
        15000
      ),
    }
  );

  // Server names for the override line, managers only
  const service = serviceName(request.type);
  const { data: servers } = useSWR<ServiceCommonServer[]>(
    isManager && service && request.serverId !== null && inView
      ? `/api/v1/service/${service}`
      : null
  );

  const { mediaUrl: plexUrl, mediaUrl4k: plexUrl4k } = useDeepLinks({
    mediaUrl: requestData?.media?.mediaUrl,
    mediaUrl4k: requestData?.media?.mediaUrl4k,
    iOSPlexUrl: requestData?.media?.iOSPlexUrl,
    iOSPlexUrl4k: requestData?.media?.iOSPlexUrl4k,
  });

  const modifyRequest = async (
    type: 'approve' | 'decline',
    reason?: string
  ) => {
    setUpdatingType(type);
    try {
      await axios.post(
        `/api/v1/request/${request.id}/${type}`,
        reason ? { reason } : undefined
      );
      setShowDeclineModal(false);
      revalidate();
      revalidateList();
      mutate('/api/v1/request/count');
    } catch {
      addToast(intl.formatMessage(messages.failedModify), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setUpdatingType(null);
    }
  };

  const deleteRequest = async () => {
    await axios.delete(`/api/v1/request/${request.id}`);
    revalidateList();
    mutate('/api/v1/request/count');
  };

  const deleteMediaFile = async () => {
    if (request.media) {
      try {
        await axios.delete(
          `/api/v1/media/${request.media.id}/file?is4k=${request.is4k}`
        );
      } catch (e) {
        if (!axios.isAxiosError(e) || e.response?.status !== 404) {
          addToast(intl.formatMessage(messages.removeMediaError), {
            autoDismiss: true,
            appearance: 'error',
          });
          revalidateList();
          return;
        }
      }
      revalidateList();
    }
  };

  const retryRequest = async () => {
    setRetrying(true);
    try {
      const result = await axios.post(`/api/v1/request/${request.id}/retry`);
      revalidate(result.data);
    } catch {
      addToast(intl.formatMessage(messages.failedRetry), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setRetrying(false);
    }
  };

  if (!title && !error) {
    return (
      <div
        ref={ref}
        className="h-[220px] animate-pulse rounded-[20px] bg-as-surface"
      />
    );
  }

  if (!title || !requestData) {
    return (
      <RequestCardError
        requestData={requestData}
        revalidateList={revalidateList}
        showRequester={showRequester}
      />
    );
  }

  const titleName = getTitleName(title);
  const mediaPath = getMediaPath(requestData);
  const downloads = getRequestDownloadStatus(
    requestData.media[getRequestDownloadKey(requestData)],
    requestData.type === 'tv'
      ? requestData.seasons.map((season) => season.seasonNumber)
      : []
  );
  const mediaStatus = requestData.media[getRequestStatusKey(requestData)];
  const isPending = requestData.status === MediaRequestStatus.PENDING;
  const isOwn = requestData.requestedBy.id === user?.id;

  // Same rule as the classic status badge for the "Play on" link
  const playUrl = requestData.is4k ? plexUrl4k : plexUrl;
  const canPlay =
    !!playUrl &&
    (mediaStatus === MediaStatus.AVAILABLE ||
      mediaStatus === MediaStatus.PARTIALLY_AVAILABLE) &&
    hasPermission(
      requestData.is4k
        ? [
            Permission.REQUEST_4K,
            requestData.type === 'movie'
              ? Permission.REQUEST_4K_MOVIE
              : Permission.REQUEST_4K_TV,
          ]
        : [
            Permission.REQUEST,
            requestData.type === 'movie'
              ? Permission.REQUEST_MOVIE
              : requestData.type === 'music'
                ? Permission.REQUEST_MUSIC
                : requestData.type === 'book'
                  ? Permission.REQUEST_BOOK
                  : Permission.REQUEST_TV,
          ],
      { type: 'or' }
    ) &&
    (!requestData.is4k ||
      (requestData.type === 'movie'
        ? settings.currentSettings.movie4kEnabled
        : settings.currentSettings.series4kEnabled));
  const mediaServerName =
    settings.currentSettings.mediaServerType === MediaServerType.EMBY
      ? 'Emby'
      : settings.currentSettings.mediaServerType === MediaServerType.PLEX
        ? 'Plex'
        : 'Jellyfin';
  const serviceUrl = requestData.is4k
    ? requestData.media.serviceUrl4k
    : requestData.media.serviceUrl;

  const serverName =
    requestData.serverId !== null && requestData.serverId !== undefined
      ? servers?.find((server) => server.id === requestData.serverId)?.name
      : undefined;
  const overrides = isManager
    ? [
        request.profileName &&
          intl.formatMessage(messages.profile, { name: request.profileName }),
        requestData.rootFolder &&
          intl.formatMessage(messages.rootFolder, {
            path: requestData.rootFolder,
          }),
        serverName && intl.formatMessage(messages.server, { name: serverName }),
      ].filter((line): line is string => !!line)
    : request.profileName
      ? [intl.formatMessage(messages.profile, { name: request.profileName })]
      : [];

  const posterSquare = isMusic(title);
  const poster = isMusic(title) ? (
    title.posterPath ? (
      <CachedImage
        type="music"
        src={title.posterPath}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        fill
      />
    ) : null
  ) : isBook(title) ? (
    <CachedImage
      type="book"
      src={title.posterPath ?? '/images/seerr_poster_not_found.png'}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      fill
    />
  ) : (
    <CachedImage
      type="tmdb"
      src={
        title.posterPath
          ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${title.posterPath}`
          : '/images/seerr_poster_not_found.png'
      }
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      fill
    />
  );

  const year = getTitleYear(title);
  const detail = isMusic(title)
    ? title.artistCredit
      ? intl.formatMessage(messages.byArtist, { artist: title.artistCredit })
      : undefined
    : isBook(title)
      ? [
          intl.formatMessage(
            requestData.isAudiobook
              ? globalMessages.audiobook
              : globalMessages.ebook
          ),
          title.authors.map((author) => author.name).join(', '),
        ]
          .filter(Boolean)
          .join(' · ')
      : isMovie(title)
        ? year
        : undefined;

  const canEdit =
    isPending &&
    (isManager ||
      (isOwn &&
        (requestData.type === 'tv' ||
          hasPermission(Permission.REQUEST_ADVANCED))));

  return (
    <>
      <DeclineRequestModal
        show={showDeclineModal}
        title={titleName}
        isUpdating={updatingType === 'decline'}
        onDecline={(reason) => modifyRequest('decline', reason)}
        onCancel={() => setShowDeclineModal(false)}
      />
      <RequestModal
        show={showEditModal}
        tmdbId={request.media.tmdbId}
        mbId={request.media.mbId}
        olId={request.media.olId}
        type={request.type}
        is4k={request.is4k}
        editRequest={request}
        onCancel={() => setShowEditModal(false)}
        onComplete={() => {
          revalidateList();
          setShowEditModal(false);
        }}
      />
      <article className={cardShell}>
        <div className="flex gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <TypeLine request={requestData} />
            <Link
              href={mediaPath}
              className="line-clamp-2 text-[17px] font-bold leading-snug text-as-ink hover:underline"
            >
              {titleName}
            </Link>
            {detail && (
              <div className="truncate text-sm text-as-ink-soft">{detail}</div>
            )}
          </div>
          <Link
            href={mediaPath}
            className={`relative flex-none overflow-hidden rounded-[10px] bg-as-tile transition hover:opacity-90 ${
              posterSquare ? 'h-14 w-14' : 'h-[72px] w-12'
            }`}
            aria-label={titleName}
          >
            {poster}
          </Link>
        </div>

        {requestData.type === 'tv' && requestData.seasons.length > 0 && (
          <div className="text-sm text-as-ink-soft">
            <RequestSeasonBadges
              request={requestData}
              variant="text"
              className=""
            />
          </div>
        )}

        {requestData.status === MediaRequestStatus.DECLINED &&
          requestData.declineReason && (
            <div className="text-sm text-as-ink-soft">
              {intl.formatMessage(messages.declinedReason, {
                reason: requestData.declineReason,
              })}
            </div>
          )}

        <RequestStatus
          requestData={requestData}
          downloads={downloads}
          titleName={titleName}
        />

        {overrides.length > 0 && (
          <div className="flex flex-col text-xs text-as-ink-faint">
            {overrides.map((line) => (
              <span key={line} className="truncate">
                {line}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3 border-t border-as-line pt-3">
          <RequestMeta
            requestData={requestData}
            showRequester={showRequester}
          />
          <div className="flex flex-wrap items-center gap-2 empty:hidden">
            {isPending && isManager && (
              <>
                <IconAction
                  label={intl.formatMessage(messages.approve)}
                  onClick={() => modifyRequest('approve')}
                  disabled={updatingType !== null}
                  className={iconButtonOk}
                >
                  {updatingType === 'approve' ? <Spinner /> : <CheckIcon />}
                </IconAction>
                <IconAction
                  label={intl.formatMessage(messages.decline)}
                  onClick={() => setShowDeclineModal(true)}
                  disabled={updatingType !== null}
                  className={iconButtonBad}
                >
                  {updatingType === 'decline' ? <Spinner /> : <XMarkIcon />}
                </IconAction>
              </>
            )}
            {canEdit && (
              <IconAction
                label={intl.formatMessage(messages.editRequest)}
                onClick={() => setShowEditModal(true)}
                disabled={updatingType !== null}
              >
                <PencilIcon />
              </IconAction>
            )}
            {requestData.status === MediaRequestStatus.FAILED && isManager && (
              <IconAction
                label={intl.formatMessage(
                  isRetrying ? globalMessages.retrying : messages.retryRequest
                )}
                onClick={() => retryRequest()}
                disabled={isRetrying}
              >
                <ArrowPathIcon
                  className={isRetrying ? 'animate-spin' : ''}
                  style={{ animationDirection: 'reverse' }}
                />
              </IconAction>
            )}
            {canPlay && playUrl && (
              <IconLink
                label={intl.formatMessage(messages.playOn, {
                  server: mediaServerName,
                })}
                href={playUrl}
                external
              >
                <PlayIcon />
              </IconLink>
            )}
            {isManager && (
              <IconLink
                label={intl.formatMessage(messages.manageMedia)}
                href={`${mediaPath}?manage=1`}
              >
                <Cog6ToothIcon />
              </IconLink>
            )}
            {hasPermission(Permission.ADMIN) && serviceUrl && (
              <IconLink
                label={intl.formatMessage(messages.openInArr, {
                  arr: arrName(
                    requestData.type,
                    settings.currentSettings.bookService
                  ),
                })}
                href={serviceUrl}
                external
              >
                <ArrowTopRightOnSquareIcon />
              </IconLink>
            )}
            {!isPending && isManager && (
              <>
                <ConfirmIconAction
                  label={intl.formatMessage(messages.deleteRequest)}
                  onConfirm={() => deleteRequest()}
                >
                  <TrashIcon />
                </ConfirmIconAction>
                {request.canRemove && (
                  <ConfirmIconAction
                    label={intl.formatMessage(messages.removeFromArr, {
                      arr: arrName(
                        request.type,
                        settings.currentSettings.bookService
                      ),
                    })}
                    onConfirm={() => deleteMediaFile()}
                  >
                    <ServerStackIcon />
                  </ConfirmIconAction>
                )}
              </>
            )}
            {isPending && !isManager && isOwn && (
              <ConfirmIconAction
                label={intl.formatMessage(messages.cancelRequest)}
                onConfirm={() => deleteRequest()}
              >
                <XMarkIcon />
              </ConfirmIconAction>
            )}
          </div>
        </div>
      </article>
    </>
  );
};

export default RequestCard;
