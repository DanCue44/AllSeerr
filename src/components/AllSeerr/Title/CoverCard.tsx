import Spinner from '@app/assets/spinner.svg';
import { RailHeader } from '@app/components/AllSeerr/Title';
import BookFormatIndicators from '@app/components/Common/BookFormatIndicators';
import CachedImage from '@app/components/Common/CachedImage';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import Tooltip from '@app/components/Common/Tooltip';
import RequestModal from '@app/components/RequestModal';
import useAlbumCover from '@app/hooks/useAlbumCover';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { isBookFormatRequestable } from '@app/utils/bookStatus';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { BookOpenIcon, MusicalNoteIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import type { AlbumResult, BookResult } from '@server/models/Search';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

export type CoverShape = 'square' | 'book';

const coverShapeClasses: Record<CoverShape, string> = {
  square: 'aspect-square rounded-2xl',
  book: 'aspect-[2/3] rounded-[5px_14px_14px_5px]',
};

interface CoverCardProps {
  href: string;
  shape: CoverShape;
  title: string;
  subtitle?: ReactNode;
  image?: string | null;
  imageType: 'music' | 'book';
  fallbackIcon: ReactNode;
  // Small label in the top corner, such as the release type
  label?: string;
  status?: MediaStatus;
  // Shown in the top corner in place of the status badge
  badges?: ReactNode;
  inProgress?: boolean;
  isUpdating?: boolean;
  onRequest?: () => void;
  className?: string;
}

/**
 * Cover with the title and a caption under it, the square and book shaped
 * counterpart of the posters in PosterRail. Shows a request button over the
 * cover when the title can be requested.
 */
export const CoverCard = ({
  href,
  shape,
  title,
  subtitle,
  image,
  imageType,
  fallbackIcon,
  label,
  status,
  badges,
  inProgress = false,
  isUpdating = false,
  onRequest,
  className = 'w-full',
}: CoverCardProps) => {
  const intl = useIntl();

  return (
    <div className={`group ${className}`}>
      <div className="relative">
        <Link
          href={href}
          className={`relative block overflow-hidden bg-as-tile ring-1 ring-transparent transition group-hover:ring-as-line-strong ${coverShapeClasses[shape]}`}
        >
          {image ? (
            <CachedImage
              type={imageType}
              src={image}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-as-ink-faint [&_svg]:h-1/3 [&_svg]:w-1/3">
              {fallbackIcon}
            </span>
          )}
          {shape === 'book' && (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 w-2.5"
              style={{
                background:
                  'linear-gradient(to right, rgba(0,0,0,0.35), rgba(255,255,255,0.08) 45%, transparent)',
              }}
            />
          )}
          {label && (
            <span className="absolute left-2 top-2 rounded-full bg-as-ground/75 px-2 py-0.5 text-[11px] font-bold text-as-ink">
              {label}
            </span>
          )}
          {badges ? (
            <span className="pointer-events-none absolute right-2 top-2 flex">
              {badges}
            </span>
          ) : status && status !== MediaStatus.UNKNOWN ? (
            <span className="absolute right-2 top-2">
              <StatusBadgeMini status={status} inProgress={inProgress} />
            </span>
          ) : null}
        </Link>
        {onRequest && !isUpdating && (
          <Tooltip content={intl.formatMessage(globalMessages.request)}>
            <button
              type="button"
              onClick={onRequest}
              aria-label={intl.formatMessage(globalMessages.request)}
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-as-accent text-as-ground opacity-0 shadow-lg transition hover:brightness-110 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        )}
        {isUpdating && (
          <div
            className={`absolute inset-0 flex items-center justify-center bg-as-ground/70 text-as-ink ${coverShapeClasses[shape]}`}
          >
            <Spinner className="h-9 w-9" />
          </div>
        )}
      </div>
      <Link
        href={href}
        className="mt-2.5 line-clamp-2 text-sm font-bold text-as-ink hover:underline"
      >
        {title}
      </Link>
      {subtitle && (
        <div className="truncate text-xs text-as-ink-faint">{subtitle}</div>
      )}
    </div>
  );
};

/**
 * Album cover card. Looks up missing covers and requests the album, the
 * same way MusicTitleCard does.
 */
export const AlbumCoverCard = ({
  album,
  subtitle,
  showLabel = true,
  className,
}: {
  album: AlbumResult;
  subtitle?: ReactNode;
  showLabel?: boolean;
  className?: string;
}) => {
  const { hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(album.mediaInfo?.status);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const cover = useAlbumCover(album.id, album.posterPath, album.needsCoverArt);

  useEffect(() => {
    setCurrentStatus(album.mediaInfo?.status);
  }, [album.mediaInfo?.status]);

  const requestComplete = useCallback((newStatus: MediaStatus) => {
    setCurrentStatus(newStatus);
    setShowRequestModal(false);
  }, []);
  const requestUpdating = useCallback(
    (updating: boolean) => setIsUpdating(updating),
    []
  );
  const closeModal = useCallback(() => setShowRequestModal(false), []);

  const canRequest =
    hasPermission([Permission.REQUEST, Permission.REQUEST_MUSIC], {
      type: 'or',
    }) &&
    (!currentStatus ||
      currentStatus === MediaStatus.UNKNOWN ||
      currentStatus === MediaStatus.DELETED);

  return (
    <>
      <RequestModal
        type="music"
        tmdbId={0}
        mbId={album.id}
        show={showRequestModal}
        onComplete={requestComplete}
        onUpdating={requestUpdating}
        onCancel={closeModal}
      />
      <CoverCard
        href={`/music/${album.id}`}
        shape="square"
        title={album.title}
        subtitle={subtitle ?? album.releaseDate?.slice(0, 4)}
        image={cover}
        imageType="music"
        fallbackIcon={<MusicalNoteIcon />}
        label={showLabel ? album.albumType : undefined}
        status={currentStatus}
        inProgress={(album.mediaInfo?.downloadStatus ?? []).length > 0}
        isUpdating={isUpdating}
        onRequest={canRequest ? () => setShowRequestModal(true) : undefined}
        className={className}
      />
    </>
  );
};

/**
 * Book cover card with an ebook and an audiobook status chip, requesting
 * the book the same way BookTitleCard does.
 */
export const BookCoverCard = ({
  book,
  subtitle,
  className,
}: {
  book: BookResult;
  subtitle?: ReactNode;
  className?: string;
}) => {
  const settings = useSettings();
  const { hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(book.mediaInfo?.status);
  const [currentStatusAudio, setCurrentStatusAudio] = useState(
    book.mediaInfo?.statusAudio
  );
  const [showRequestModal, setShowRequestModal] = useState(false);

  useEffect(() => {
    setCurrentStatus(book.mediaInfo?.status);
    setCurrentStatusAudio(book.mediaInfo?.statusAudio);
  }, [book.mediaInfo?.status, book.mediaInfo?.statusAudio]);

  // The request modal reports one status for the formats it requested
  const requestComplete = useCallback(
    (newStatus: MediaStatus) => {
      if (isBookFormatRequestable(currentStatus)) {
        setCurrentStatus(newStatus);
      }
      if (isBookFormatRequestable(currentStatusAudio)) {
        setCurrentStatusAudio(newStatus);
      }
      setShowRequestModal(false);
    },
    [currentStatus, currentStatusAudio]
  );
  const requestUpdating = useCallback(
    (updating: boolean) => setIsUpdating(updating),
    []
  );
  const closeModal = useCallback(() => setShowRequestModal(false), []);

  const canRequest =
    settings.currentSettings.booksEnabled &&
    hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
      type: 'or',
    }) &&
    (isBookFormatRequestable(currentStatus) ||
      isBookFormatRequestable(currentStatusAudio));

  return (
    <>
      <RequestModal
        type="book"
        tmdbId={0}
        olId={book.id}
        show={showRequestModal}
        onComplete={requestComplete}
        onUpdating={requestUpdating}
        onCancel={closeModal}
      />
      <CoverCard
        href={`/book/${book.id}`}
        shape="book"
        title={book.title}
        subtitle={
          subtitle ??
          (book.firstPublishYear ? String(book.firstPublishYear) : undefined)
        }
        image={book.posterPath}
        imageType="book"
        fallbackIcon={<BookOpenIcon />}
        badges={
          <BookFormatIndicators
            olId={book.id}
            title={book.title}
            author={book.authorName}
            status={currentStatus}
            statusAudio={currentStatusAudio}
          />
        }
        isUpdating={isUpdating}
        onRequest={canRequest ? () => setShowRequestModal(true) : undefined}
        className={className}
      />
    </>
  );
};

/** A titled, horizontally scrolling row of cover cards. */
export const CoverRail = ({
  title,
  href,
  seeAllLabel,
  children,
}: {
  title: string;
  href?: string;
  seeAllLabel: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-4 pt-[34px]">
    <RailHeader title={title} href={href} seeAllLabel={seeAllLabel} />
    <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 lg:-mx-10 lg:px-10">
      {children}
    </div>
  </section>
);

/** Class list for a cover card inside a CoverRail. */
export const railCoverClass = 'w-[140px] flex-none sm:w-[180px]';

/** Class list for the grid that holds discography and works covers. */
export const coverGridClass =
  'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7';
