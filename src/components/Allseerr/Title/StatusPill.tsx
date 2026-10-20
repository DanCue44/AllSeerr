import { statusTone } from '@app/components/Allseerr/Title/styles';
import Tooltip from '@app/components/Common/Tooltip';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import type { DownloadingItem } from '@server/lib/downloadtracker';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Allseerr.StatusPill', {
  downloading: 'Downloading · {progress}%',
  in4k: '{status} in 4K',
  hd: 'HD {status}',
  eta: 'Estimated completion: {time}',
  labelled: '{label} {status}',
  downloadingshort: 'downloading · {progress}%',
});

interface StatusPillProps {
  status?: MediaStatus;
  downloads?: DownloadingItem[];
  is4k?: boolean;
  // Show "HD" in front of the standard status when a 4K status is also shown
  labelHd?: boolean;
  href?: string;
  // Names what the status is for, for titles with more than one format,
  // for example "Ebook" gives "Ebook available"
  label?: string;
}

/**
 * Rounded status label for a title: available, downloading with progress,
 * requested, pending and so on.
 */
const StatusPill = ({
  status,
  downloads = [],
  is4k = false,
  labelHd = false,
  href,
  label: prefix,
}: StatusPillProps) => {
  const intl = useIntl();

  if (!status || status === MediaStatus.UNKNOWN) {
    return null;
  }

  const size = downloads.reduce((total, item) => total + item.size, 0);
  const left = downloads.reduce((total, item) => total + item.sizeLeft, 0);
  const progress = size ? Math.round(((size - left) / size) * 100) : 0;
  const eta = downloads
    .map((item) => item.estimatedCompletionTime)
    .filter(Boolean)
    .sort()
    .pop();

  let label: string;
  let tone: string;

  switch (status) {
    case MediaStatus.AVAILABLE:
      label = intl.formatMessage(globalMessages.available);
      tone = statusTone.accent;
      break;
    case MediaStatus.PARTIALLY_AVAILABLE:
      label = intl.formatMessage(globalMessages.partiallyavailable);
      tone = statusTone.accent;
      break;
    case MediaStatus.PROCESSING:
      label = downloads.length
        ? intl.formatMessage(messages.downloading, { progress })
        : intl.formatMessage(globalMessages.requested);
      tone = statusTone.info;
      break;
    case MediaStatus.PENDING:
      label = intl.formatMessage(globalMessages.pending);
      tone = statusTone.warn;
      break;
    case MediaStatus.BLOCKLISTED:
      label = intl.formatMessage(globalMessages.blocklisted);
      tone = statusTone.bad;
      break;
    case MediaStatus.DELETED:
      label = intl.formatMessage(globalMessages.deleted);
      tone = statusTone.bad;
      break;
    default:
      return null;
  }

  if (prefix) {
    label = intl.formatMessage(messages.labelled, {
      label: prefix,
      status:
        status === MediaStatus.PROCESSING && downloads.length
          ? intl.formatMessage(messages.downloadingshort, { progress })
          : label.toLowerCase(),
    });
  } else if (is4k) {
    label = intl.formatMessage(messages.in4k, { status: label });
  } else if (labelHd) {
    label = intl.formatMessage(messages.hd, { status: label.toLowerCase() });
  }

  const pill = (
    <span
      className={`inline-flex rounded-full px-3.5 py-[7px] text-[13px] font-bold ${tone}`}
    >
      {label}
    </span>
  );

  const linked = href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="hover:opacity-90"
    >
      {pill}
    </a>
  ) : (
    pill
  );

  return eta ? (
    <Tooltip
      content={intl.formatMessage(messages.eta, {
        time: intl.formatTime(eta, { hour: 'numeric', minute: '2-digit' }),
      })}
    >
      {linked}
    </Tooltip>
  ) : (
    linked
  );
};

export default StatusPill;
