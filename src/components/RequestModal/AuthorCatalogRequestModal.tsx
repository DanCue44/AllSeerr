import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import SlideCheckbox from '@app/components/Common/SlideCheckbox';
import BookLanguageSelect from '@app/components/RequestModal/BookLanguageSelect';
import {
  BulkItemRow,
  BulkLimitNotice,
  BulkQuotaNotice,
  getBulkRequestToast,
  isOverQuota,
} from '@app/components/RequestModal/BulkRequest';
import useBookLanguages from '@app/hooks/useBookLanguages';
import useReadingAppPrompt from '@app/hooks/useReadingAppPrompt';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { BookLanguage } from '@server/constants/bookLanguages';
import type { BookFormatChoice } from '@server/constants/media';
import type {
  AuthorCatalogRequestBody,
  BulkRequestResponse,
} from '@server/interfaces/api/requestInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type { BulkSkipReason, WorkKind } from '@server/lib/catalogFilters';
import {
  MAX_BULK_REQUEST_ITEMS,
  getBulkSkipReason,
  getWorkKind,
} from '@server/lib/catalogFilters';
import { Permission } from '@server/lib/permissions';
import type { BookResult } from '@server/models/Search';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages(
  'components.RequestModal.AuthorCatalogRequestModal',
  {
    requestallbooks: 'Request All Books',
    booksby: 'All books by {author}',
    format: 'Format',
    both: 'Both',
    books: 'Books',
    selectedcount: '{selected, number} of {total, number} selected',
    selectall: 'Select All',
    selectnone: 'Select None',
    includestudyguides: 'Include Study Guides and Summaries',
    includecollections: 'Include Box Sets and Collections',
    detectedcount: '{count, number} found by their titles',
    onlyformat: '{format} only',
    noworks: 'No works are listed for this author.',
    nothingtorequest:
      'Every book by this author is already requested, available or blocklisted in this format.',
    truncated:
      'Showing the {shown, number} most published of {total, number} works.',
    requestadmin: 'These requests will be approved automatically.',
    ignorequota: 'Bypass User Quota',
    ignorequotaDescription:
      "These requests will not count against the user's quota limits. Use with caution.",
    requestbooks:
      'Request {count, plural, =0 {Books} one {# Book} other {# Books}}',
    requesterror: 'Something went wrong while submitting the request.',
  }
);

interface CatalogResponse {
  authorId: string;
  authorName: string;
  works: BookResult[];
  totalWorks: number;
}

interface AuthorCatalogRequestModalProps {
  authorId: string;
  authorName?: string;
  onCancel?: () => void;
  onComplete?: () => void;
}

interface CatalogWork {
  work: BookResult;
  kind: WorkKind;
  // The formats of the chosen format choice that can still be requested
  formats: boolean[];
  skipReason?: BulkSkipReason;
}

const getFormats = (format: BookFormatChoice): boolean[] =>
  format === 'both' ? [false, true] : [format === 'audiobook'];

/**
 * Requests the works of an author in one go, in one or both formats. Each
 * work and format is its own request.
 */
const AuthorCatalogRequestModal = ({
  authorId,
  authorName,
  onCancel,
  onComplete,
}: AuthorCatalogRequestModalProps) => {
  const intl = useIntl();
  const settings = useSettings();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const promptReadingApp = useReadingAppPrompt();
  const [isUpdating, setIsUpdating] = useState(false);
  const [format, setFormat] = useState<BookFormatChoice>(
    settings.currentSettings.defaultBookFormat
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeStudyGuides, setIncludeStudyGuides] = useState(false);
  const [includeCollections, setIncludeCollections] = useState(false);
  const [ignoreQuota, setIgnoreQuota] = useState(false);
  const isManager = hasPermission(Permission.MANAGE_REQUESTS);
  const { userLanguage } = useBookLanguages();
  const [language, setLanguage] = useState<BookLanguage>(userLanguage);

  useEffect(() => {
    setLanguage(userLanguage);
  }, [userLanguage]);
  const { data, error } = useSWR<CatalogResponse>(
    `/api/v1/author/${authorId}/catalog`,
    { revalidateOnMount: true, revalidateOnFocus: false }
  );
  const { data: quota } = useSWR<QuotaResponse>(
    user ? `/api/v1/user/${user.id}/quota` : null
  );

  const works = useMemo<CatalogWork[]>(
    () =>
      (data?.works ?? []).map((work) => {
        const reasons = getFormats(format).map((isAudiobook) => ({
          isAudiobook,
          reason: getBulkSkipReason(
            isAudiobook ? work.mediaInfo?.statusAudio : work.mediaInfo?.status,
            work.mediaInfo?.status
          ),
        }));
        const formats = reasons
          .filter(({ reason }) => !reason)
          .map(({ isAudiobook }) => isAudiobook);

        return {
          work,
          kind: getWorkKind(work.title, work.subtitle),
          formats,
          skipReason: formats.length === 0 ? reasons[0].reason : undefined,
        };
      }),
    [data?.works, format]
  );

  // The most published books start out selected, as many as a single
  // request can include. Study guides and box sets do not.
  const [selectionFor, setSelectionFor] = useState<BookResult[]>();

  useEffect(() => {
    if (!data?.works || selectionFor === data.works) {
      return;
    }

    const ids: string[] = [];
    let total = 0;

    for (const work of works) {
      if (work.kind !== 'book' || !work.formats.length) {
        continue;
      }

      if (total + work.formats.length > MAX_BULK_REQUEST_ITEMS) {
        break;
      }

      total += work.formats.length;
      ids.push(work.work.id);
    }

    setSelectionFor(data.works);
    setSelected(new Set(ids));
  }, [data?.works, works, selectionFor]);

  const isIncluded = (kind: WorkKind) =>
    kind === 'book' ||
    (kind === 'studyGuide' && includeStudyGuides) ||
    (kind === 'collection' && includeCollections);

  const shownWorks = works.filter((work) => isIncluded(work.kind));
  const requestableWorks = shownWorks.filter((work) => work.formats.length);
  const selectedWorks = requestableWorks.filter((work) =>
    selected.has(work.work.id)
  );
  // Each format is its own request, so both formats count twice
  const count = selectedWorks.reduce(
    (total, work) => total + work.formats.length,
    0
  );
  const studyGuideCount = works.filter(
    (work) => work.kind === 'studyGuide'
  ).length;
  const collectionCount = works.filter(
    (work) => work.kind === 'collection'
  ).length;

  const setKindSelected = (kind: WorkKind, include: boolean) =>
    setSelected((current) => {
      const next = new Set(current);

      works
        .filter((work) => work.kind === kind)
        .forEach((work) =>
          include ? next.add(work.work.id) : next.delete(work.work.id)
        );

      return next;
    });

  const toggleWork = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

  const hasAutoApprove = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.AUTO_APPROVE],
    { type: 'or' }
  );
  const isIgnoreQuotaVisible = isManager && (quota?.book.limit ?? 0) > 0;
  const bypassQuota = isIgnoreQuotaVisible && ignoreQuota;
  const overQuota = isOverQuota(quota?.book, count, bypassQuota);

  const sendRequest = async () => {
    setIsUpdating(true);

    try {
      const body: AuthorCatalogRequestBody = {
        authorId,
        olIds: selectedWorks.map((work) => work.work.id),
        format,
        // Only managers choose the language, everyone else requests in their own
        language: isManager ? language : undefined,
        ignoreQuota: bypassQuota || undefined,
      };
      const response = await axios.post<BulkRequestResponse>(
        '/api/v1/request/author-catalog',
        body
      );

      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');
      mutate(`/api/v1/author/${authorId}`);
      mutate(`/api/v1/author/${authorId}/catalog`);

      const toast = getBulkRequestToast(intl, 'book', response.data);
      addToast(toast.content, {
        appearance: toast.appearance,
        autoDismiss: true,
      });

      onComplete?.();
      promptReadingApp(
        getFormats(format).map((isAudiobook) =>
          isAudiobook ? 'audiobook' : 'ebook'
        )
      );
    } catch (e) {
      addToast(
        (axios.isAxiosError(e) && e.response?.data?.message) ||
          intl.formatMessage(messages.requesterror),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const formatOptions: { value: BookFormatChoice; label: string }[] = [
    { value: 'ebook', label: intl.formatMessage(globalMessages.ebook) },
    { value: 'audiobook', label: intl.formatMessage(globalMessages.audiobook) },
    { value: 'both', label: intl.formatMessage(messages.both) },
  ];

  const name = data?.authorName ?? authorName;

  return (
    <Modal
      loading={(!data && !error) || !quota}
      backgroundClickable
      onCancel={onCancel}
      onOk={sendRequest}
      okDisabled={
        isUpdating ||
        !data ||
        count === 0 ||
        count > MAX_BULK_REQUEST_ITEMS ||
        overQuota
      }
      title={intl.formatMessage(messages.requestallbooks)}
      subTitle={
        name
          ? intl.formatMessage(messages.booksby, { author: name })
          : undefined
      }
      okText={
        isUpdating
          ? intl.formatMessage(globalMessages.requesting)
          : intl.formatMessage(messages.requestbooks, {
              count: selectedWorks.length,
            })
      }
      okButtonType="primary"
    >
      {hasAutoApprove && (
        <div className="mt-6">
          <Alert
            title={intl.formatMessage(messages.requestadmin)}
            type="info"
          />
        </div>
      )}
      <BulkQuotaNotice
        type="book"
        quota={quota?.book}
        count={count}
        ignoreQuota={bypassQuota}
      />
      <BulkLimitNotice type="book" count={count} />
      <div className="mt-4">
        <span className="text-sm font-medium text-gray-300">
          {intl.formatMessage(messages.format)}
        </span>
        <div
          className="mt-2 grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label={intl.formatMessage(messages.format)}
        >
          {formatOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={format === option.value}
              onClick={() => setFormat(option.value)}
              className={`rounded-md px-3 py-2 text-sm font-medium ring-1 transition duration-150 ${
                format === option.value
                  ? 'bg-indigo-600 text-white ring-indigo-500'
                  : 'bg-gray-800 text-gray-300 ring-gray-700 hover:bg-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {isManager && (
        <BookLanguageSelect
          value={language}
          onChange={setLanguage}
          disabled={isUpdating}
        />
      )}
      {(
        [
          ['studyGuide', studyGuideCount, includeStudyGuides],
          ['collection', collectionCount, includeCollections],
        ] as const
      )
        .filter(([, kindCount]) => kindCount > 0)
        .map(([kind, kindCount, included]) => (
          <div
            key={`kind-${kind}`}
            className="mt-4 flex items-center justify-between gap-4"
          >
            <div>
              <span className="text-gray-100">
                {intl.formatMessage(
                  kind === 'studyGuide'
                    ? messages.includestudyguides
                    : messages.includecollections
                )}
              </span>
              <p className="text-sm text-gray-400">
                {intl.formatMessage(messages.detectedcount, {
                  count: kindCount,
                })}
              </p>
            </div>
            <SlideCheckbox
              checked={included}
              onClick={() => {
                (kind === 'studyGuide'
                  ? setIncludeStudyGuides
                  : setIncludeCollections)(!included);
                setKindSelected(kind, !included);
              }}
            />
          </div>
        ))}
      {data && works.length === 0 && (
        <p className="mt-4 text-gray-300">
          {intl.formatMessage(messages.noworks)}
        </p>
      )}
      {shownWorks.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-sm font-medium text-gray-300">
              {intl.formatMessage(messages.books)}
              <span className="ml-2 text-xs font-normal text-gray-400">
                {intl.formatMessage(messages.selectedcount, {
                  selected: selectedWorks.length,
                  total: requestableWorks.length,
                })}
              </span>
            </span>
            <span className="flex gap-3 text-sm">
              <button
                type="button"
                className="text-gray-400 transition hover:text-gray-100"
                onClick={() =>
                  setSelected(
                    (current) =>
                      new Set([
                        ...current,
                        ...requestableWorks.map((work) => work.work.id),
                      ])
                  )
                }
              >
                {intl.formatMessage(messages.selectall)}
              </button>
              <button
                type="button"
                className="text-gray-400 transition hover:text-gray-100"
                onClick={() => setSelected(new Set())}
              >
                {intl.formatMessage(messages.selectnone)}
              </button>
            </span>
          </div>
          {requestableWorks.length === 0 && (
            <p className="mt-2 text-sm text-gray-300">
              {intl.formatMessage(messages.nothingtorequest)}
            </p>
          )}
          <ul className="mt-2 max-h-80 divide-y divide-gray-700/60 overflow-y-auto rounded-md border border-gray-700">
            {shownWorks.map(({ work, formats, skipReason }) => {
              const details = [
                work.firstPublishYear ? String(work.firstPublishYear) : '',
                format === 'both' && formats.length === 1
                  ? intl.formatMessage(messages.onlyformat, {
                      format: intl.formatMessage(
                        formats[0]
                          ? globalMessages.audiobook
                          : globalMessages.ebook
                      ),
                    })
                  : '',
              ].filter(Boolean);

              return (
                <BulkItemRow
                  key={`work-${work.id}`}
                  id={work.id}
                  title={work.title}
                  detail={details.length ? details.join(' · ') : undefined}
                  checked={selected.has(work.id)}
                  skipReason={skipReason}
                  onToggle={() => toggleWork(work.id)}
                />
              );
            })}
          </ul>
          {data && data.totalWorks > data.works.length && (
            <p className="mt-2 text-sm text-gray-400">
              {intl.formatMessage(messages.truncated, {
                shown: data.works.length,
                total: data.totalWorks,
              })}
            </p>
          )}
        </div>
      )}
      {isIgnoreQuotaVisible && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <span className="text-gray-100">
              {intl.formatMessage(messages.ignorequota)}
            </span>
            <p className="text-sm text-gray-400">
              {intl.formatMessage(messages.ignorequotaDescription)}
            </p>
          </div>
          <SlideCheckbox
            checked={ignoreQuota}
            onClick={() => setIgnoreQuota((value) => !value)}
          />
        </div>
      )}
    </Modal>
  );
};

export default AuthorCatalogRequestModal;
