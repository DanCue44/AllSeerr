import { Card, DetailRow, TitleHero } from '@app/components/Allseerr/Title';
import Biography from '@app/components/Allseerr/Title/Biography';
import StatusPill from '@app/components/Allseerr/Title/StatusPill';
import { chip, pillPrimary } from '@app/components/Allseerr/Title/styles';
import Button from '@app/components/Common/Button';
import FormatIcon, { useFormatLabel } from '@app/components/Common/FormatIcon';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import {
  getComicStatus,
  getMissingVolumes,
} from '@app/components/TitleCard/ComicTitleCard';
import useComicsEnabled from '@app/hooks/useComicsEnabled';
import useReadingAppPrompt from '@app/hooks/useReadingAppPrompt';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { ChatBubbleOvalLeftIcon } from '@heroicons/react/24/solid';
import type { ComicKind } from '@server/constants/media';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { ComicDetails as ComicDetailsType } from '@server/models/Comic';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.ComicDetails', {
  byauthors: 'by {authors}',
  volumes: '{count, plural, one {# volume} other {# volumes}}',
  inlibrary:
    '{downloaded} of {total, plural, one {# volume} other {# volumes}} in the library',
  details: 'Details',
  kind: 'Kind',
  status: 'Status',
  agerating: 'Age rating',
  alsoknownas: 'Also known as',
  fileas: 'File as',
  fileashint:
    'Only Hardcover knows this series, so it is not certain whether it is manga or a comic. Pick how Talearr files it.',
  requestseries: 'Request Series',
  requestmissing: 'Request Missing Volumes',
  requestsuccess: '<strong>{title}</strong> requested successfully!',
  requesterror: 'Something went wrong while requesting the series.',
  overviewunavailable: 'Overview unavailable.',
  comicsoff: 'Comics are not turned on.',
});

// Talearr's lookup says unrated series are Unknown
const isRated = (rating?: string) => !!rating && rating !== 'Unknown';

// AniList descriptions carry simple markup, such as <br> and <i>
const plainText = (text: string) =>
  text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const KindChoice = ({
  value,
  onChange,
}: {
  value: ComicKind;
  onChange: (kind: ComicKind) => void;
}) => {
  const intl = useIntl();
  const kinds: ComicKind[] = ['manga', 'comic'];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-as-ink">
          {intl.formatMessage(messages.fileas)}
        </span>
        <div role="radiogroup" className="flex gap-1.5">
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={value === kind}
              onClick={() => onChange(kind)}
              className={`${chip} ${
                value === kind
                  ? '!border-transparent !bg-as-accent font-semibold !text-as-ground'
                  : ''
              }`}
            >
              {intl.formatMessage(globalMessages[kind])}
            </button>
          ))}
        </div>
      </div>
      <p className="max-w-[560px] text-[13px] text-as-ink-faint">
        {intl.formatMessage(messages.fileashint)}
      </p>
    </div>
  );
};

/**
 * Page of a comic or manga series from Talearr's comics lookup, with what
 * Talearr's library holds of it and a request button
 */
const ComicDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const comicsEnabled = useComicsEnabled();
  const promptReadingApp = useReadingAppPrompt('comic');
  const comicId = router.query.comicId as string;
  const { data, error, mutate } = useSWR<ComicDetailsType>(
    comicId ? `/api/v1/comic/${comicId}` : null
  );
  const [kindChoice, setKindChoice] = useState<ComicKind | undefined>();
  const [isRequesting, setIsRequesting] = useState(false);
  const kindLabel = useFormatLabel(kindChoice ?? data?.kind ?? 'manga');

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const kind = kindChoice ?? data.kind;
  const status = getComicStatus(data);
  const activeRequest = data.mediaInfo?.requests?.find(
    (request) =>
      request.status === MediaRequestStatus.PENDING ||
      request.status === MediaRequestStatus.APPROVED
  );
  const missingVolumes = getMissingVolumes(data);
  const canRequest =
    comicsEnabled &&
    hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
      type: 'or',
    }) &&
    !activeRequest &&
    // A series Talearr has already is requested for its missing volumes
    (data.library
      ? missingVolumes > 0
      : !status ||
        status === MediaStatus.UNKNOWN ||
        status === MediaStatus.DELETED);

  const request = async () => {
    setIsRequesting(true);

    try {
      await axios.post('/api/v1/request', {
        mediaType: 'comic',
        mediaId: data.id,
        ...(data.kindKnown ? {} : { comicKind: kind }),
      });
      await mutate();
      addToast(
        intl.formatMessage(messages.requestsuccess, {
          title: data.title,
          strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
        }),
        { appearance: 'success', autoDismiss: true }
      );
      promptReadingApp();
    } catch (e) {
      addToast(
        axios.isAxiosError(e) && e.response?.data?.message
          ? e.response.data.message
          : intl.formatMessage(messages.requesterror),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setIsRequesting(false);
    }
  };

  const overview = data.overview ? plainText(data.overview) : '';

  return (
    <>
      <PageTitle title={data.title} />
      <TitleHero
        imageType="book"
        backdropPath={data.posterPath}
        blurBackdrop
        posterPath={data.posterPath}
        posterAlt={data.title}
        posterShape="book"
        posterFallback={<ChatBubbleOvalLeftIcon />}
        badges={
          <>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-as-ink-soft">
              <FormatIcon format={kind} size="inline" />
              {kindLabel}
            </span>
            <StatusPill status={status} />
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <h1
            className="font-display text-3xl font-bold leading-[1.05] tracking-[-1px] text-as-ink sm:text-4xl lg:text-5xl"
            data-testid="media-title"
          >
            {data.title}{' '}
            {!!data.year && (
              <span className="font-medium text-as-ink-faint">
                ({data.year})
              </span>
            )}
          </h1>
          {data.authors && (
            <span className="text-lg text-as-ink-muted">
              {intl.formatMessage(messages.byauthors, {
                authors: data.authors,
              })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-as-ink-muted">
          {!!data.volumes && (
            <span>
              {intl.formatMessage(messages.volumes, { count: data.volumes })}
            </span>
          )}
          {data.library && (
            <span>
              {intl.formatMessage(messages.inlibrary, {
                downloaded: data.library.downloadedCount,
                total: data.library.volumeCount,
              })}
            </span>
          )}
          {isRated(data.ageRating) && (
            <span className={chip}>{data.ageRating}</span>
          )}
        </div>

        <Biography
          text={overview || intl.formatMessage(messages.overviewunavailable)}
        />

        {canRequest && !data.kindKnown && (
          <KindChoice value={kind} onChange={setKindChoice} />
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {canRequest && (
            <Button
              className={pillPrimary}
              onClick={request}
              disabled={isRequesting}
            >
              <ArrowDownTrayIcon />
              <span>
                {intl.formatMessage(
                  isRequesting
                    ? globalMessages.requesting
                    : data.library
                      ? messages.requestmissing
                      : messages.requestseries
                )}
              </span>
            </Button>
          )}
          {comicsEnabled === false && (
            <span className="text-sm text-as-ink-faint">
              {intl.formatMessage(messages.comicsoff)}
            </span>
          )}
        </div>
      </TitleHero>

      <div className="mt-6 flex flex-col gap-6 lg:mx-10">
        <Card title={intl.formatMessage(messages.details)}>
          <div>
            <DetailRow label={intl.formatMessage(messages.kind)}>
              {kindLabel}
            </DetailRow>
            {data.status && (
              <DetailRow label={intl.formatMessage(messages.status)}>
                {data.status}
              </DetailRow>
            )}
            {isRated(data.ageRating) && (
              <DetailRow label={intl.formatMessage(messages.agerating)}>
                {data.ageRating}
              </DetailRow>
            )}
            {data.alternateTitles.length > 0 && (
              <DetailRow label={intl.formatMessage(messages.alsoknownas)}>
                {data.alternateTitles.slice(0, 4).map((title) => (
                  <span key={title}>{title}</span>
                ))}
              </DetailRow>
            )}
          </div>
        </Card>
      </div>
    </>
  );
};

export default ComicDetails;
