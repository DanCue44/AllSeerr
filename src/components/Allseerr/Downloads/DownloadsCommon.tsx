import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import type { ComponentType, ReactNode } from 'react';

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
