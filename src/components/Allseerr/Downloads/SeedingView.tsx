import type { DownloadsLayout } from '@app/components/Allseerr/Downloads/DownloadCard';
import { SEEDING_LIST_GRID } from '@app/components/Allseerr/Downloads/DownloadCard';
import {
  EmptyState,
  ListFrame,
  StatTile,
} from '@app/components/Allseerr/Downloads/DownloadsCommon';
import SeedingCard from '@app/components/Allseerr/Downloads/SeedingCard';
import {
  isNearUnsatisfiedLimit,
  sortSeeding,
} from '@app/components/Allseerr/Downloads/seedingLogic';
import { statusTone } from '@app/components/Allseerr/Title/styles';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import type {
  SeedingResponse,
  TrackerAccount,
} from '@server/interfaces/api/downloadInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Allseerr.Downloads.Seeding', {
  seeding: 'Seeding',
  atRiskCount: 'At risk',
  belowMinimum: 'Below minimum',
  trackerAccount: 'Tracker Account',
  userClass: 'Class',
  vip: 'VIP',
  unsatisfied: 'Unsatisfied',
  unsatisfiedOf: '{count} of {limit}',
  wedges: 'Wedges',
  bonusPoints: 'Bonus points',
  checkedAt: 'Checked {time}',
  unknown: 'Unknown',
  emptyTitle: 'Nothing is seeding',
  emptyText: 'Torrents Talearr grabs show up here while they seed.',
  unsupportedTitle: 'Seeding is not available',
  unsupportedText:
    'Seeding shows when Talearr is the book service and supports it. Chaptarr and LazyLibrarian do not report it.',
  loadError: 'Unable to load what Talearr seeds.',
  columnTitle: 'Title',
  columnState: 'State',
  columnSeedTime: 'Progress',
  columnSeeded: 'Seeded',
  columnRatio: 'Ratio and Client',
});

const REFRESH_MS = 30_000;

const TrackerAccountPanel = ({ mam }: { mam: TrackerAccount }) => {
  const intl = useIntl();
  const unknown = intl.formatMessage(messages.unknown);
  const number = (value: number | null) =>
    value === null ? unknown : intl.formatNumber(value);
  const nearLimit = isNearUnsatisfiedLimit(mam);

  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-as-surface p-4 sm:p-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-display text-lg font-medium text-as-ink">
          {intl.formatMessage(messages.trackerAccount)}
        </h3>
        {mam.checkedAt && (
          <span className="text-xs text-as-ink-muted">
            {intl.formatMessage(messages.checkedAt, {
              time: intl.formatDate(mam.checkedAt, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }),
            })}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatTile
          label={intl.formatMessage(messages.userClass)}
          value={mam.userClass ?? unknown}
          tone="bg-as-raised text-as-ink"
          extra={
            mam.isVip && (
              <span
                className={`flex-none rounded-full px-2 py-0.5 font-sans text-[11px] font-bold uppercase tracking-wide ${statusTone.accent}`}
              >
                {intl.formatMessage(messages.vip)}
              </span>
            )
          }
        />
        <StatTile
          label={intl.formatMessage(messages.unsatisfied)}
          value={
            mam.unsatisfiedLimit !== null
              ? intl.formatMessage(messages.unsatisfiedOf, {
                  count: number(mam.unsatisfied),
                  limit: number(mam.unsatisfiedLimit),
                })
              : number(mam.unsatisfied)
          }
          tone={nearLimit ? statusTone.warn : 'bg-as-raised text-as-ink'}
        />
        <StatTile
          label={intl.formatMessage(messages.wedges)}
          value={number(mam.wedges)}
          tone="bg-as-raised text-as-ink"
        />
        <StatTile
          label={intl.formatMessage(messages.bonusPoints)}
          value={number(mam.bonusPoints)}
          tone="bg-as-raised text-as-ink"
        />
      </div>
    </section>
  );
};

/**
 * What Talearr seeds, at risk torrents first, and the tracker account
 * its seeding rules come from
 */
const SeedingView = ({ layout = 'cards' }: { layout?: DownloadsLayout }) => {
  const intl = useIntl();
  const { data, error } = useSWR<SeedingResponse>('/api/v1/downloads/seeding', {
    refreshInterval: REFRESH_MS,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
  });

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return (
      <EmptyState
        icon={ArrowUpTrayIcon}
        title={intl.formatMessage(messages.loadError)}
      />
    );
  }

  if (!data.supported) {
    return (
      <EmptyState
        icon={ArrowUpTrayIcon}
        title={intl.formatMessage(messages.unsupportedTitle)}
        text={intl.formatMessage(messages.unsupportedText)}
      />
    );
  }

  const torrents = sortSeeding(data.torrents);
  const { summary } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">
        <StatTile
          label={intl.formatMessage(messages.seeding)}
          value={summary.seeding}
        />
        <StatTile
          label={intl.formatMessage(messages.atRiskCount)}
          value={summary.atRisk}
          tone={summary.atRisk ? statusTone.bad : undefined}
        />
        <StatTile
          label={intl.formatMessage(messages.belowMinimum)}
          value={summary.privateUnsatisfied}
        />
      </div>

      {data.trackerAccount && <TrackerAccountPanel mam={data.trackerAccount} />}

      {torrents.length === 0 ? (
        <EmptyState
          icon={ArrowUpTrayIcon}
          title={intl.formatMessage(messages.emptyTitle)}
          text={intl.formatMessage(messages.emptyText)}
        />
      ) : layout === 'list' ? (
        <ListFrame
          gridClassName={SEEDING_LIST_GRID}
          columns={[
            intl.formatMessage(messages.columnTitle),
            intl.formatMessage(messages.columnState),
            intl.formatMessage(messages.columnSeedTime),
            intl.formatMessage(messages.columnSeeded),
            intl.formatMessage(messages.columnRatio),
          ]}
        >
          {torrents.map((torrent) => (
            <SeedingCard
              key={torrent.downloadId}
              torrent={torrent}
              layout="list"
            />
          ))}
        </ListFrame>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 2xl:grid-cols-3">
          {torrents.map((torrent) => (
            <SeedingCard key={torrent.downloadId} torrent={torrent} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SeedingView;
