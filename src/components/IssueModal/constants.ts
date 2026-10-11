import defineMessages from '@app/utils/defineMessages';
import { IssueType, issueTypesByMediaType } from '@server/constants/issue';
import { MediaType } from '@server/constants/media';
import type { MessageDescriptor } from 'react-intl';

const messages = defineMessages('components.IssueModal', {
  issueAudio: 'Audio',
  issueVideo: 'Video',
  issueSubtitles: 'Subtitle',
  issueOther: 'Other',
  issueWrongContent: 'Wrong Content',
  issueMissingContent: 'Missing Content',
  issueAudioQuality: 'Audio Quality',
  issueWrongAlbum: 'Wrong Album or Tracks',
  issueMissingTracks: 'Missing Tracks',
  issueWrongEdition: 'Wrong Edition',
  issueMissingPages: 'Missing Pages or Chapters',
  issueAudiobookAudio: 'Audio Problem (Audiobook)',
});

interface IssueOption {
  name: MessageDescriptor;
  issueType: IssueType;
}

const defaultNames: Record<IssueType, MessageDescriptor> = {
  [IssueType.VIDEO]: messages.issueVideo,
  [IssueType.AUDIO]: messages.issueAudio,
  [IssueType.SUBTITLES]: messages.issueSubtitles,
  [IssueType.OTHER]: messages.issueOther,
  [IssueType.WRONG_CONTENT]: messages.issueWrongContent,
  [IssueType.MISSING_CONTENT]: messages.issueMissingContent,
};

const namesByMediaType: Partial<
  Record<MediaType, Partial<Record<IssueType, MessageDescriptor>>>
> = {
  [MediaType.MUSIC]: {
    [IssueType.AUDIO]: messages.issueAudioQuality,
    [IssueType.WRONG_CONTENT]: messages.issueWrongAlbum,
    [IssueType.MISSING_CONTENT]: messages.issueMissingTracks,
  },
  [MediaType.BOOK]: {
    [IssueType.WRONG_CONTENT]: messages.issueWrongEdition,
    [IssueType.MISSING_CONTENT]: messages.issueMissingPages,
    [IssueType.AUDIO]: messages.issueAudiobookAudio,
  },
};

const toOption = (issueType: IssueType, mediaType: MediaType) => ({
  name: namesByMediaType[mediaType]?.[issueType] ?? defaultNames[issueType],
  issueType,
});

/**
 * The issue types that can be reported for a kind of media, named the way
 * they read for it
 */
export const getIssueOptions = (
  mediaType: MediaType | 'movie' | 'tv' | 'music' | 'book'
): IssueOption[] =>
  (
    issueTypesByMediaType[mediaType as MediaType] ??
    issueTypesByMediaType[MediaType.MOVIE]
  ).map((issueType) => toOption(issueType, mediaType as MediaType));

/**
 * The option of a reported issue, undefined for an unknown issue type
 */
export const getIssueOption = (
  issueType: IssueType | undefined,
  mediaType: MediaType | 'movie' | 'tv' | 'music' | 'book' | undefined
): IssueOption | undefined =>
  issueType && defaultNames[issueType]
    ? toOption(issueType, (mediaType ?? MediaType.MOVIE) as MediaType)
    : undefined;

export const issueOptions: IssueOption[] = getIssueOptions(MediaType.MOVIE);
