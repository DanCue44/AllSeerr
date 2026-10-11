import type { IssueType } from '@server/constants/issue';
import type { BookFormat } from '@server/constants/media';
import type Issue from '@server/entity/Issue';
import type { PaginatedResponse } from './common';

export interface IssueResultsResponse extends PaginatedResponse {
  results: Issue[];
}

export type IssueRequestBody = {
  message: string;
  mediaId: number;
  issueType: IssueType;
  problemSeason?: number;
  problemEpisode?: number;
  bookFormat?: BookFormat | null;
  userId?: number;
};
