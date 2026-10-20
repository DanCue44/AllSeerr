import { PillTabs } from '@app/components/Allseerr/ListPage';
import {
  BOOK_SUBJECTS,
  getSubjectTitle,
} from '@app/components/Discover/DiscoverBooks';
import {
  MUSIC_GENRES,
  getMusicGenreTitle,
} from '@app/components/Discover/DiscoverMusic';
import { spaceMessages } from '@app/components/Space';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { SpaceKey } from '@app/utils/spaces';
import { getSpaceSectionPath } from '@app/utils/spaces';
import type { TmdbGenre } from '@server/api/themoviedb/interfaces';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

export interface SpaceChip {
  key: string;
  label: string;
  href: string;
  active?: boolean;
}

/** A sideways scrolling row of links drawn as chips. */
export const ChipRow = ({
  chips,
  label,
}: {
  chips: SpaceChip[];
  label: string;
}) => {
  const [interfaceStyle] = useInterfaceStyle();
  const rowRef = useRef<HTMLDivElement>(null);
  const activeKey = chips.find((chip) => chip.active)?.key;

  // Brings the picked chip into view, as it can sit far along the row
  useEffect(() => {
    const row = rowRef.current?.querySelector('nav');
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');

    if (row && active) {
      const offset =
        active.getBoundingClientRect().left -
        row.getBoundingClientRect().left +
        row.scrollLeft;

      row.scrollLeft = offset - (row.clientWidth - active.offsetWidth) / 2;
    }
  }, [activeKey]);

  if (interfaceStyle === 'ambient') {
    return (
      <div ref={rowRef}>
        <PillTabs
          label={label}
          tabs={chips.map((chip) => ({
            key: chip.key,
            label: chip.label,
            href: chip.href,
            active: !!chip.active,
          }))}
        />
      </div>
    );
  }

  return (
    <div ref={rowRef}>
      <nav
        aria-label={label}
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            aria-current={chip.active ? 'page' : undefined}
            className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              chip.active
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
            }`}
          >
            {chip.label}
          </Link>
        ))}
      </nav>
    </div>
  );
};

/**
 * Genres (or book subjects) of a space, each opening the Browse page
 * filtered to it.
 */
const SpaceChips = ({ space }: { space: SpaceKey }) => {
  const intl = useIntl();
  const browse = getSpaceSectionPath(space, 'browse');
  const tmdbType =
    space === 'movies' ? 'movie' : space === 'series' ? 'tv' : undefined;
  const { data: genres } = useSWR<TmdbGenre[]>(
    tmdbType ? `/api/v1/genres/${tmdbType}` : null
  );

  let chips: SpaceChip[] = [];

  if (tmdbType) {
    chips = (genres ?? []).map((genre) => ({
      key: `genre-${genre.id}`,
      label: genre.name,
      href: `${browse}?genre=${genre.id}`,
    }));
  } else if (space === 'music') {
    chips = MUSIC_GENRES.map((genre) => ({
      key: `genre-${genre}`,
      label: intl.formatMessage(getMusicGenreTitle(genre)),
      href: `${browse}?list=genre&genre=${genre}`,
    }));
  } else {
    chips = BOOK_SUBJECTS.map((subject) => {
      const title = getSubjectTitle(subject);

      return {
        key: `subject-${subject}`,
        label: title ? intl.formatMessage(title) : subject,
        href: `${browse}?list=subject&subject=${subject}`,
      };
    });
  }

  if (!chips.length) {
    // Keeps the rows from jumping once the genres load
    return <div className="mb-6 h-12" />;
  }

  return (
    <div className="mb-6">
      <ChipRow
        chips={chips}
        label={intl.formatMessage(
          space === 'books' ? spaceMessages.subjects : spaceMessages.genres
        )}
      />
    </div>
  );
};

export default SpaceChips;
