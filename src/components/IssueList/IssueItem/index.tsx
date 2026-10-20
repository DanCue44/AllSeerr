import UserAvatar from '@app/components/Allseerr/RequestList/UserAvatar';
import { statusTone } from '@app/components/Allseerr/Title/styles';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Tooltip from '@app/components/Common/Tooltip';
import { getIssueOption } from '@app/components/IssueModal/constants';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { MediaTitle } from '@app/utils/mediaTitleHelpers';
import {
  getMediaApiUrl,
  getMediaPagePath,
  getMediaTitleBackdrop,
  getMediaTitleCredit,
  getMediaTitleName,
  getMediaTitlePoster,
  getMediaTitleYear,
  getTrackLabel,
  isMusicTitle,
  isTvTitle,
} from '@app/utils/mediaTitleHelpers';
import { EyeIcon } from '@heroicons/react/24/solid';
import { IssueStatus } from '@server/constants/issue';
import type Issue from '@server/entity/Issue';
import Link from 'next/link';
import { useInView } from 'react-intersection-observer';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.IssueList.IssueItem', {
  openeduserdate: '{date} by {user}',
  seasons: '{seasonCount, plural, one {Season} other {Seasons}}',
  episodes: '{episodeCount, plural, one {Episode} other {Episodes}}',
  problemepisode: 'Affected Episode',
  issuetype: 'Type',
  issuestatus: 'Status',
  opened: 'Opened',
  viewissue: 'View Issue',
  unknownissuetype: 'Unknown',
  descriptionpreview: 'Issue Description',
  track: 'Track',
  format: 'Format',
});

/**
 * The affected track of an album issue, named from the album's track list
 */
const getProblemTrack = (
  issue: Issue,
  title: MediaTitle
): string | undefined => {
  if (!isMusicTitle(title) || issue.problemEpisode <= 0) {
    return undefined;
  }

  const disc = issue.problemSeason || 1;
  const track = title.tracks.find(
    (t) => t.disc === disc && t.position === issue.problemEpisode
  );
  const multiDisc = new Set(title.tracks.map((t) => t.disc)).size > 1;

  return track
    ? getTrackLabel(track, multiDisc)
    : `${multiDisc ? `${disc}-` : ''}${issue.problemEpisode}`;
};

interface IssueItemProps {
  issue: Issue;
}

const IssueItem = ({ issue }: IssueItemProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const url = getMediaApiUrl(issue.media);
  const { data: title, error } = useSWR<MediaTitle>(inView ? url : null);

  if (!title && !error && url) {
    return (
      <div
        className={
          ambient
            ? 'h-40 w-full animate-pulse rounded-[20px] bg-as-surface sm:h-[136px]'
            : 'h-64 w-full animate-pulse rounded-xl bg-gray-800 xl:h-28'
        }
        ref={ref}
      />
    );
  }

  if (!title) {
    return <div>uh oh</div>;
  }

  const issueOption = getIssueOption(issue.issueType, issue.media.mediaType);
  const mediaHref = getMediaPagePath(issue.media);
  const titleName = getMediaTitleName(title);
  const titleYear = getMediaTitleYear(title);
  const titleCredit = getMediaTitleCredit(title);
  const poster = getMediaTitlePoster(title);
  const backdrop = getMediaTitleBackdrop(title);
  const problemTrack = getProblemTrack(issue, title);
  const bookFormat = issue.bookFormat
    ? intl.formatMessage(
        issue.bookFormat === 'audiobook'
          ? globalMessages.audiobook
          : globalMessages.ebook
      )
    : undefined;

  const problemSeasonEpisodeLine: React.ReactNode[] = [];

  if (problemTrack) {
    problemSeasonEpisodeLine.push(
      <>
        <span className="card-field-name">
          {intl.formatMessage(messages.track)}
        </span>
        <span className="truncate">
          <Badge>{problemTrack}</Badge>
        </span>
      </>
    );
  }

  if (bookFormat) {
    problemSeasonEpisodeLine.push(
      <>
        <span className="card-field-name">
          {intl.formatMessage(messages.format)}
        </span>
        <span>
          <Badge>{bookFormat}</Badge>
        </span>
      </>
    );
  }

  if (isTvTitle(title)) {
    problemSeasonEpisodeLine.push(
      <>
        <span className="card-field-name">
          {intl.formatMessage(messages.seasons, {
            seasonCount: issue.problemSeason ? 1 : 0,
          })}
        </span>
        <span className="mr-4 uppercase">
          <Badge>
            {issue.problemSeason > 0
              ? issue.problemSeason
              : intl.formatMessage(globalMessages.all)}
          </Badge>
        </span>
      </>
    );

    if (issue.problemSeason > 0) {
      problemSeasonEpisodeLine.push(
        <>
          <span className="card-field-name">
            {intl.formatMessage(messages.episodes, {
              episodeCount: issue.problemEpisode ? 1 : 0,
            })}
          </span>
          <span className="uppercase">
            <Badge>
              {issue.problemEpisode > 0
                ? issue.problemEpisode
                : intl.formatMessage(globalMessages.all)}
            </Badge>
          </span>
        </>
      );
    }
  }

  const description = issue.comments?.[0]?.message || '';
  const maxDescriptionLength = 120;
  const shouldTruncate = description.length > maxDescriptionLength;
  const truncatedDescription = shouldTruncate
    ? description.substring(0, maxDescriptionLength) + '...'
    : description;

  if (ambient) {
    const openedAgo = (
      <FormattedRelativeTime
        value={Math.floor(
          (new Date(issue.createdAt).getTime() - Date.now()) / 1000
        )}
        updateIntervalInSeconds={1}
        numeric="auto"
      />
    );
    const chip =
      'inline-flex items-center gap-1.5 rounded-full bg-as-tile px-3 py-1 text-xs font-semibold text-as-ink-soft';

    return (
      <div className="flex w-full flex-col gap-4 rounded-[20px] bg-as-surface p-[18px] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-4">
          <Link
            href={mediaHref}
            className="relative w-[72px] flex-none self-start overflow-hidden rounded-[12px] bg-as-tile transition hover:brightness-110"
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
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="text-[13px] text-as-ink-faint">{titleYear}</div>
            <Link
              href={mediaHref}
              className="break-words font-display text-[17px] font-medium leading-snug text-as-ink transition hover:text-as-accent-soft"
            >
              {titleName}
            </Link>
            {titleCredit && (
              <div className="truncate text-sm text-as-ink-soft">
                {titleCredit}
              </div>
            )}
            {description && (
              <div className="text-sm text-as-ink-muted">
                {shouldTruncate ? (
                  <Tooltip
                    content={
                      <div className="max-w-sm p-3">
                        <div className="mb-1 text-sm font-medium text-gray-200">
                          {intl.formatMessage(messages.descriptionpreview)}
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                          {description}
                        </div>
                      </div>
                    }
                    tooltipConfig={{
                      placement: 'top',
                      offset: [0, 8],
                    }}
                  >
                    <span className="block cursor-help truncate transition-colors hover:text-as-ink">
                      {truncatedDescription}
                    </span>
                  </Tooltip>
                ) : (
                  <span className="block break-words">{description}</span>
                )}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Link
                href={`/issues/${issue.id}`}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition hover:brightness-125 ${
                  issue.status === IssueStatus.OPEN
                    ? statusTone.warn
                    : statusTone.ok
                }`}
              >
                {intl.formatMessage(
                  issue.status === IssueStatus.OPEN
                    ? globalMessages.open
                    : globalMessages.resolved
                )}
              </Link>
              <span className={chip}>
                <span className="text-as-ink-faint">
                  {intl.formatMessage(messages.issuetype)}
                </span>
                {intl.formatMessage(
                  issueOption?.name ?? messages.unknownissuetype
                )}
              </span>
              {problemTrack && (
                <span className={`${chip} max-w-full`}>
                  <span className="text-as-ink-faint">
                    {intl.formatMessage(messages.track)}
                  </span>
                  <span className="truncate">{problemTrack}</span>
                </span>
              )}
              {bookFormat && (
                <span className={chip}>
                  <span className="text-as-ink-faint">
                    {intl.formatMessage(messages.format)}
                  </span>
                  {bookFormat}
                </span>
              )}
              {isTvTitle(title) && (
                <span className={chip}>
                  <span className="text-as-ink-faint">
                    {intl.formatMessage(messages.seasons, {
                      seasonCount: issue.problemSeason ? 1 : 0,
                    })}
                  </span>
                  {issue.problemSeason > 0
                    ? issue.problemSeason
                    : intl.formatMessage(globalMessages.all)}
                </span>
              )}
              {isTvTitle(title) && issue.problemSeason > 0 && (
                <span className={chip}>
                  <span className="text-as-ink-faint">
                    {intl.formatMessage(messages.episodes, {
                      episodeCount: issue.problemEpisode ? 1 : 0,
                    })}
                  </span>
                  {issue.problemEpisode > 0
                    ? issue.problemEpisode
                    : intl.formatMessage(globalMessages.all)}
                </span>
              )}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-as-ink-faint">
              <span className="flex-none">
                {intl.formatMessage(messages.opened)}
              </span>
              {hasPermission(
                [Permission.MANAGE_ISSUES, Permission.VIEW_ISSUES],
                { type: 'or' }
              ) ? (
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  {intl.formatMessage(messages.openeduserdate, {
                    date: openedAgo,
                    user: (
                      <Link
                        href={`/users/${issue.createdBy.id}`}
                        className="group inline-flex min-w-0 items-center gap-1.5"
                      >
                        <UserAvatar
                          id={issue.createdBy.id}
                          name={issue.createdBy.displayName}
                          avatar={issue.createdBy.avatar}
                          size={20}
                        />
                        <span className="truncate font-semibold text-as-ink-soft group-hover:text-as-ink">
                          {issue.createdBy.displayName}
                        </span>
                      </Link>
                    ),
                  })}
                </span>
              ) : (
                <span>{openedAgo}</span>
              )}
            </div>
          </div>
        </div>
        <Link href={`/issues/${issue.id}`} passHref legacyBehavior>
          <Button
            as="a"
            buttonType="primary"
            className="h-11 w-full sm:w-auto sm:flex-none"
          >
            <EyeIcon />
            <span>{intl.formatMessage(messages.viewissue)}</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-xl bg-gray-800 py-4 text-gray-400 shadow-md ring-1 ring-gray-700 xl:flex-row">
      {backdrop && (
        <div className="absolute inset-0 z-0 w-full bg-cover bg-center xl:w-2/3">
          <CachedImage
            type={backdrop.type}
            src={backdrop.src}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(90deg, rgb(var(--tw-gray-800, 31 41 55) / 0.47) 0%, rgb(var(--tw-gray-800, 31 41 55) / 1) 100%)',
            }}
          />
        </div>
      )}
      <div className="relative flex w-full flex-col justify-between overflow-hidden sm:flex-row">
        <div className="relative z-10 flex w-full items-center overflow-hidden pl-4 pr-4 sm:pr-0 xl:w-7/12 2xl:w-2/3">
          <Link
            href={mediaHref}
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
            <div className="pt-0.5 text-xs text-white sm:pt-1">{titleYear}</div>
            <Link
              href={mediaHref}
              className="mr-2 min-w-0 truncate text-lg font-bold text-white hover:underline xl:text-xl"
            >
              {titleName}
            </Link>
            {titleCredit && (
              <div className="truncate text-sm text-gray-300">
                {titleCredit}
              </div>
            )}
            {description && (
              <div className="mt-1 max-w-full">
                <div className="overflow-hidden text-sm text-gray-300">
                  {shouldTruncate ? (
                    <Tooltip
                      content={
                        <div className="max-w-sm p-3">
                          <div className="mb-1 text-sm font-medium text-gray-200">
                            Issue Description
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                            {description}
                          </div>
                        </div>
                      }
                      tooltipConfig={{
                        placement: 'top',
                        offset: [0, 8],
                      }}
                    >
                      <span className="block cursor-help truncate transition-colors hover:text-gray-200">
                        {truncatedDescription}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="block break-words">{description}</span>
                  )}
                </div>
              </div>
            )}
            {problemSeasonEpisodeLine.length > 0 && (
              <div className="card-field mt-1">
                {problemSeasonEpisodeLine.map((t, k) => (
                  <span key={k}>{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="z-10 ml-4 mt-4 flex w-full flex-col justify-center overflow-hidden pr-4 text-sm sm:ml-2 sm:mt-0 xl:flex-1 xl:pr-0">
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(messages.issuestatus)}
            </span>
            {issue.status === IssueStatus.OPEN ? (
              <Badge badgeType="warning" href={`/issues/${issue.id}`}>
                {intl.formatMessage(globalMessages.open)}
              </Badge>
            ) : (
              <Badge badgeType="success" href={`/issues/${issue.id}`}>
                {intl.formatMessage(globalMessages.resolved)}
              </Badge>
            )}
          </div>
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(messages.issuetype)}
            </span>
            <span className="flex truncate text-sm text-gray-300">
              {intl.formatMessage(
                issueOption?.name ?? messages.unknownissuetype
              )}
            </span>
          </div>
          <div className="card-field">
            {hasPermission([Permission.MANAGE_ISSUES, Permission.VIEW_ISSUES], {
              type: 'or',
            }) ? (
              <>
                <span className="card-field-name">
                  {intl.formatMessage(messages.opened)}
                </span>
                <span className="flex truncate text-sm text-gray-300">
                  {intl.formatMessage(messages.openeduserdate, {
                    date: (
                      <FormattedRelativeTime
                        value={Math.floor(
                          (new Date(issue.createdAt).getTime() - Date.now()) /
                            1000
                        )}
                        updateIntervalInSeconds={1}
                        numeric="auto"
                      />
                    ),
                    user: (
                      <Link
                        href={`/users/${issue.createdBy.id}`}
                        className="group flex items-center truncate"
                      >
                        <CachedImage
                          type="avatar"
                          src={issue.createdBy.avatar}
                          alt=""
                          className="avatar-sm ml-1.5 object-cover"
                          width={20}
                          height={20}
                        />
                        <span className="truncate text-sm font-semibold group-hover:text-white group-hover:underline">
                          {issue.createdBy.displayName}
                        </span>
                      </Link>
                    ),
                  })}
                </span>
              </>
            ) : (
              <>
                <span className="card-field-name">
                  {intl.formatMessage(messages.opened)}
                </span>
                <span className="flex truncate text-sm text-gray-300">
                  <FormattedRelativeTime
                    value={Math.floor(
                      (new Date(issue.createdAt).getTime() - Date.now()) / 1000
                    )}
                    updateIntervalInSeconds={1}
                    numeric="auto"
                  />
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="z-10 mt-4 flex w-full flex-col justify-center pl-4 pr-4 xl:mt-0 xl:w-96 xl:items-end xl:pl-0">
        <span className="w-full">
          <Link href={`/issues/${issue.id}`} passHref legacyBehavior>
            <Button as="a" className="w-full" buttonType="primary">
              <EyeIcon />
              <span>{intl.formatMessage(messages.viewissue)}</span>
            </Button>
          </Link>
        </span>
      </div>
    </div>
  );
};

export default IssueItem;
