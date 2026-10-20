import { pillIcon } from '@app/components/Allseerr/Title/styles';
import BlocklistModal from '@app/components/BlocklistModal';
import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { EyeSlashIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';

// Titles that are wanted or in the library cannot be blocklisted
const UNBLOCKLISTABLE_STATUSES = [
  MediaStatus.PENDING,
  MediaStatus.PROCESSING,
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.AVAILABLE,
  MediaStatus.BLOCKLISTED,
];

interface BlocklistButtonProps {
  mediaType: 'music' | 'book';
  // The MusicBrainz release group id of an album, or the OpenLibrary work id
  // of a book
  id: string;
  title: string;
  media?: Media;
  onUpdate?: () => void;
  ambient?: boolean;
}

/**
 * The admin blocklist action for albums and books, in the style of the
 * movie and series page buttons
 */
const BlocklistButton = ({
  mediaType,
  id,
  title,
  media,
  onUpdate,
  ambient,
}: BlocklistButtonProps) => {
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const { addToast } = useToasts();
  const [showModal, setShowModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // A book is blocked in both formats, so either one in use rules it out
  const statuses = [
    media?.status,
    ...(mediaType === 'book' ? [media?.statusAudio] : []),
  ];

  if (
    !hasPermission(Permission.MANAGE_BLOCKLIST) ||
    statuses.some(
      (status) =>
        status !== undefined && UNBLOCKLISTABLE_STATUSES.includes(status)
    )
  ) {
    return null;
  }

  const onBlocklist = async (): Promise<void> => {
    setIsUpdating(true);

    try {
      await axios.post('/api/v1/blocklist', {
        ...(mediaType === 'music' ? { mbId: id } : { olId: id }),
        mediaType,
        title,
        user: user?.id,
      });

      addToast(
        <span>
          {intl.formatMessage(globalMessages.blocklistSuccess, {
            title,
            strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );

      onUpdate?.();
    } catch (e) {
      if (e?.response?.status === 412) {
        addToast(
          <span>
            {intl.formatMessage(globalMessages.blocklistDuplicateError, {
              title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'info', autoDismiss: true }
        );
      } else {
        addToast(intl.formatMessage(globalMessages.blocklistError), {
          appearance: 'error',
          autoDismiss: true,
        });
      }
    }

    setIsUpdating(false);
    setShowModal(false);
  };

  return (
    <>
      <BlocklistModal
        type={mediaType}
        mbId={mediaType === 'music' ? id : undefined}
        olId={mediaType === 'book' ? id : undefined}
        show={showModal}
        onCancel={() => setShowModal(false)}
        onComplete={onBlocklist}
        isUpdating={isUpdating}
      />
      <Tooltip content={intl.formatMessage(globalMessages.addToBlocklist)}>
        <Button
          buttonType={ambient ? undefined : 'ghost'}
          className={ambient ? pillIcon : 'ml-2 first:ml-0'}
          onClick={() => setShowModal(true)}
          aria-label={intl.formatMessage(globalMessages.addToBlocklist)}
        >
          <EyeSlashIcon className={ambient ? undefined : '!mr-0'} />
        </Button>
      </Tooltip>
    </>
  );
};

export default BlocklistButton;
