import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import Tooltip from '@app/components/Common/Tooltip';
import DeclineRequestModal from '@app/components/DeclineRequestModal';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { MediaTitle } from '@app/utils/mediaTitleHelpers';
import {
  getMediaApiUrl,
  getMediaPagePath,
  getMediaTitleCredit,
  getMediaTitleName,
  getMediaTitlePoster,
  getMediaTitleYear,
} from '@app/utils/mediaTitleHelpers';
import { CheckIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { RemovalRequestStatus } from '@server/constants/media';
import type RemovalRequest from '@server/entity/RemovalRequest';
import axios from 'axios';
import Link from 'next/link';
import { useState } from 'react';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RemovalRequestList', {
  requestedby: 'Requested By',
  requested: 'Requested',
  reason: 'Reason',
  noreason: 'No reason given',
  approve: 'Approve and Remove',
  approveConfirm: 'Remove the title and its files?',
  cancel: 'Cancel Removal Request',
  removed: 'Removed',
  failed: 'Removal Failed',
  failedTip: 'The title could not be removed. Approve it again to retry.',
  approveError: 'Something went wrong while removing the title.',
  modifyError: 'Something went wrong while updating the removal request.',
  format: 'Format',
  bothFormats: 'Ebook and Audiobook',
});

interface RemovalRequestItemProps {
  removal: RemovalRequest;
  revalidateList: () => void;
}

const RemovalRequestItem = ({
  removal,
  revalidateList,
}: RemovalRequestItemProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const { data: title } = useSWR<MediaTitle>(getMediaApiUrl(removal.media));

  const isManager = hasPermission(Permission.MANAGE_REQUESTS);
  const isActionable =
    removal.status === RemovalRequestStatus.PENDING ||
    removal.status === RemovalRequestStatus.FAILED;

  const refresh = () => {
    revalidateList();
    mutate('/api/v1/removal/count');
  };

  const modify = async (status: 'approve' | 'decline', reason?: string) => {
    setIsUpdating(true);
    try {
      await axios.post(
        `/api/v1/removal/${removal.id}/${status}`,
        reason ? { reason } : undefined
      );
      setShowDeclineModal(false);
    } catch {
      addToast(
        intl.formatMessage(
          status === 'approve' ? messages.approveError : messages.modifyError
        ),
        { autoDismiss: true, appearance: 'error' }
      );
    } finally {
      setIsUpdating(false);
      refresh();
    }
  };

  const cancel = async () => {
    setIsUpdating(true);
    try {
      await axios.delete(`/api/v1/removal/${removal.id}`);
    } catch {
      addToast(intl.formatMessage(messages.modifyError), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsUpdating(false);
      refresh();
    }
  };

  const name = title ? getMediaTitleName(title) : '';
  const year = title ? getMediaTitleYear(title) : undefined;
  const credit = title ? getMediaTitleCredit(title) : undefined;
  const poster = getMediaTitlePoster(title);
  const href = getMediaPagePath(removal.media);
  const bookFormat = removal.bookFormat
    ? intl.formatMessage(
        removal.bookFormat === 'audiobook'
          ? globalMessages.audiobook
          : removal.bookFormat === 'ebook'
            ? globalMessages.ebook
            : messages.bothFormats
      )
    : undefined;

  const statusBadge =
    removal.status === RemovalRequestStatus.APPROVED ? (
      <Badge badgeType="success">{intl.formatMessage(messages.removed)}</Badge>
    ) : removal.status === RemovalRequestStatus.DECLINED ? (
      removal.declineReason ? (
        <Tooltip content={removal.declineReason}>
          <Badge badgeType="danger">
            {intl.formatMessage(globalMessages.declined)}
          </Badge>
        </Tooltip>
      ) : (
        <Badge badgeType="danger">
          {intl.formatMessage(globalMessages.declined)}
        </Badge>
      )
    ) : removal.status === RemovalRequestStatus.FAILED ? (
      <Tooltip content={intl.formatMessage(messages.failedTip)}>
        <Badge badgeType="danger">{intl.formatMessage(messages.failed)}</Badge>
      </Tooltip>
    ) : (
      <Badge badgeType="warning">
        {intl.formatMessage(globalMessages.pending)}
      </Badge>
    );

  return (
    <>
      <DeclineRequestModal
        show={showDeclineModal}
        title={name}
        isUpdating={isUpdating}
        onDecline={(reason) => modify('decline', reason)}
        onCancel={() => setShowDeclineModal(false)}
      />
      <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-xl bg-gray-800 py-4 text-gray-400 shadow-md ring-1 ring-gray-700 xl:min-h-[7rem] xl:flex-row">
        <div className="relative z-10 flex w-full items-center overflow-hidden pl-4 pr-4 xl:w-7/12 2xl:w-2/3">
          <Link
            href={href}
            className={`relative h-auto w-12 flex-shrink-0 scale-100 transform-gpu overflow-hidden rounded-md transition duration-300 hover:scale-105 ${
              poster.square ? 'aspect-square bg-gray-700' : ''
            }`}
          >
            <CachedImage
              type={poster.type}
              src={poster.src}
              alt=""
              sizes="100vw"
              style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
              width={600}
              height={poster.square ? 600 : 900}
            />
          </Link>
          <div className="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
            <div className="pt-0.5 text-xs font-medium text-white sm:pt-1">
              {year}
            </div>
            <Link
              href={href}
              className="mr-2 min-w-0 truncate text-lg font-bold text-white hover:underline xl:text-xl"
            >
              {name}
            </Link>
            {credit && (
              <div className="truncate text-sm text-gray-300">{credit}</div>
            )}
            {bookFormat && (
              <div className="card-field">
                <span className="card-field-name">
                  {intl.formatMessage(messages.format)}
                </span>
                <Badge badgeType="primary">{bookFormat}</Badge>
              </div>
            )}
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(messages.reason)}
              </span>
              <span className="truncate text-sm text-gray-300">
                {removal.reason ?? intl.formatMessage(messages.noreason)}
              </span>
            </div>
          </div>
        </div>
        <div className="z-10 ml-4 mt-4 flex w-full flex-col justify-center gap-1 overflow-hidden pr-4 text-sm sm:ml-2 sm:mt-0 xl:flex-1 xl:pr-0">
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(globalMessages.status)}
            </span>
            {statusBadge}
          </div>
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(messages.requested)}
            </span>
            <span className="truncate text-sm text-gray-300">
              <FormattedRelativeTime
                value={Math.floor(
                  (new Date(removal.createdAt).getTime() - Date.now()) / 1000
                )}
                updateIntervalInSeconds={1}
                numeric="auto"
              />
            </span>
          </div>
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(messages.requestedby)}
            </span>
            <Link
              href={
                removal.requestedBy.id === user?.id
                  ? '/profile'
                  : `/users/${removal.requestedBy.id}`
              }
              className="group flex items-center truncate"
            >
              <span className="truncate text-sm font-semibold group-hover:text-white group-hover:underline">
                {removal.requestedBy.displayName}
              </span>
            </Link>
          </div>
        </div>
        <div className="z-10 mt-4 flex w-full flex-col justify-center space-y-2 pl-4 pr-4 xl:mt-0 xl:w-96 xl:items-end xl:pl-0">
          {isManager && isActionable && (
            <>
              <ConfirmButton
                onClick={() => modify('approve')}
                confirmText={intl.formatMessage(messages.approveConfirm)}
                className="w-full"
              >
                <CheckIcon />
                <span>{intl.formatMessage(messages.approve)}</span>
              </ConfirmButton>
              <Button
                className="w-full"
                buttonType="danger"
                onClick={() => setShowDeclineModal(true)}
                disabled={isUpdating}
              >
                <XMarkIcon />
                <span>{intl.formatMessage(globalMessages.decline)}</span>
              </Button>
            </>
          )}
          {!isManager &&
            removal.status === RemovalRequestStatus.PENDING &&
            removal.requestedBy.id === user?.id && (
              <ConfirmButton
                onClick={() => cancel()}
                confirmText={intl.formatMessage(globalMessages.areyousure)}
                className="w-full"
              >
                <TrashIcon />
                <span>{intl.formatMessage(messages.cancel)}</span>
              </ConfirmButton>
            )}
        </div>
      </div>
    </>
  );
};

export default RemovalRequestItem;
