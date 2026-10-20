import defineMessages from '@app/utils/defineMessages';
import type { LinkProps } from 'next/link';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ChangeEvent, ReactNode, Ref } from 'react';
import { forwardRef } from 'react';

export const listPageMessages = defineMessages('components.Allseerr.ListPage', {
  sortBy: 'Sort by',
  mediaType: 'Media type',
  timeWindow: 'Time window',
  genre: 'Genre',
  sections: 'Sections',
});

/** Card grid for the Ambient list pages, sized for cards with captions. */
export const ambientGrid =
  'grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 xl:grid-cols-6 2xl:grid-cols-7';

/** Base classes for a 40px rounded control. */
export const pillControl =
  'inline-flex h-10 flex-none items-center justify-center gap-2 rounded-full border border-as-line bg-transparent text-sm font-semibold text-as-ink transition hover:border-as-line-strong hover:bg-as-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-as-accent disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4';

/** Rounded select with an optional leading icon. */
export const PillSelect = ({
  id,
  label,
  value,
  onChange,
  icon,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  icon?: ReactNode;
  children: ReactNode;
}) => (
  <div className="relative flex min-w-0 flex-none">
    {icon && (
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-as-ink-faint [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
    )}
    <select
      id={id}
      name={id}
      aria-label={label}
      value={value}
      onChange={onChange}
      className={`block h-10 !w-auto max-w-full !flex-none cursor-pointer rounded-full border border-as-line bg-transparent py-0 pr-9 text-sm font-semibold leading-none text-as-ink transition hover:border-as-line-strong focus:border-as-accent focus:ring-0 sm:text-sm sm:leading-none [&>option]:bg-as-surface ${
        icon ? 'pl-10' : 'pl-4'
      }`}
    >
      {children}
    </select>
  </div>
);

/** Rounded button for header actions, optionally highlighted. */
export const PillButton = forwardRef(function PillButton(
  {
    active = false,
    className = '',
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean },
  ref: Ref<HTMLButtonElement>
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${pillControl} px-4 ${
        active
          ? // Important, so the base pill's border and background lose
            '!border-transparent !bg-as-accent font-semibold !text-as-ground hover:brightness-110'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

/** Round icon button, for previous and next and similar. */
export const RoundIconButton = ({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
  <button
    type="button"
    aria-label={label}
    className={`${pillControl} w-10 ${className}`}
    {...props}
  >
    {children}
  </button>
);

export interface PillTab {
  key: string;
  label: ReactNode;
  active: boolean;
  href?: LinkProps['href'];
  onClick?: () => void;
  replace?: boolean;
}

/** A row of tabs drawn as pills, scrolling sideways on phones. */
export const PillTabs = ({
  tabs,
  label,
}: {
  tabs: PillTab[];
  label: string;
}) => (
  <nav
    aria-label={label}
    className="-mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
  >
    {tabs.map((tab) => {
      const className = `${pillControl} px-4 ${
        tab.active
          ? // Important, so the base pill's border and background lose
            '!border-transparent !bg-as-accent !text-as-ground hover:brightness-110'
          : ''
      }`;

      return tab.href ? (
        <Link
          key={tab.key}
          href={tab.href}
          replace={tab.replace}
          className={className}
          aria-current={tab.active ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ) : (
        <button
          key={tab.key}
          type="button"
          className={className}
          onClick={tab.onClick}
          aria-pressed={tab.active}
        >
          {tab.label}
        </button>
      );
    })}
  </nav>
);

/**
 * Header for an Ambient list page: the title in the display face, an
 * optional subtitle, and controls on the right (below on phones).
 */
export const AmbientPageHeader = ({
  title,
  subtitle,
  controls,
  testId = 'page-header',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  controls?: ReactNode;
  testId?: string;
}) => (
  <div className="mb-7 mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0">
      <h1
        className="break-words font-display text-[24px] font-medium leading-tight text-as-ink sm:text-[32px]"
        data-testid={testId}
      >
        {title}
      </h1>
      {subtitle && (
        <div className="mt-1.5 text-[15px] text-as-ink-faint">{subtitle}</div>
      )}
    </div>
    {controls && (
      <div className="flex flex-wrap items-center gap-2">{controls}</div>
    )}
  </div>
);
