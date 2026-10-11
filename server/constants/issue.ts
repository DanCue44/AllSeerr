import { MediaType } from '@server/constants/media';

export enum IssueType {
  VIDEO = 1,
  AUDIO = 2,
  SUBTITLES = 3,
  OTHER = 4,
  // Music and books: the wrong album, tracks or edition was downloaded
  WRONG_CONTENT = 5,
  // Music and books: tracks, pages or chapters are missing
  MISSING_CONTENT = 6,
}

export enum IssueStatus {
  OPEN = 1,
  RESOLVED = 2,
}

export const IssueTypeName = {
  [IssueType.AUDIO]: 'Audio',
  [IssueType.VIDEO]: 'Video',
  [IssueType.SUBTITLES]: 'Subtitle',
  [IssueType.OTHER]: 'Other',
  [IssueType.WRONG_CONTENT]: 'Wrong Content',
  [IssueType.MISSING_CONTENT]: 'Missing Content',
};

const musicIssueTypeName: Partial<Record<IssueType, string>> = {
  [IssueType.AUDIO]: 'Audio Quality',
  [IssueType.WRONG_CONTENT]: 'Wrong Album',
  [IssueType.MISSING_CONTENT]: 'Missing Tracks',
};

const bookIssueTypeName: Partial<Record<IssueType, string>> = {
  [IssueType.WRONG_CONTENT]: 'Wrong Edition',
  [IssueType.MISSING_CONTENT]: 'Missing Pages',
};

/**
 * Name of an issue type as it reads for the media it was reported on, so an
 * album shows Missing Tracks where a book shows Missing Pages
 */
export const getIssueTypeName = (
  issueType: IssueType,
  mediaType?: MediaType
): string =>
  (mediaType === MediaType.MUSIC
    ? musicIssueTypeName[issueType]
    : mediaType === MediaType.BOOK
      ? bookIssueTypeName[issueType]
      : undefined) ??
  IssueTypeName[issueType] ??
  IssueTypeName[IssueType.OTHER];

/**
 * The issue types that can be reported for each kind of media
 */
export const issueTypesByMediaType: Record<MediaType, IssueType[]> = {
  [MediaType.MOVIE]: [
    IssueType.VIDEO,
    IssueType.AUDIO,
    IssueType.SUBTITLES,
    IssueType.OTHER,
  ],
  [MediaType.TV]: [
    IssueType.VIDEO,
    IssueType.AUDIO,
    IssueType.SUBTITLES,
    IssueType.OTHER,
  ],
  [MediaType.MUSIC]: [
    IssueType.AUDIO,
    IssueType.WRONG_CONTENT,
    IssueType.MISSING_CONTENT,
    IssueType.OTHER,
  ],
  [MediaType.BOOK]: [
    IssueType.WRONG_CONTENT,
    IssueType.MISSING_CONTENT,
    IssueType.AUDIO,
    IssueType.OTHER,
  ],
};
