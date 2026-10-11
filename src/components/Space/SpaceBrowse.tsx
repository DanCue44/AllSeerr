import type { BookList } from '@app/components/Discover/DiscoverBooks';
import {
  BOOK_SUBJECTS,
  bookListMessages,
  DiscoverBookList,
  getSubjectTitle,
  isBookSubject,
} from '@app/components/Discover/DiscoverBooks';
import DiscoverMovies from '@app/components/Discover/DiscoverMovies';
import type { MusicList } from '@app/components/Discover/DiscoverMusic';
import {
  DiscoverMusicList,
  getMusicGenreTitle,
  isMusicGenre,
  MUSIC_GENRES,
  musicListMessages,
} from '@app/components/Discover/DiscoverMusic';
import DiscoverTv from '@app/components/Discover/DiscoverTv';
import SpaceLayout, { spaceMessages } from '@app/components/Space';
import type { SpaceChip } from '@app/components/Space/SpaceChips';
import { ChipRow } from '@app/components/Space/SpaceChips';
import type { SpaceKey } from '@app/utils/spaces';
import { getSpaceSectionPath } from '@app/utils/spaces';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const queryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Music has no filter grid, so its lists and genres are picked here. */
const MusicBrowse = () => {
  const intl = useIntl();
  const router = useRouter();
  const browse = getSpaceSectionPath('music', 'browse');
  const genre = queryValue(router.query.genre);
  const requested = queryValue(router.query.list);
  const list: MusicList =
    requested === 'genre' && genre && isMusicGenre(genre)
      ? 'genre'
      : requested === 'new' || requested === 'artists'
        ? requested
        : 'popular';

  const chips: SpaceChip[] = [
    ...(['popular', 'new', 'artists'] as const).map((key) => ({
      key,
      label: intl.formatMessage(musicListMessages[key]),
      href: `${browse}?list=${key}`,
      active: list === key,
    })),
    ...MUSIC_GENRES.map((key) => ({
      key: `genre-${key}`,
      label: intl.formatMessage(getMusicGenreTitle(key)),
      href: `${browse}?list=genre&genre=${key}`,
      active: list === 'genre' && genre === key,
    })),
  ];

  return (
    <>
      <div className="mb-6">
        <ChipRow
          chips={chips}
          label={intl.formatMessage(spaceMessages.lists)}
        />
      </div>
      <DiscoverMusicList
        key={`${list}-${genre ?? ''}`}
        list={list}
        genre={list === 'genre' ? genre : undefined}
        embedded
      />
    </>
  );
};

/** Books have no filter grid, so their lists and subjects are picked here. */
const BookBrowse = () => {
  const intl = useIntl();
  const router = useRouter();
  const browse = getSpaceSectionPath('books', 'browse');
  const subject = queryValue(router.query.subject);
  const requested = queryValue(router.query.list);
  // Any OpenLibrary subject can be browsed, the chips are just a start
  const list: BookList =
    requested === 'subject' && subject
      ? 'subject'
      : requested === 'popular'
        ? 'popular'
        : 'trending';

  const chips: SpaceChip[] = [
    ...(['trending', 'popular'] as const).map((key) => ({
      key,
      label: intl.formatMessage(bookListMessages[key]),
      href: `${browse}?list=${key}`,
      active: list === key,
    })),
    ...BOOK_SUBJECTS.map((key) => {
      const title = getSubjectTitle(key);

      return {
        key: `subject-${key}`,
        label: title ? intl.formatMessage(title) : key,
        href: `${browse}?list=subject&subject=${key}`,
        active: list === 'subject' && subject === key,
      };
    }),
  ];

  // A subject without a chip still gets one, so the page shows what it is
  if (list === 'subject' && subject && !isBookSubject(subject)) {
    chips.push({
      key: `subject-${subject}`,
      label: subject.replace(/_/g, ' '),
      href: `${browse}?list=subject&subject=${encodeURIComponent(subject)}`,
      active: true,
    });
  }

  return (
    <>
      <div className="mb-6">
        <ChipRow
          chips={chips}
          label={intl.formatMessage(spaceMessages.lists)}
        />
      </div>
      <DiscoverBookList
        key={`${list}-${subject ?? ''}`}
        list={list}
        subject={list === 'subject' ? subject : undefined}
        embedded
      />
    </>
  );
};

/**
 * The Browse section of a space: the full grid with sorting and filters for
 * movies and series, and every list and genre for music and books.
 */
const SpaceBrowse = ({ space }: { space: SpaceKey }) => (
  <SpaceLayout space={space} section="browse">
    {space === 'movies' ? (
      <DiscoverMovies embedded />
    ) : space === 'series' ? (
      <DiscoverTv embedded />
    ) : space === 'music' ? (
      <MusicBrowse />
    ) : (
      <BookBrowse />
    )}
  </SpaceLayout>
);

export default SpaceBrowse;
