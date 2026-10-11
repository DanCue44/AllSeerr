import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import { getIssueOptions } from '@app/components/IssueModal/constants';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { MediaTitle } from '@app/utils/mediaTitleHelpers';
import {
  getMediaTitleBackdrop,
  getMediaTitleName,
  getTrackLabel,
  isBookTitle,
  isMusicTitle,
  isTvTitle,
} from '@app/utils/mediaTitleHelpers';
import { Label, Radio, RadioGroup } from '@headlessui/react';
import { ArrowRightCircleIcon } from '@heroicons/react/24/solid';
import type { BookFormat } from '@server/constants/media';
import { MediaStatus } from '@server/constants/media';
import type Issue from '@server/entity/Issue';
import axios from 'axios';
import { Field, Formik } from 'formik';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.IssueModal.CreateIssueModal', {
  validationMessageRequired: 'You must provide a description',
  whatswrong: "What's wrong?",
  providedetail:
    'Please provide a detailed explanation of the issue you encountered.',
  extras: 'Extras',
  season: 'Season {seasonNumber}',
  episode: 'Episode {episodeNumber}',
  allseasons: 'All Seasons',
  allepisodes: 'All Episodes',
  problemseason: 'Affected Season',
  problemepisode: 'Affected Episode',
  toastSuccessCreate:
    'Issue report for <strong>{title}</strong> submitted successfully!',
  toastFailedCreate: 'Something went wrong while submitting the issue.',
  toastviewissue: 'View Issue',
  reportissue: 'Report an Issue',
  submitissue: 'Submit Issue',
  problemtrack: 'Affected Track',
  alltracks: 'All Tracks',
  problemformat: 'Affected Format',
});

const availableStatuses = [
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
];

const classNames = (...classes: string[]) => {
  return classes.filter(Boolean).join(' ');
};

interface CreateIssueModalProps {
  mediaType: 'movie' | 'tv' | 'music' | 'book';
  tmdbId?: number;
  // Music is addressed by its MusicBrainz id, books by their work id
  mbId?: string;
  olId?: string;
  onCancel?: () => void;
}

const CreateIssueModal = ({
  onCancel,
  mediaType,
  tmdbId,
  mbId,
  olId,
}: CreateIssueModalProps) => {
  const intl = useIntl();
  const settings = useSettings();
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const mediaId =
    mediaType === 'music' ? mbId : mediaType === 'book' ? olId : tmdbId;
  const { data, error } = useSWR<MediaTitle>(
    mediaId ? `/api/v1/${mediaType}/${mediaId}` : null
  );
  const issueOptions = getIssueOptions(mediaType);

  if (!mediaId) {
    return null;
  }

  const tracks = data && isMusicTitle(data) ? data.tracks : [];
  const multiDisc = new Set(tracks.map((track) => track.disc)).size > 1;

  const availableBookFormats: BookFormat[] =
    data && isBookTitle(data)
      ? [
          ...(availableStatuses.includes(
            data.mediaInfo?.status ?? MediaStatus.UNKNOWN
          )
            ? (['ebook'] as const)
            : []),
          ...(availableStatuses.includes(
            data.mediaInfo?.statusAudio ?? MediaStatus.UNKNOWN
          )
            ? (['audiobook'] as const)
            : []),
        ]
      : [];

  const availableSeasons = (data?.mediaInfo?.seasons ?? [])
    .filter(
      (season) =>
        season.status === MediaStatus.AVAILABLE ||
        season.status === MediaStatus.PARTIALLY_AVAILABLE ||
        (settings.currentSettings.series4kEnabled &&
          hasPermission([Permission.REQUEST_4K, Permission.REQUEST_4K_TV], {
            type: 'or',
          }) &&
          (season.status4k === MediaStatus.AVAILABLE ||
            season.status4k === MediaStatus.PARTIALLY_AVAILABLE))
    )
    .map((season) => season.seasonNumber);

  const CreateIssueModalSchema = Yup.object().shape({
    message: Yup.string().required(
      intl.formatMessage(messages.validationMessageRequired)
    ),
  });

  return (
    <Formik
      initialValues={{
        selectedIssue: issueOptions[0],
        message: '',
        problemSeason: availableSeasons.length === 1 ? availableSeasons[0] : 0,
        problemEpisode: 0,
        // Album tracks are picked as disc:position, 0 for the whole album
        problemTrack: '0',
        bookFormat: availableBookFormats[0] ?? 'ebook',
      }}
      validationSchema={CreateIssueModalSchema}
      onSubmit={async (values) => {
        try {
          const [trackDisc, trackPosition] = values.problemTrack
            .split(':')
            .map(Number);
          const newIssue = await axios.post<Issue>('/api/v1/issue', {
            issueType: values.selectedIssue.issueType,
            message: values.message,
            mediaId: data?.mediaInfo?.id,
            ...(mediaType === 'music'
              ? {
                  problemSeason: trackPosition ? trackDisc : 0,
                  problemEpisode: trackPosition || 0,
                }
              : mediaType === 'book'
                ? {
                    // The formats are only known once the book has loaded
                    bookFormat: availableBookFormats.includes(values.bookFormat)
                      ? values.bookFormat
                      : (availableBookFormats[0] ?? null),
                  }
                : {
                    problemSeason: values.problemSeason,
                    problemEpisode:
                      values.problemSeason > 0 ? values.problemEpisode : 0,
                  }),
          });

          if (data) {
            addToast(
              <>
                <div>
                  {intl.formatMessage(messages.toastSuccessCreate, {
                    title: getMediaTitleName(data),
                    strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
                  })}
                </div>
                <Link href={`/issues/${newIssue.data.id}`} legacyBehavior>
                  <Button as="a" className="mt-4">
                    <span>{intl.formatMessage(messages.toastviewissue)}</span>
                    <ArrowRightCircleIcon />
                  </Button>
                </Link>
              </>,
              {
                appearance: 'success',
                autoDismiss: true,
              }
            );

            mutate('/api/v1/issue/count');
          }

          if (onCancel) {
            onCancel();
          }
        } catch {
          addToast(intl.formatMessage(messages.toastFailedCreate), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      }}
    >
      {({ handleSubmit, values, setFieldValue, errors, touched }) => {
        return (
          <Modal
            backgroundClickable
            onCancel={onCancel}
            title={intl.formatMessage(messages.reportissue)}
            subTitle={data ? getMediaTitleName(data) : undefined}
            cancelText={intl.formatMessage(globalMessages.close)}
            onOk={() => handleSubmit()}
            okText={intl.formatMessage(messages.submitissue)}
            loading={!data && !error}
            backdrop={getMediaTitleBackdrop(data)?.src}
          >
            {mediaType === 'music' && tracks.length > 0 && (
              <div className="form-row">
                <label htmlFor="problemTrack" className="text-label">
                  {intl.formatMessage(messages.problemtrack)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field as="select" id="problemTrack" name="problemTrack">
                      <option value="0">
                        {intl.formatMessage(messages.alltracks)}
                      </option>
                      {tracks.map((track) => (
                        <option
                          value={`${track.disc}:${track.position}`}
                          key={`problem-track-${track.disc}-${track.position}`}
                        >
                          {getTrackLabel(track, multiDisc)}
                        </option>
                      ))}
                    </Field>
                  </div>
                </div>
              </div>
            )}
            {mediaType === 'book' && availableBookFormats.length > 0 && (
              <div className="form-row">
                <label htmlFor="bookFormat" className="text-label">
                  {intl.formatMessage(messages.problemformat)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      as="select"
                      id="bookFormat"
                      name="bookFormat"
                      disabled={availableBookFormats.length === 1}
                    >
                      {availableBookFormats.map((format) => (
                        <option value={format} key={`problem-format-${format}`}>
                          {intl.formatMessage(
                            format === 'audiobook'
                              ? globalMessages.audiobook
                              : globalMessages.ebook
                          )}
                        </option>
                      ))}
                    </Field>
                  </div>
                </div>
              </div>
            )}
            {mediaType === 'tv' && data && isTvTitle(data) && (
              <>
                <div className="form-row">
                  <label htmlFor="problemSeason" className="text-label">
                    {intl.formatMessage(messages.problemseason)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        as="select"
                        id="problemSeason"
                        name="problemSeason"
                        disabled={availableSeasons.length === 1}
                      >
                        {availableSeasons.length > 1 && (
                          <option value={0}>
                            {intl.formatMessage(messages.allseasons)}
                          </option>
                        )}
                        {availableSeasons.map((season) => (
                          <option
                            value={season}
                            key={`problem-season-${season}`}
                          >
                            {season === 0
                              ? intl.formatMessage(messages.extras)
                              : intl.formatMessage(messages.season, {
                                  seasonNumber: season,
                                })}
                          </option>
                        ))}
                      </Field>
                    </div>
                  </div>
                </div>
                {values.problemSeason > 0 && (
                  <div className="form-row mb-2">
                    <label htmlFor="problemEpisode" className="text-label">
                      {intl.formatMessage(messages.problemepisode)}
                      <span className="label-required">*</span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Field
                          as="select"
                          id="problemEpisode"
                          name="problemEpisode"
                        >
                          <option value={0}>
                            {intl.formatMessage(messages.allepisodes)}
                          </option>
                          {[
                            ...Array(
                              data.seasons.find(
                                (season) =>
                                  Number(values.problemSeason) ===
                                  season.seasonNumber
                              )?.episodeCount ?? 0
                            ),
                          ].map((i, index) => (
                            <option
                              value={index + 1}
                              key={`problem-episode-${index + 1}`}
                            >
                              {intl.formatMessage(messages.episode, {
                                episodeNumber: index + 1,
                              })}
                            </option>
                          ))}
                        </Field>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <RadioGroup
              value={values.selectedIssue}
              onChange={(issue) => setFieldValue('selectedIssue', issue)}
              className="mt-4"
            >
              <Label className="sr-only">Select an Issue</Label>
              <div className="-space-y-px overflow-hidden rounded-md bg-gray-800/30">
                {issueOptions.map((setting, index) => (
                  <Radio
                    key={`issue-type-${setting.issueType}`}
                    as="div"
                    value={setting}
                    className={({ checked }) =>
                      classNames(
                        index === 0 ? 'rounded-tl-md rounded-tr-md' : '',
                        index === issueOptions.length - 1
                          ? 'rounded-bl-md rounded-br-md'
                          : '',
                        checked
                          ? 'z-10 border border-indigo-500 bg-indigo-400/20'
                          : 'border-gray-500',
                        'relative flex cursor-pointer border p-4 focus:outline-none'
                      )
                    }
                  >
                    {({ focus, checked }) => (
                      <>
                        <span
                          className={`${
                            checked
                              ? 'border-transparent bg-indigo-600'
                              : 'border-gray-300 bg-white'
                          } ${
                            focus ? 'ring-2 ring-indigo-300 ring-offset-2' : ''
                          } mt-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border`}
                          aria-hidden="true"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        <div className="ml-3 flex flex-col">
                          <Label
                            as="span"
                            className={`block text-sm font-medium ${
                              checked ? 'text-indigo-100' : 'text-gray-100'
                            }`}
                          >
                            {intl.formatMessage(setting.name)}
                          </Label>
                        </div>
                      </>
                    )}
                  </Radio>
                ))}
              </div>
            </RadioGroup>
            <div className="mt-4 flex-col space-y-2">
              <label htmlFor="message">
                {intl.formatMessage(messages.whatswrong)}
                <span className="label-required">*</span>
              </label>
              <Field
                as="textarea"
                name="message"
                id="message"
                className="h-28"
                placeholder={intl.formatMessage(messages.providedetail)}
              />
              {errors.message &&
                touched.message &&
                typeof errors.message === 'string' && (
                  <div className="error">{errors.message}</div>
                )}
            </div>
          </Modal>
        );
      }}
    </Formik>
  );
};

export default CreateIssueModal;
