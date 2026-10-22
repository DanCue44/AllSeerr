import Spinner from '@app/assets/spinner.svg';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import FormatIcon from '@app/components/Common/FormatIcon';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import RequestModal from '@app/components/RequestModal';
import useAlbumCover from '@app/hooks/useAlbumCover';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { useIsTouch } from '@app/hooks/useIsTouch';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { Transition } from '@headlessui/react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { MusicalNoteIcon, UserIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

interface MusicTitleCardProps {
  id: string;
  mediaType: 'album' | 'artist';
  title: string;
  subtitle?: string;
  year?: string;
  image?: string | null;
  needsCoverArt?: boolean;
  albumType?: string;
  status?: MediaStatus;
  inProgress?: boolean;
  canExpand?: boolean;
}

/**
 * Square card for albums and artists, the music counterpart of TitleCard
 */
const MusicTitleCard = ({
  id,
  mediaType,
  title,
  subtitle,
  year,
  image,
  needsCoverArt = false,
  albumType,
  status,
  inProgress = false,
  canExpand = false,
}: MusicTitleCardProps) => {
  const isTouch = useIsTouch();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const intl = useIntl();
  const { hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [showDetail, setShowDetail] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const albumCover = useAlbumCover(
    id,
    mediaType === 'album' ? image : undefined,
    mediaType === 'album' && needsCoverArt
  );
  const cover = mediaType === 'album' ? albumCover : image;
  const isArtist = mediaType === 'artist';

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  const requestComplete = useCallback((newStatus: MediaStatus) => {
    setCurrentStatus(newStatus);
    setShowRequestModal(false);
  }, []);

  const requestUpdating = useCallback(
    (updating: boolean) => setIsUpdating(updating),
    []
  );

  const closeModal = useCallback(() => setShowRequestModal(false), []);

  const showRequestButton =
    !isArtist &&
    hasPermission([Permission.REQUEST, Permission.REQUEST_MUSIC], {
      type: 'or',
    }) &&
    (!currentStatus ||
      currentStatus === MediaStatus.UNKNOWN ||
      currentStatus === MediaStatus.DELETED);

  return (
    <div
      className={
        canExpand
          ? 'w-full'
          : ambient
            ? 'w-[176px] sm:w-[200px]'
            : 'w-36 sm:w-36 md:w-44'
      }
      data-testid="music-title-card"
    >
      {!isArtist && (
        <RequestModal
          type="music"
          tmdbId={0}
          mbId={id}
          show={showRequestModal}
          onComplete={requestComplete}
          onUpdating={requestUpdating}
          onCancel={closeModal}
        />
      )}
      <div
        className={
          ambient
            ? `relative transform-gpu cursor-default overflow-hidden ${isArtist ? 'rounded-full' : 'rounded-[18px]'} bg-as-tile bg-cover outline-none transition duration-300 ${
                showDetail ? 'scale-[1.03] shadow-xl shadow-black/40' : ''
              }`
            : `relative transform-gpu cursor-default overflow-hidden rounded-xl bg-gray-800 bg-cover outline-none ring-1 transition duration-300 ${
                showDetail
                  ? 'scale-105 shadow-lg ring-gray-500'
                  : 'scale-100 shadow ring-gray-700'
              }`
        }
        style={{ paddingBottom: '100%' }}
        onMouseEnter={() => {
          if (!isTouch) {
            setShowDetail(true);
          }
        }}
        onMouseLeave={() => setShowDetail(false)}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setShowDetail(true);
          }
        }}
        role="link"
        tabIndex={0}
      >
        <div className="absolute inset-0 h-full w-full overflow-hidden">
          {cover ? (
            <CachedImage
              type="music"
              className={`absolute inset-0 h-full w-full ${
                isArtist ? 'p-4' : ''
              }`}
              alt=""
              src={cover}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: isArtist ? '9999px' : undefined,
              }}
              fill
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600">
              {isArtist ? (
                <UserIcon className="h-1/2 w-1/2" />
              ) : (
                <MusicalNoteIcon className="h-1/2 w-1/2" />
              )}
            </div>
          )}
          <div className="absolute left-0 right-0 flex items-center justify-between p-2">
            {ambient ? (
              <FormatIcon
                format={isArtist ? 'artist' : 'album'}
                size="card"
                className="z-40 self-start"
              />
            ) : (
              <div className="pointer-events-none z-40 self-start rounded-full border border-emerald-500 bg-emerald-600/80 shadow-md">
                <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                  {isArtist
                    ? intl.formatMessage(globalMessages.artist)
                    : (albumType ?? intl.formatMessage(globalMessages.album))}
                </div>
              </div>
            )}
            {currentStatus && currentStatus !== MediaStatus.UNKNOWN && (
              <div className="pointer-events-none z-40 flex">
                <StatusBadgeMini
                  status={currentStatus}
                  inProgress={inProgress}
                  shrink
                />
              </div>
            )}
          </div>
          <Transition
            as={Fragment}
            show={isUpdating}
            enter="transition-opacity ease-in-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-in-out duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-gray-800/75 text-white">
              <Spinner className="h-10 w-10" />
            </div>
          </Transition>
          <Transition
            as={Fragment}
            show={!cover || showDetail || showRequestModal}
            enter="transition-opacity"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <Link
                href={isArtist ? `/artist/${id}` : `/music/${id}`}
                className="absolute inset-0 h-full w-full cursor-pointer overflow-hidden text-left"
                style={{
                  background: ambient
                    ? 'linear-gradient(180deg, rgb(var(--as-ground) / 0.2) 0%, rgb(var(--as-ground) / 0.92) 100%)'
                    : 'linear-gradient(180deg, rgb(var(--tw-gray-800, 45 55 72) / 0.4) 0%, rgb(var(--tw-gray-800, 45 55 72) / 0.9) 100%)',
                }}
              >
                <div className="flex h-full w-full items-end">
                  <div
                    className={`px-2 text-white ${ambient ? 'hidden' : ''} ${
                      showRequestButton ? 'pb-11' : 'pb-2'
                    }`}
                  >
                    {year && (
                      <div className="text-sm font-medium">
                        {year.slice(0, 4)}
                      </div>
                    )}
                    <h1
                      className="whitespace-normal text-lg font-bold leading-tight"
                      style={{
                        WebkitLineClamp: 2,
                        display: '-webkit-box',
                        overflow: 'hidden',
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                      }}
                      data-testid="title-card-title"
                    >
                      {title}
                    </h1>
                    {subtitle && (
                      <div className="truncate text-xs">{subtitle}</div>
                    )}
                  </div>
                </div>
              </Link>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 py-2">
                {showRequestButton && (
                  <Button
                    buttonType="primary"
                    buttonSize="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowRequestModal(true);
                    }}
                    className={
                      ambient
                        ? 'h-8 w-full rounded-full border-transparent bg-as-accent font-bold text-as-ground hover:bg-as-accent hover:brightness-110'
                        : 'h-7 w-full'
                    }
                  >
                    <ArrowDownTrayIcon />
                    <span>{intl.formatMessage(globalMessages.request)}</span>
                  </Button>
                )}
              </div>
            </div>
          </Transition>
        </div>
      </div>
      {ambient && (
        <Link
          href={isArtist ? `/artist/${id}` : `/music/${id}`}
          className={`mt-2.5 block ${isArtist ? 'text-center' : ''}`}
        >
          <div className="line-clamp-2 whitespace-normal break-words font-bold text-as-ink hover:underline">
            {title}
          </div>
          <div className="truncate text-[13px] text-as-ink-faint">
            {isArtist
              ? intl.formatMessage(globalMessages.artist)
              : (albumType ?? intl.formatMessage(globalMessages.album))}
            {subtitle
              ? ` · ${subtitle}`
              : year
                ? ` · ${String(year).slice(0, 4)}`
                : ''}
          </div>
        </Link>
      )}
    </div>
  );
};

export default MusicTitleCard;
