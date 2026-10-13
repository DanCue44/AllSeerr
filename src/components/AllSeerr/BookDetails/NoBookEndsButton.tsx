import {
  pillSecondary,
  pillSecondaryCollapse,
} from '@app/components/AllSeerr/Title/styles';
import defineMessages from '@app/utils/defineMessages';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import type { BookDetails } from '@server/models/Book';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AllSeerr.BookDetails', {
  nobookends: 'NoBookEnds',
  openinnobookends: 'Open in NoBookEnds',
  readinnobookends: 'Read in NoBookEnds',
  listeninnobookends: 'Listen in NoBookEnds',
});

const NoBookEndsIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/nobookends-icon.png"
    alt=""
    className={`${className} shrink-0 rounded-[5px]`}
  />
);

interface NoBookEndsButtonProps {
  book: BookDetails;
  // Drops to an icon button on phones, like the other pills in the row
  compact: boolean;
}

/**
 * One pill for the NoBookEnds app, which opens the format's Audiobookshelf
 * item, or its site with the store links when the app is not installed.
 * With both formats it asks which one to open.
 */
const NoBookEndsButton = ({ book, compact }: NoBookEndsButtonProps) => {
  const intl = useIntl();
  const links = [
    ...(book.nobookendsEbookUrl
      ? [{ href: book.nobookendsEbookUrl, label: messages.readinnobookends }]
      : []),
    ...(book.nobookendsAudiobookUrl
      ? [
          {
            href: book.nobookendsAudiobookUrl,
            label: messages.listeninnobookends,
          },
        ]
      : []),
  ];

  if (!links.length) {
    return null;
  }

  const className = `inline-flex items-center justify-center border transition ${
    compact ? pillSecondaryCollapse : pillSecondary
  }`;
  const label = (
    <>
      <NoBookEndsIcon />
      <span className={compact ? 'max-sm:sr-only' : ''}>
        {intl.formatMessage(messages.nobookends)}
      </span>
    </>
  );

  if (links.length === 1) {
    return (
      <a
        href={links[0].href}
        target="_blank"
        rel="noreferrer"
        className={className}
        aria-label={intl.formatMessage(messages.openinnobookends)}
        data-testid="nobookends-button"
      >
        {label}
      </a>
    );
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton
        className={className}
        aria-label={intl.formatMessage(messages.openinnobookends)}
        data-testid="nobookends-button"
      >
        {label}
      </MenuButton>
      {/* Anchored, so the menu stays on screen wherever the pill wraps to */}
      <MenuItems
        anchor={{ to: 'bottom start', gap: 8, padding: 16 }}
        transition
        className="z-50 w-60 origin-top rounded-2xl bg-as-surface p-1.5 shadow-xl shadow-black/40 transition duration-100 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
      >
        {links.map((link) => (
          <MenuItem key={link.href}>
            {({ focus }) => (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  focus ? 'bg-as-raised text-as-ink' : 'text-as-ink-soft'
                }`}
              >
                <NoBookEndsIcon />
                {intl.formatMessage(link.label)}
              </a>
            )}
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
};

export default NoBookEndsButton;
