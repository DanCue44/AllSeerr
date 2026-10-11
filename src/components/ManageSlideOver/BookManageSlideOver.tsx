import ArrActions from '@app/components/ArrActions';
import BlocklistBlock from '@app/components/BlocklistBlock';
import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import SlideOver from '@app/components/Common/SlideOver';
import Tooltip from '@app/components/Common/Tooltip';
import DownloadBlock from '@app/components/DownloadBlock';
import IssueBlock from '@app/components/IssueBlock';
import RequestBlock from '@app/components/RequestBlock';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ServerIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, DocumentMinusIcon } from '@heroicons/react/24/solid';
import { IssueStatus } from '@server/constants/issue';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import type { BookDetails } from '@server/models/Book';
import axios from 'axios';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.ManageSlideOver.BookManageSlideOver',
  {
    managebook: 'Manage Book',
    downloads: 'Downloads',
    requests: 'Requests',
    openissues: 'Open Issues',
    media: 'Media',
    advanced: 'Advanced',
    openinservice: 'Open in {service}',
    markavailable: 'Mark {format} as Available',
    cleardata: 'Clear Data',
    cleardatawarning:
      'This will remove all data for this book, including any requests. {service} is not changed, and if the book is in its library, it will be added back during the next scan.',
    clearmediadataerror: 'Something went wrong while clearing the media data.',
  }
);

interface BookManageSlideOverProps {
  show?: boolean;
  data: BookDetails;
  onClose: () => void;
  revalidate: () => void;
}

/**
 * Manage panel for a book, with its requests per format and the ebook and
 * audiobook statuses
 */
const BookManageSlideOver = ({
  show,
  data,
  onClose,
  revalidate,
}: BookManageSlideOverProps) => {
  const { hasPermission } = useUser();
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const service =
    currentSettings.bookService === 'chaptarr' ? 'Chaptarr' : 'LazyLibrarian';

  const deleteMedia = async () => {
    if (data.mediaInfo) {
      try {
        await axios.delete(`/api/v1/media/${data.mediaInfo.id}`);
        revalidate();
        onClose();
      } catch {
        addToast(intl.formatMessage(messages.clearmediadataerror), {
          appearance: 'error',
          autoDismiss: true,
        });
      }
    }
  };

  const markAvailable = async (isAudiobook: boolean) => {
    if (data.mediaInfo) {
      await axios.post(`/api/v1/media/${data.mediaInfo.id}/available`, {
        isAudiobook,
      });
      revalidate();
    }
  };

  const requests =
    data.mediaInfo?.requests?.filter(
      (request) => request.status !== MediaRequestStatus.DECLINED
    ) ?? [];

  const openIssues =
    data.mediaInfo?.issues?.filter(
      (issue) => issue.status === IssueStatus.OPEN
    ) ?? [];

  const formats = [
    {
      isAudiobook: false,
      status: data.mediaInfo?.status,
      label: intl.formatMessage(globalMessages.ebook),
      downloads: data.mediaInfo?.downloadStatus ?? [],
    },
    {
      isAudiobook: true,
      status: data.mediaInfo?.statusAudio,
      label: intl.formatMessage(globalMessages.audiobook),
      downloads: data.mediaInfo?.downloadStatusAudio ?? [],
    },
  ];
  const downloads = formats.flatMap((format) =>
    format.downloads.map((item) => ({ item, label: format.label }))
  );

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.managebook)}
      onClose={() => onClose()}
      subText={data.title}
    >
      <div className="space-y-6">
        {downloads.length > 0 && (
          <div>
            <h3 className="mb-2 text-xl font-bold">
              {intl.formatMessage(messages.downloads)}
            </h3>
            <div className="overflow-hidden rounded-md border border-gray-700 shadow">
              <ul>
                {downloads.map(({ item, label }, index) => (
                  <Tooltip
                    key={`dl-status-${item.downloadId}-${index}`}
                    content={item.title}
                  >
                    <li className="border-b border-gray-700 last:border-b-0">
                      <DownloadBlock
                        downloadItem={item}
                        title={data.title}
                        label={label}
                      />
                    </li>
                  </Tooltip>
                ))}
              </ul>
            </div>
          </div>
        )}
        {hasPermission([Permission.MANAGE_ISSUES, Permission.VIEW_ISSUES], {
          type: 'or',
        }) &&
          openIssues.length > 0 && (
            <div>
              <h3 className="mb-2 text-xl font-bold">
                {intl.formatMessage(messages.openissues)}
              </h3>
              <div className="overflow-hidden rounded-md border border-gray-700 shadow">
                <ul>
                  {openIssues.map((issue) => (
                    <li
                      key={`manage-issue-${issue.id}`}
                      className="border-b border-gray-700 last:border-b-0"
                    >
                      <IssueBlock issue={issue} mediaType={MediaType.BOOK} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        {requests.length > 0 && (
          <div>
            <h3 className="mb-2 text-xl font-bold">
              {intl.formatMessage(messages.requests)}
            </h3>
            <div className="overflow-hidden rounded-md border border-gray-700 shadow">
              <ul>
                {requests.map((request) => (
                  <li
                    key={`manage-request-${request.id}`}
                    className="border-b border-gray-700 last:border-b-0"
                  >
                    <RequestBlock
                      request={request}
                      onUpdate={() => revalidate()}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {data.mediaInfo?.status === MediaStatus.BLOCKLISTED && (
          <div>
            <h3 className="mb-2 text-xl font-bold">
              {intl.formatMessage(globalMessages.blocklist)}
            </h3>
            <div className="overflow-hidden rounded-md border border-gray-700 shadow">
              <BlocklistBlock
                id={data.olId}
                mediaType={MediaType.BOOK}
                onUpdate={() => revalidate()}
                onDelete={() => onClose()}
              />
            </div>
          </div>
        )}
        {hasPermission(Permission.ADMIN) && data.mediaInfo?.serviceUrl && (
          <div>
            <h3 className="mb-2 text-xl font-bold">
              {intl.formatMessage(messages.media)}
            </h3>
            <a
              href={data.mediaInfo.serviceUrl}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <Button buttonType="ghost" className="w-full">
                <ServerIcon />
                <span>
                  {intl.formatMessage(messages.openinservice, { service })}
                </span>
              </Button>
            </a>
          </div>
        )}
        {hasPermission(Permission.MANAGE_REQUESTS) &&
          data.mediaInfo &&
          data.mediaInfo.status !== MediaStatus.BLOCKLISTED && (
            <ArrActions
              mediaId={data.mediaInfo.id}
              mediaType="book"
              active={show}
              initialTarget={{
                bookFormat:
                  data.mediaInfo.statusAudio !== MediaStatus.UNKNOWN &&
                  data.mediaInfo.status === MediaStatus.UNKNOWN
                    ? 'audiobook'
                    : 'ebook',
              }}
              onChange={revalidate}
            />
          )}
        {hasPermission(Permission.ADMIN) && data.mediaInfo && (
          <div>
            <h3 className="mb-2 text-xl font-bold">
              {intl.formatMessage(messages.advanced)}
            </h3>
            <div className="space-y-2">
              {formats
                .filter((format) => format.status !== MediaStatus.AVAILABLE)
                .map((format) => (
                  <Button
                    key={`mark-available-${format.isAudiobook}`}
                    onClick={() => markAvailable(format.isAudiobook)}
                    className="w-full"
                    buttonType="success"
                  >
                    <CheckCircleIcon />
                    <span>
                      {intl.formatMessage(messages.markavailable, {
                        format: format.label,
                      })}
                    </span>
                  </Button>
                ))}
              <div>
                <ConfirmButton
                  onClick={() => deleteMedia()}
                  confirmText={intl.formatMessage(globalMessages.areyousure)}
                  className="w-full"
                >
                  <DocumentMinusIcon />
                  <span>{intl.formatMessage(messages.cleardata)}</span>
                </ConfirmButton>
                <div className="mt-2 text-xs text-gray-400">
                  {intl.formatMessage(messages.cleardatawarning, { service })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </SlideOver>
  );
};

export default BookManageSlideOver;
