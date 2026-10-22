import type { DownloadsLayout } from '@app/components/Allseerr/Downloads/DownloadCard';
import { DOWNLOADS_LAYOUTS } from '@app/components/Allseerr/Downloads/DownloadCard';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownTrayIcon,
  ListBulletIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import type { ComponentType, ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Allseerr.Downloads', {
  layout: 'Layout',
  layoutCards: 'Cards',
  layoutList: 'List',
});

export const StatTile = ({
  label,
  value,
  tone,
  extra,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  extra?: ReactNode;
}) => (
  <div
    className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-[18px] px-4 py-3 ${
      tone ?? 'bg-as-surface text-as-ink'
    }`}
  >
    <span className="flex items-center gap-2 font-display text-2xl font-semibold tabular-nums leading-tight">
      <span className="truncate">{value}</span>
      {extra}
    </span>
    <span className="text-xs font-semibold leading-tight opacity-80">
      {label}
    </span>
  </div>
);

export const EmptyState = ({
  title,
  text,
  action,
  icon: Icon = ArrowDownTrayIcon,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) => (
  <div className="flex flex-col items-center gap-3 rounded-[22px] bg-as-surface px-6 py-14 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-as-raised text-as-ink-soft">
      <Icon className="h-7 w-7" />
    </span>
    <h3 className="font-display text-lg font-medium text-as-ink">{title}</h3>
    {text && <p className="max-w-md text-sm text-as-ink-muted">{text}</p>}
    {action}
  </div>
);

/**
 * Cards or a compact list, for the queue and the seeding view
 */
export const LayoutToggle = ({
  value,
  onChange,
  compact = false,
}: {
  value: DownloadsLayout;
  onChange: (layout: DownloadsLayout) => void;
  compact?: boolean;
}) => {
  const intl = useIntl();

  return (
    <div
      className={`flex flex-none rounded-full bg-as-surface ${compact ? 'p-0.5' : 'p-1'}`}
      role="radiogroup"
      aria-label={intl.formatMessage(messages.layout)}
    >
      {DOWNLOADS_LAYOUTS.map((key) => {
        const active = value === key;
        const Icon = key === 'list' ? ListBulletIcon : Squares2X2Icon;
        const label = intl.formatMessage(
          key === 'list' ? messages.layoutList : messages.layoutCards
        );

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(key)}
            className={`flex items-center justify-center rounded-full transition ${
              compact ? 'h-7 w-8' : 'h-9 w-10'
            } ${
              active
                ? 'bg-as-raised text-as-ink'
                : 'text-as-ink-muted hover:text-as-ink'
            }`}
          >
            <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
          </button>
        );
      })}
    </div>
  );
};

/**
 * The list layout's frame: column headings on wider screens over one row
 * per download
 */
export const ListFrame = ({
  columns,
  gridClassName,
  children,
}: {
  columns: string[];
  gridClassName: string;
  children: ReactNode;
}) => (
  <div className="overflow-hidden rounded-[20px] bg-as-surface">
    <div
      className={`hidden items-center gap-x-3 border-b border-as-line px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-as-ink-faint md:grid ${gridClassName}`}
      aria-hidden="true"
    >
      {columns.map((column, index) => (
        <span key={index} className={index === 0 ? 'col-span-2' : 'truncate'}>
          {column}
        </span>
      ))}
    </div>
    <div className="divide-y divide-as-line">{children}</div>
  </div>
);
