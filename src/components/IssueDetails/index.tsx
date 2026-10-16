import UserAvatar from '@app/components/AllSeerr/RequestList/UserAvatar';
import ArrActions from '@app/components/ArrActions';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Modal from '@app/components/Common/Modal';
import PageTitle from '@app/components/Common/PageTitle';
import IssueComment from '@app/components/IssueDetails/IssueComment';
import IssueDescription from '@app/components/IssueDetails/IssueDescription';
import { getIssueOption } from '@app/components/IssueModal/constants';
import useDeepLinks from '@app/hooks/useDeepLinks';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
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
} from '@app/utils/mediaTitleHelpers';
import { Transition } from '@headlessui/react';
import {
  ChatBubbleOvalLeftEllipsisIcon,
  CheckCircleIcon,
  PlayIcon,
  ServerIcon,
} from '@heroicons/react/24/outline';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import { bookServiceName, usesChaptarr } from '@server/constants/bookService';
import { IssueStatus } from '@server/constants/issue';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import type Issue from '@server/entity/Issue';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.IssueDetails', {
  openedby: '#{issueId} opened {relativeTime} by {username}',
  closeissue: 'Close Issue',
  closeissueandcomment: 'Close with Comment',
  leavecomment: 'Comment',
  comments: 'Comments',
  reopenissue: 'Reopen Issue',
  reopenissueandcomment: 'Reopen with Comment',
  issuepagetitle: 'Issue',
  playonplex: 'Play on {mediaServerName}',
  play4konplex: 'Play in 4K on {mediaServerName}',
  openinarr: 'Open in {arr}',
  openin4karr: 'Open in 4K {arr}',
  toasteditdescriptionsuccess: 'Issue description edited successfully!',
  toasteditdescriptionfailed:
    'Something went wrong while editing the issue description.',
  toaststatusupdated: 'Issue status updated successfully!',
  toaststatusupdatefailed:
    'Something went wrong while updating the issue status.',
  issuetype: 'Type',
  lastupdated: 'Last Updated',
  problemseason: 'Affected Season',
  allseasons: 'All Seasons',
  season: 'Season {seasonNumber}',
  problemepisode: 'Affected Episode',
  allepisodes: 'All Episodes',
  episode: 'Episode {episodeNumber}',
  deleteissue: 'Delete Issue',
  deleteissueconfirm: 'Are you sure you want to delete this issue?',
  toastissuedeleted: 'Issue deleted successfully!',
  toastissuedeletefailed: 'Something went wrong while deleting the issue.',
  nocomments: 'No comments.',
  unknownissuetype: 'Unknown',
  commentplaceholder: 'Add a comment…',
  problemtrack: 'Affected Track',
  alltracks: 'All Tracks',
  problemformat: 'Affected Format',
});

const serviceNames: Record<MediaType, string> = {
  [MediaType.MOVIE]: 'Radarr',
  [MediaType.TV]: 'Sonarr',
  [MediaType.MUSIC]: 'Lidarr',
  [MediaType.BOOK]: 'LazyLibrarian',
};

const IssueDetails = () => {
  const { addToast } = useToasts();
  const router = useRouter();
  const intl = useIntl();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { user: currentUser, hasPermission } = useUser();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const { data: issueData, mutate: revalidateIssue } = useSWR<Issue>(
    `/api/v1/issue/${router.query.issueId}`
  );
  const { data, error } = useSWR<MediaTitle>(
    issueData ? getMediaApiUrl(issueData.media) : null
  );

  const { mediaUrl, mediaUrl4k } = useDeepLinks({
    mediaUrl: data?.mediaInfo?.mediaUrl,
    mediaUrl4k: data?.mediaInfo?.mediaUrl4k,
    iOSPlexUrl: data?.mediaInfo?.iOSPlexUrl,
    iOSPlexUrl4k: data?.mediaInfo?.iOSPlexUrl4k,
  });

  const CommentSchema = Yup.object().shape({
    message: Yup.string().required(),
  });

  const issueOption = getIssueOption(
    issueData?.issueType,
    issueData?.media.mediaType
  );
  const settings = useSettings();

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data || !issueData) {
    return <ErrorPage statusCode={404} />;
  }

  const belongsToUser = issueData.createdBy.id === currentUser?.id;

  const [firstComment, ...otherComments] = issueData.comments;

  const editFirstComment = async (newMessage: string) => {
    try {
      await axios.put(`/api/v1/issueComment/${firstComment.id}`, {
        message: newMessage,
      });

      addToast(intl.formatMessage(messages.toasteditdescriptionsuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      revalidateIssue();
    } catch {
      addToast(intl.formatMessage(messages.toasteditdescriptionfailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const updateIssueStatus = async (newStatus: 'open' | 'resolved') => {
    try {
      await axios.post(`/api/v1/issue/${issueData.id}/${newStatus}`);

      addToast(intl.formatMessage(messages.toaststatusupdated), {
        appearance: 'success',
        autoDismiss: true,
      });
      revalidateIssue();
      mutate('/api/v1/issue/count');
    } catch {
      addToast(intl.formatMessage(messages.toaststatusupdatefailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const deleteIssue = async () => {
    try {
      await axios.delete(`/api/v1/issue/${issueData.id}`);
      mutate('/api/v1/issue/count');

      addToast(intl.formatMessage(messages.toastissuedeleted), {
        appearance: 'success',
        autoDismiss: true,
      });
      router.push('/issues');
    } catch {
      addToast(intl.formatMessage(messages.toastissuedeletefailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const title = getMediaTitleName(data);
  const releaseYear = getMediaTitleYear(data);
  const credit = getMediaTitleCredit(data);
  const poster = getMediaTitlePoster(data);
  const backdrop = getMediaTitleBackdrop(data);
  const arr =
    issueData.media.mediaType === MediaType.BOOK &&
    usesChaptarr(settings.currentSettings.bookService)
      ? bookServiceName(settings.currentSettings.bookService)
      : (serviceNames[issueData.media.mediaType] ?? 'Sonarr');

  // The affected track of an album, from the album's track list
  let problemTrack: string | undefined;
  if (isMusicTitle(data) && issueData.problemEpisode > 0) {
    const disc = issueData.problemSeason || 1;
    const multiDisc = new Set(data.tracks.map((track) => track.disc)).size > 1;
    const track = data.tracks.find(
      (t) => t.disc === disc && t.position === issueData.problemEpisode
    );
    problemTrack = track
      ? getTrackLabel(track, multiDisc)
      : `${multiDisc ? `${disc}-` : ''}${issueData.problemEpisode}`;
  }

  const extraFacts = (
    <>
      {issueData.media.mediaType === MediaType.MUSIC && (
        <div className="media-fact">
          <span>{intl.formatMessage(messages.problemtrack)}</span>
          <span className="media-fact-value">
            {problemTrack ?? intl.formatMessage(messages.alltracks)}
          </span>
        </div>
      )}
      {issueData.media.mediaType === MediaType.BOOK && issueData.bookFormat && (
        <div className="media-fact">
          <span>{intl.formatMessage(messages.problemformat)}</span>
          <span className="media-fact-value">
            {intl.formatMessage(
              issueData.bookFormat === 'audiobook'
                ? globalMessages.audiobook
                : globalMessages.ebook
            )}
          </span>
        </div>
      )}
    </>
  );

  return (
    <div
      className="media-page"
      style={{
        height: 493,
      }}
    >
      <PageTitle title={[intl.formatMessage(messages.issuepagetitle), title]} />
      <Transition
        as="div"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        show={showDeleteModal}
      >
        <Modal
          title={intl.formatMessage(messages.deleteissue)}
          onCancel={() => setShowDeleteModal(false)}
          onOk={() => deleteIssue()}
          okText={intl.formatMessage(messages.deleteissue)}
          okButtonType="danger"
        >
          {intl.formatMessage(messages.deleteissueconfirm)}
        </Modal>
      </Transition>
      {backdrop && (
        <div className="media-page-bg-image">
          <CachedImage
            type={backdrop.type}
            alt=""
            src={backdrop.src}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
            priority
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(180deg, rgb(var(--tw-gray-900, 17 24 39) / 0.47) 0%, rgb(var(--tw-gray-900, 17 24 39) / 1) 100%)',
            }}
          />
        </div>
      )}
      <div className="media-header">
        <div
          className={`media-poster ${
            poster.square
              ? ambient
                ? 'aspect-square bg-as-tile'
                : 'aspect-square bg-gray-800'
              : ''
          }`}
        >
          <CachedImage
            type={poster.type}
            src={poster.src}
            alt=""
            sizes="100vw"
            style={{ width: '100%', height: 'auto' }}
            width={600}
            height={poster.square ? 600 : 900}
            priority
          />
        </div>
        <div className="media-title">
          <div className="media-status">
            {issueData.status === IssueStatus.OPEN && (
              <Badge badgeType="warning">
                {intl.formatMessage(globalMessages.open)}
              </Badge>
            )}
            {issueData.status === IssueStatus.RESOLVED && (
              <Badge badgeType="success">
                {intl.formatMessage(globalMessages.resolved)}
              </Badge>
            )}
          </div>
          <h1>
            <Link
              href={getMediaPagePath(issueData.media)}
              className="hover:underline"
            >
              {title}
            </Link>{' '}
            {releaseYear && <span className="media-year">({releaseYear})</span>}
          </h1>
          {credit && <span className="media-attributes">{credit}</span>}
          <span className="media-attributes">
            {intl.formatMessage(messages.openedby, {
              issueId: issueData.id,
              username: (
                <Link
                  href={
                    belongsToUser
                      ? '/profile'
                      : `/users/${issueData.createdBy.id}`
                  }
                  className="group ml-1 inline-flex h-full items-center xl:ml-1.5"
                >
                  {ambient ? (
                    <UserAvatar
                      id={issueData.createdBy.id}
                      name={issueData.createdBy.displayName}
                      avatar={issueData.createdBy.avatar}
                      size={22}
                      className="mr-1"
                    />
                  ) : (
                    <CachedImage
                      type="avatar"
                      src={issueData.createdBy.avatar}
                      alt=""
                      className="mr-0.5 h-5 w-5 scale-100 transform-gpu rounded-full object-cover transition duration-300 group-hover:scale-105 xl:mr-1 xl:h-6 xl:w-6"
                      width={20}
                      height={20}
                    />
                  )}
                  <span className="font-semibold text-gray-100 transition duration-300 group-hover:text-white group-hover:underline">
                    {issueData.createdBy.displayName}
                  </span>
                </Link>
              ),
              relativeTime: (
                <FormattedRelativeTime
                  value={Math.floor(
                    (new Date(issueData.createdAt).getTime() - Date.now()) /
                      1000
                  )}
                  updateIntervalInSeconds={1}
                  numeric="auto"
                />
              ),
            })}
          </span>
        </div>
      </div>
      <div className="relative z-10 mt-6 flex text-gray-300">
        <div className="flex-1 lg:pr-4">
          <IssueDescription
            description={firstComment.message}
            belongsToUser={belongsToUser}
            commentCount={otherComments.length}
            onEdit={(newMessage) => {
              editFirstComment(newMessage);
            }}
            onDelete={() => setShowDeleteModal(true)}
          />
          <div className="mt-8 lg:hidden">
            <div className="media-facts">
              <div className="media-fact">
                <span>{intl.formatMessage(messages.issuetype)}</span>
                <span className="media-fact-value">
                  {intl.formatMessage(
                    issueOption?.name ?? messages.unknownissuetype
                  )}
                </span>
              </div>
              {issueData.media.mediaType === MediaType.TV && (
                <>
                  <div className="media-fact">
                    <span>{intl.formatMessage(messages.problemseason)}</span>
                    <span className="media-fact-value">
                      {intl.formatMessage(
                        issueData.problemSeason > 0
                          ? messages.season
                          : messages.allseasons,
                        { seasonNumber: issueData.problemSeason }
                      )}
                    </span>
                  </div>
                  {issueData.problemSeason > 0 && (
                    <div className="media-fact">
                      <span>{intl.formatMessage(messages.problemepisode)}</span>
                      <span className="media-fact-value">
                        {intl.formatMessage(
                          issueData.problemEpisode > 0
                            ? messages.episode
                            : messages.allepisodes,
                          { episodeNumber: issueData.problemEpisode }
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}
              {extraFacts}
              <div className="media-fact">
                <span>{intl.formatMessage(messages.lastupdated)}</span>
                <span className="media-fact-value">
                  <FormattedRelativeTime
                    value={Math.floor(
                      (new Date(issueData.updatedAt).getTime() - Date.now()) /
                        1000
                    )}
                    updateIntervalInSeconds={1}
                    numeric="auto"
                  />
                </span>
              </div>
            </div>
            <div className="mb-6 mt-4 flex flex-col space-y-2">
              {issueData?.media.mediaUrl && (
                <Button
                  as="a"
                  href={mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full"
                  buttonType="ghost"
                >
                  <PlayIcon />
                  <span>
                    {settings.currentSettings.mediaServerType ===
                    MediaServerType.EMBY
                      ? intl.formatMessage(messages.playonplex, {
                          mediaServerName: 'Emby',
                        })
                      : settings.currentSettings.mediaServerType ===
                          MediaServerType.PLEX
                        ? intl.formatMessage(messages.playonplex, {
                            mediaServerName: 'Plex',
                          })
                        : intl.formatMessage(messages.playonplex, {
                            mediaServerName: 'Jellyfin',
                          })}
                  </span>
                </Button>
              )}
              {issueData?.media.serviceUrl &&
                hasPermission(Permission.ADMIN) && (
                  <Button
                    as="a"
                    href={issueData?.media.serviceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full"
                    buttonType="ghost"
                  >
                    <ServerIcon />
                    <span>
                      {intl.formatMessage(messages.openinarr, {
                        arr,
                      })}
                    </span>
                  </Button>
                )}
              {issueData?.media.mediaUrl4k && (
                <Button
                  as="a"
                  href={mediaUrl4k}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full"
                  buttonType="ghost"
                >
                  <PlayIcon />
                  <span>
                    {settings.currentSettings.mediaServerType ===
                    MediaServerType.EMBY
                      ? intl.formatMessage(messages.play4konplex, {
                          mediaServerName: 'Emby',
                        })
                      : settings.currentSettings.mediaServerType ===
                          MediaServerType.PLEX
                        ? intl.formatMessage(messages.play4konplex, {
                            mediaServerName: 'Plex',
                          })
                        : intl.formatMessage(messages.play4konplex, {
                            mediaServerName: 'Jellyfin',
                          })}
                  </span>
                </Button>
              )}
              {issueData?.media.serviceUrl4k &&
                hasPermission(Permission.ADMIN) && (
                  <Button
                    as="a"
                    href={issueData?.media.serviceUrl4k}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full"
                    buttonType="ghost"
                  >
                    <ServerIcon />
                    <span>
                      {intl.formatMessage(messages.openin4karr, {
                        arr,
                      })}
                    </span>
                  </Button>
                )}
            </div>
          </div>
          {hasPermission(Permission.MANAGE_REQUESTS) && (
            <div className="mt-6">
              <ArrActions
                layout="card"
                mediaId={issueData.media.id}
                mediaType={issueData.media.mediaType}
                issueId={issueData.id}
                allow4k={
                  (issueData.media.mediaType === MediaType.MOVIE
                    ? settings.currentSettings.movie4kEnabled
                    : issueData.media.mediaType === MediaType.TV &&
                      settings.currentSettings.series4kEnabled) &&
                  (issueData.media.status4k !== MediaStatus.UNKNOWN ||
                    !!issueData.media.externalServiceId4k)
                }
                initialTarget={
                  issueData.media.mediaType === MediaType.TV
                    ? {
                        seasonNumber:
                          issueData.problemSeason > 0
                            ? issueData.problemSeason
                            : undefined,
                        episodeNumber:
                          issueData.problemSeason > 0 &&
                          issueData.problemEpisode > 0
                            ? issueData.problemEpisode
                            : undefined,
                      }
                    : issueData.media.mediaType === MediaType.BOOK
                      ? {
                          bookFormat:
                            issueData.bookFormat === 'audiobook'
                              ? 'audiobook'
                              : 'ebook',
                        }
                      : undefined
                }
                onChange={() => revalidateIssue()}
              />
            </div>
          )}
          <div
            className={
              ambient
                ? 'mt-6 rounded-[22px] bg-as-surface px-6 py-[22px]'
                : 'mt-6'
            }
          >
            <div
              className={
                ambient
                  ? 'font-display text-lg font-medium text-as-ink lg:text-xl'
                  : 'font-semibold text-gray-100 lg:text-xl'
              }
            >
              {intl.formatMessage(messages.comments)}
            </div>
            {otherComments.map((comment) => (
              <IssueComment
                comment={comment}
                key={`issue-comment-${comment.id}`}
                isReversed={issueData.createdBy.id === comment.user.id}
                isActiveUser={comment.user.id === currentUser?.id}
                onUpdate={() => revalidateIssue()}
              />
            ))}
            {otherComments.length === 0 && (
              <div
                className={`mt-4 ${
                  ambient ? 'mb-4 text-as-ink-faint' : 'mb-10 text-gray-400'
                }`}
              >
                <span>{intl.formatMessage(messages.nocomments)}</span>
              </div>
            )}
            {(hasPermission(Permission.MANAGE_ISSUES) || belongsToUser) && (
              <Formik
                initialValues={{
                  message: '',
                }}
                validationSchema={CommentSchema}
                onSubmit={async (values, { resetForm }) => {
                  await axios.post(`/api/v1/issue/${issueData?.id}/comment`, {
                    message: values.message,
                  });
                  revalidateIssue();
                  resetForm();
                }}
              >
                {({ isValid, isSubmitting, values, handleSubmit }) => {
                  return (
                    <Form>
                      <div className={ambient ? 'mb-0 mt-6' : 'my-6'}>
                        <Field
                          id="message"
                          name="message"
                          as="textarea"
                          placeholder={intl.formatMessage(
                            messages.commentplaceholder
                          )}
                          className="h-20"
                        />
                        <div className="mt-4 flex items-center justify-end space-x-2">
                          {(hasPermission(Permission.MANAGE_ISSUES) ||
                            belongsToUser) && (
                            <>
                              {issueData.status === IssueStatus.OPEN ? (
                                <Button
                                  type="button"
                                  buttonType="danger"
                                  onClick={async () => {
                                    await updateIssueStatus('resolved');

                                    if (values.message) {
                                      handleSubmit();
                                    }
                                  }}
                                >
                                  <CheckCircleIcon />
                                  <span>
                                    {intl.formatMessage(
                                      values.message
                                        ? messages.closeissueandcomment
                                        : messages.closeissue
                                    )}
                                  </span>
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  buttonType="default"
                                  onClick={async () => {
                                    await updateIssueStatus('open');

                                    if (values.message) {
                                      handleSubmit();
                                    }
                                  }}
                                >
                                  <ArrowPathIcon />
                                  <span>
                                    {intl.formatMessage(
                                      values.message
                                        ? messages.reopenissueandcomment
                                        : messages.reopenissue
                                    )}
                                  </span>
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            type="submit"
                            buttonType="primary"
                            disabled={
                              !isValid || isSubmitting || !values.message
                            }
                          >
                            <ChatBubbleOvalLeftEllipsisIcon />
                            <span>
                              {intl.formatMessage(messages.leavecomment)}
                            </span>
                          </Button>
                        </div>
                      </div>
                    </Form>
                  );
                }}
              </Formik>
            )}
          </div>
        </div>
        <div className="hidden lg:block lg:w-80 lg:pl-4">
          <div className="media-facts">
            <div className="media-fact">
              <span>{intl.formatMessage(messages.issuetype)}</span>
              <span className="media-fact-value">
                {intl.formatMessage(
                  issueOption?.name ?? messages.unknownissuetype
                )}
              </span>
            </div>
            {issueData.media.mediaType === MediaType.TV && (
              <>
                <div className="media-fact">
                  <span>{intl.formatMessage(messages.problemseason)}</span>
                  <span className="media-fact-value">
                    {intl.formatMessage(
                      issueData.problemSeason > 0
                        ? messages.season
                        : messages.allseasons,
                      { seasonNumber: issueData.problemSeason }
                    )}
                  </span>
                </div>
                {issueData.problemSeason > 0 && (
                  <div className="media-fact">
                    <span>{intl.formatMessage(messages.problemepisode)}</span>
                    <span className="media-fact-value">
                      {intl.formatMessage(
                        issueData.problemEpisode > 0
                          ? messages.episode
                          : messages.allepisodes,
                        { episodeNumber: issueData.problemEpisode }
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
            {extraFacts}
            <div className="media-fact">
              <span>{intl.formatMessage(messages.lastupdated)}</span>
              <span className="media-fact-value">
                <FormattedRelativeTime
                  value={Math.floor(
                    (new Date(issueData.updatedAt).getTime() - Date.now()) /
                      1000
                  )}
                  updateIntervalInSeconds={1}
                  numeric="auto"
                />
              </span>
            </div>
          </div>
          <div className="mb-6 mt-4 flex flex-col space-y-2">
            {issueData?.media.mediaUrl && (
              <Button
                as="a"
                href={mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full"
                buttonType="ghost"
              >
                <PlayIcon />
                <span>
                  {settings.currentSettings.mediaServerType ===
                  MediaServerType.EMBY
                    ? intl.formatMessage(messages.playonplex, {
                        mediaServerName: 'Emby',
                      })
                    : settings.currentSettings.mediaServerType ===
                        MediaServerType.PLEX
                      ? intl.formatMessage(messages.playonplex, {
                          mediaServerName: 'Plex',
                        })
                      : intl.formatMessage(messages.playonplex, {
                          mediaServerName: 'Jellyfin',
                        })}
                </span>
              </Button>
            )}
            {issueData?.media.serviceUrl && hasPermission(Permission.ADMIN) && (
              <Button
                as="a"
                href={issueData?.media.serviceUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full"
                buttonType="ghost"
              >
                <ServerIcon />
                <span>
                  {intl.formatMessage(messages.openinarr, {
                    arr,
                  })}
                </span>
              </Button>
            )}
            {issueData?.media.mediaUrl4k && (
              <Button
                as="a"
                href={mediaUrl4k}
                target="_blank"
                rel="noreferrer"
                className="w-full"
                buttonType="ghost"
              >
                <PlayIcon />
                <span>
                  {settings.currentSettings.mediaServerType ===
                  MediaServerType.EMBY
                    ? intl.formatMessage(messages.play4konplex, {
                        mediaServerName: 'Emby',
                      })
                    : settings.currentSettings.mediaServerType ===
                        MediaServerType.PLEX
                      ? intl.formatMessage(messages.play4konplex, {
                          mediaServerName: 'Plex',
                        })
                      : intl.formatMessage(messages.play4konplex, {
                          mediaServerName: 'Jellyfin',
                        })}
                </span>
              </Button>
            )}
            {issueData?.media.serviceUrl4k &&
              hasPermission(Permission.ADMIN) && (
                <Button
                  as="a"
                  href={issueData?.media.serviceUrl4k}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full"
                  buttonType="ghost"
                >
                  <ServerIcon />
                  <span>
                    {intl.formatMessage(messages.openin4karr, {
                      arr,
                    })}
                  </span>
                </Button>
              )}
          </div>
        </div>
      </div>
      <div className="extra-bottom-space" />
    </div>
  );
};

export default IssueDetails;
