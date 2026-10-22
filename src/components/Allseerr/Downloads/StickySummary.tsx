import type { ReactNode } from 'react';
import { Fragment, useEffect, useState } from 'react';

export interface SummaryItem {
  key: string;
  text: string;
  // Text color for numbers that need attention
  tone?: string;
  active?: boolean;
  onClick?: () => void;
}

// Same translucent ground as the floating header pills
const glass = 'bg-as-ground/95 lg:bg-as-ground/80 lg:backdrop-blur-xl';

// Header bottom plus a small gap: phones have a 44px header 14px down,
// desktop a 52px header 24px down, both below the safe area
const PHONE_TOP = 'calc(4.125rem + env(safe-area-inset-top))';
const DESKTOP_TOP = 'calc(5.25rem + env(safe-area-inset-top))';

/**
 * True once the watched block has scrolled up under the header, false while
 * any of it shows or while it is still further down the page. Returns a
 * callback ref, so it follows the block when it mounts after loading.
 */
export const useScrolledPast = () => {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') {
      setPast(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) =>
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      // The header covers the top of the page, so a block hidden behind it
      // counts as scrolled away
      { rootMargin: '-96px 0px 0px 0px' }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [node]);

  return [setNode, past] as const;
};

/**
 * The page's numbers in one slim line under the header, shown while the full
 * stat tiles are scrolled out of view
 */
const StickySummary = ({
  show,
  groups,
  label,
  actions,
}: {
  show: boolean;
  groups: SummaryItem[][];
  label: string;
  // The page's view switches, kept within reach while scrolling
  actions?: ReactNode;
}) => {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  const filled = groups.filter((group) => group.length > 0);

  return (
    <div
      className={`fixed inset-x-0 z-20 px-3.5 transition duration-200 ease-out motion-reduce:transition-none lg:px-6 xl:px-10 ${
        show
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
      style={{ top: desktop ? DESKTOP_TOP : PHONE_TOP }}
      aria-hidden={!show}
    >
      <div className="max-w-8xl mx-auto">
        <div
          role="status"
          aria-label={label}
          className={`${glass} flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-1.5 text-xs leading-snug text-as-ink-soft shadow-lg shadow-black/30 sm:text-[13px]`}
        >
          {/* Phones get the numbers on one swipeable line, with the switches below */}
          <div className="flex w-full min-w-0 items-center gap-x-2 overflow-x-auto [scrollbar-width:none] sm:w-auto sm:flex-1 sm:flex-wrap sm:gap-y-0.5 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            {filled.map((group, index) => (
              <Fragment key={group[0].key}>
                {index > 0 && (
                  <span aria-hidden="true" className="text-as-ink-muted">
                    |
                  </span>
                )}
                {group.map((item, itemIndex) => (
                  <Fragment key={item.key}>
                    {itemIndex > 0 && (
                      <span aria-hidden="true" className="text-as-ink-muted">
                        ·
                      </span>
                    )}
                    {item.onClick ? (
                      <button
                        type="button"
                        tabIndex={show ? 0 : -1}
                        onClick={item.onClick}
                        className={`whitespace-nowrap font-semibold tabular-nums transition hover:underline ${
                          item.tone ?? 'text-as-ink'
                        } ${item.active ? 'underline' : ''}`}
                      >
                        {item.text}
                      </button>
                    ) : (
                      <span
                        className={`whitespace-nowrap font-semibold tabular-nums ${
                          item.tone ?? 'text-as-ink'
                        }`}
                      >
                        {item.text}
                      </span>
                    )}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </div>
          {actions && (
            <div className="ml-auto flex flex-none items-center gap-1.5">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StickySummary;
