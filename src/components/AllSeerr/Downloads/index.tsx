import DownloadCard from '@app/components/AllSeerr/Downloads/DownloadCard';
import RemoveDownloadModal from '@app/components/AllSeerr/Downloads/RemoveDownloadModal';
import type {
  DownloadStatusFilter,
  DownloadTab,
} from '@app/components/AllSeerr/Downloads/downloadFilters';
import {
  DOWNLOAD_TABS,
  STATUS_FILTERS,
  filterDownloads,
  matchesStatus,
  matchesTab,
} from '@app/components/AllSeerr/Downloads/downloadFilters';
import ReleasePicker from '@app/components/ArrActions/ReleasePicker';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { isTalearrService } from '@server/constants/bookService';
import type {
  DownloadItem,
  DownloadRemoveBody,
  DownloadRemoveResponse,
  DownloadsResponse,
} from '@server/interfaces/api/downloadInterfaces';
import axios from 'axios';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AllSeerr.Downloads', {
  downloads: 'Downloads',
  subtitle: 'Every download from Radarr, Sonarr, Lidarr and {bookService}',
  downloading: 'Downloading',
  queued: 'Queued',
  attention: 'Need attention',
  statusFilter: 'Status',
  filterAll: 'All statuses',
  filterDownloading: 'Downloading',
  filterQueued: 'Queued or paused',
  filterImporting: 'Importing',
  filterAttention: 'Needs attention',
  emptyTitle: 'Nothing is downloading',
  emptyText:
    'Downloads from Radarr, Sonarr, Lidarr and {bookService} show up here while they are on their way.',
  noMatches: 'No downloads match these filters',
  showAll: 'Show all downloads',
  unableToConnect: 'Unable to reach {servers}. Their downloads are not shown.',
  loadError: 'Unable to load the downloads.',
  searchStarted: '{server} is searching for {title}.',
  searchError: 'Could not start the search: {message}',
  removed: 'Removed {title} from the queue.',
  removedSearched: 'Removed {title} from the queue and started a new search.',
  removedSearchFailed:
    'Removed {title} from the queue, but could not search again: {message}',
  removeError: 'Could not remove the download: {message}',
});

const TAB_MESSAGES: Record<DownloadTab, keyof typeof globalMessages> = {
  all: 'all',
  movie: 'movies',
  tv: 'tvshows',
  music: 'music',
  book: 'books',
};

const STATUS_MESSAGES: Record<DownloadStatusFilter, keyof typeof messages> = {
  all: 'filterAll',
  downloading: 'filterDownloading',
  queued: 'filterQueued',
  importing: 'filterImporting',
  attention: 'filterAttention',
};

const REFRESH_MS = 5000;

const errorMessage = (e: unknown): string =>
  (axios.isAxiosError(e) &&
    (e.response?.data as { message?: string } | undefined)?.message) ||
  (e as Error)?.message ||
  '';

const StatTile = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) => (
  <div
    className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-[18px] px-4 py-3 ${
      tone ?? 'bg-as-surface text-as-ink'
    }`}
  >
    <span className="font-display text-2xl font-semibold tabular-nums leading-tight">
      {value}
    </span>
    <span className="text-xs font-semibold leading-tight opacity-80">
      {label}
    </span>
  </div>
);

const EmptyState = ({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-3 rounded-[22px] bg-as-surface px-6 py-14 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-as-raised text-as-ink-soft">
      <ArrowDownTrayIcon className="h-7 w-7" />
    </span>
    <h3 className="font-display text-lg font-medium text-as-ink">{title}</h3>
    {text && <p className="max-w-md text-sm text-as-ink-muted">{text}</p>}
    {action}
  </div>
);

/**
 * Every download of every arr in one list for admins, refreshed every few
 * seconds while the page is open
 */
const Downloads = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  // Book downloads come from Chaptarr, or TaleArr when it is the book service
  const bookService = isTalearrService(currentSettings.bookService)
    ? 'TaleArr'
    : 'Chaptarr';
  const [tab, setTab] = useState<DownloadTab>('all');
  const [statusFilter, setStatusFilter] = useState<DownloadStatusFilter>('all');
  const [removing, setRemoving] = useState<DownloadItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<DownloadItem | null>(null);
  const { data, error, mutate } = useSWR<DownloadsResponse>(
    '/api/v1/downloads',
    {
      refreshInterval: REFRESH_MS,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
    }
  );

  // Remember the filters between visits
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem('downloads-filters') ?? '{}'
      );
      if (DOWNLOAD_TABS.includes(saved.tab)) {
        setTab(saved.tab);
      }
      if (STATUS_FILTERS.includes(saved.status)) {
        setStatusFilter(saved.status);
      }
    } catch {
      // Storage may be blocked, the filters start fresh
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'downloads-filters',
        JSON.stringify({ tab, status: statusFilter })
      );
    } catch {
      // Storage may be blocked
    }
  }, [tab, statusFilter]);

  const searchAgain = async (item: DownloadItem) => {
    try {
      await axios.post(
        `/api/v1/downloads/${encodeURIComponent(item.id)}/search`
      );
      addToast(
        intl.formatMessage(messages.searchStarted, {
          server: item.serverName,
          title: item.title,
        }),
        { appearance: 'success', autoDismiss: true }
      );
    } catch (e) {
      addToast(
        intl.formatMessage(messages.searchError, { message: errorMessage(e) }),
        { appearance: 'error', autoDismiss: true }
      );
    }
  };

  const remove = async (item: DownloadItem, options: DownloadRemoveBody) => {
    setBusy(true);
    try {
      const { data: result } = await axios.post<DownloadRemoveResponse>(
        `/api/v1/downloads/${encodeURIComponent(item.id)}/remove`,
        options
      );
      addToast(
        result.searchError
          ? intl.formatMessage(messages.removedSearchFailed, {
              title: item.title,
              message: result.searchError,
            })
          : intl.formatMessage(
              result.searched ? messages.removedSearched : messages.removed,
              { title: item.title }
            ),
        {
          appearance: result.searchError ? 'warning' : 'success',
          autoDismiss: true,
        }
      );
      setRemoving(null);
      mutate();
    } catch (e) {
      addToast(
        intl.formatMessage(messages.removeError, { message: errorMessage(e) }),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setBusy(false);
    }
  };

  const results = data?.results ?? [];
  const visible = filterDownloads(results, tab, statusFilter);
  const totals = data?.totals;

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageTitle title={intl.formatMessage(messages.downloads)} />

      <Transition
        as="div"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        show={!!removing}
      >
        {removing && (
          <RemoveDownloadModal
            key={removing.id}
            item={removing}
            busy={busy}
            onCancel={() => !busy && setRemoving(null)}
            onRemove={(options) => remove(removing, options)}
          />
        )}
      </Transition>
      <Transition
        as="div"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        show={!!picking}
      >
        {picking?.mediaId && picking.target && (
          <ReleasePicker
            mediaId={picking.mediaId}
            target={picking.target}
            serviceName={picking.serverName}
            subTitle={picking.title}
            onClose={() => setPicking(null)}
            onGrabbed={() => {
              setPicking(null);
              mutate();
            }}
          />
        )}
      </Transition>

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-medium text-as-ink">
          {intl.formatMessage(messages.downloads)}
        </h2>
        <p className="text-sm text-as-ink-muted">
          {intl.formatMessage(messages.subtitle, { bookService })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">
        <StatTile
          label={intl.formatMessage(messages.downloading)}
          value={totals?.downloading ?? 0}
        />
        <StatTile
          label={intl.formatMessage(messages.queued)}
          value={totals?.queued ?? 0}
        />
        <StatTile
          label={intl.formatMessage(messages.attention)}
          value={totals?.attention ?? 0}
          tone={
            totals?.attention
              ? 'bg-[#3b3424] text-[#f0d9a8]'
              : 'bg-as-surface text-as-ink'
          }
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 md:pb-0"
          role="tablist"
        >
          {DOWNLOAD_TABS.filter(
            (key) =>
              // Music and books only show when their service is set up
              (key !== 'music' || currentSettings.musicEnabled) &&
              (key !== 'book' || currentSettings.booksEnabled)
          ).map((key) => {
            const count = results.filter((item) =>
              matchesTab(item, key)
            ).length;
            const active = tab === key;

            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={`flex h-10 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${
                  active
                    ? 'bg-as-accent text-as-ground'
                    : 'border border-as-line text-as-ink-soft hover:border-as-line-strong hover:text-as-ink'
                }`}
              >
                {intl.formatMessage(globalMessages[TAB_MESSAGES[key]])}
                <span
                  className={`text-xs tabular-nums ${
                    active ? 'text-as-ground/80' : 'text-as-ink-faint'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <select
          id="downloads-status"
          aria-label={intl.formatMessage(messages.statusFilter)}
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as DownloadStatusFilter)
          }
          className="block h-10 !w-full !flex-none cursor-pointer rounded-full border border-as-line bg-transparent py-0 pl-4 pr-9 text-sm font-semibold leading-none text-as-ink transition hover:border-as-line-strong focus:border-as-accent focus:ring-0 sm:text-sm sm:leading-none md:!w-auto [&>option]:bg-as-surface"
        >
          {STATUS_FILTERS.map((key) => (
            <option key={key} value={key}>
              {intl.formatMessage(messages[STATUS_MESSAGES[key]])}
              {key !== 'all' &&
                ` (${
                  results.filter(
                    (item) => matchesTab(item, tab) && matchesStatus(item, key)
                  ).length
                })`}
            </option>
          ))}
        </select>
      </div>

      {(data?.serverErrors.length ?? 0) > 0 && (
        <div className="flex items-start gap-2.5 rounded-[18px] bg-[#3b3424] px-4 py-3 text-sm text-[#f0d9a8]">
          <ExclamationTriangleIcon className="h-5 w-5 flex-none" />
          <span>
            {intl.formatMessage(messages.unableToConnect, {
              servers: data?.serverErrors
                .map((serverError) => serverError.serverName)
                .join(', '),
            })}
          </span>
        </div>
      )}

      {!data && !error ? (
        <LoadingSpinner />
      ) : !data ? (
        <EmptyState title={intl.formatMessage(messages.loadError)} />
      ) : results.length === 0 ? (
        <EmptyState
          title={intl.formatMessage(messages.emptyTitle)}
          text={intl.formatMessage(messages.emptyText, { bookService })}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={intl.formatMessage(messages.noMatches)}
          action={
            <button
              type="button"
              onClick={() => {
                setTab('all');
                setStatusFilter('all');
              }}
              className="mt-1 h-10 rounded-full border border-as-line-strong px-5 text-sm font-semibold text-as-ink transition hover:bg-as-raised"
            >
              {intl.formatMessage(messages.showAll)}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 2xl:grid-cols-3">
          {visible.map((item) => (
            <DownloadCard
              key={item.id}
              item={item}
              onSearch={searchAgain}
              onPickRelease={setPicking}
              onRemove={setRemoving}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Downloads;
