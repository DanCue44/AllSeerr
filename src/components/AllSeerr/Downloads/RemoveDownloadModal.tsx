import Modal from '@app/components/Common/Modal';
import defineMessages from '@app/utils/defineMessages';
import type {
  DownloadItem,
  DownloadRemoveBody,
} from '@server/interfaces/api/downloadInterfaces';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AllSeerr.Downloads', {
  removeTitle: 'Remove Download',
  removeDescription:
    'This removes {release} from the {server} queue. This cannot be undone.',
  remove: 'Remove',
  removing: 'Removing…',
  removeFromClient: 'Also delete it from {client}',
  removeFromClientHint:
    'Off leaves the files in the download client, for example to keep seeding.',
  theDownloadClient: 'the download client',
  blocklist: 'Blocklist this release',
  blocklistHint: '{server} will never grab this release again.',
  searchAfter: 'Search again after removing',
  searchAfterHint: 'Starts a new search in {server} for {title}.',
});

interface RemoveDownloadModalProps {
  item: DownloadItem;
  busy: boolean;
  onCancel: () => void;
  onRemove: (options: DownloadRemoveBody) => void;
}

const Option = ({
  id,
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) => (
  <div className={`flex items-start gap-2.5 ${disabled ? 'opacity-50' : ''}`}>
    <input
      id={id}
      type="checkbox"
      className="mt-0.5 rounded accent-as-accent"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <label htmlFor={id}>
      <span className="block font-semibold text-as-ink">{label}</span>
      <span className="block text-xs text-as-ink-muted">{hint}</span>
    </label>
  </div>
);

/**
 * Asks before a download leaves the queue, and how: from the download
 * client too, blocklisted, searched for again
 */
const RemoveDownloadModal = ({
  item,
  busy,
  onCancel,
  onRemove,
}: RemoveDownloadModalProps) => {
  const intl = useIntl();
  const [removeFromClient, setRemoveFromClient] = useState(true);
  // A failed release is not worth grabbing again
  const [blocklist, setBlocklist] = useState(item.status === 'failed');
  const [search, setSearch] = useState(item.needsAttention && item.canSearch);

  return (
    <Modal
      title={intl.formatMessage(messages.removeTitle)}
      subTitle={item.title}
      onCancel={onCancel}
      onOk={() => onRemove({ removeFromClient, blocklist, search })}
      okText={intl.formatMessage(busy ? messages.removing : messages.remove)}
      okButtonType="danger"
      okDisabled={busy}
      backgroundClickable={!busy}
    >
      <div className="space-y-4">
        <p className="break-words">
          {intl.formatMessage(messages.removeDescription, {
            release: (
              <span key="release" className="font-semibold text-as-ink">
                {item.releaseTitle || item.title}
              </span>
            ),
            server: item.serverName,
          })}
        </p>
        <Option
          id={`remove-client-${item.id}`}
          checked={removeFromClient}
          onChange={setRemoveFromClient}
          label={intl.formatMessage(messages.removeFromClient, {
            client:
              item.downloadClient ??
              intl.formatMessage(messages.theDownloadClient),
          })}
          hint={intl.formatMessage(messages.removeFromClientHint)}
        />
        <Option
          id={`remove-blocklist-${item.id}`}
          checked={blocklist}
          onChange={setBlocklist}
          label={intl.formatMessage(messages.blocklist)}
          hint={intl.formatMessage(messages.blocklistHint, {
            server: item.serverName,
          })}
        />
        <Option
          id={`remove-search-${item.id}`}
          checked={search && item.canSearch}
          disabled={!item.canSearch}
          onChange={setSearch}
          label={intl.formatMessage(messages.searchAfter)}
          hint={intl.formatMessage(messages.searchAfterHint, {
            server: item.serverName,
            title: item.title,
          })}
        />
      </div>
    </Modal>
  );
};

export default RemoveDownloadModal;
