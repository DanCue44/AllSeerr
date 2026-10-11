import type { BookFormatChoice } from '@server/constants/media';
import type RemovalRequest from '@server/entity/RemovalRequest';
import type { PaginatedResponse } from './common';

export interface RemovalRequestResultsResponse extends PaginatedResponse {
  results: RemovalRequest[];
}

export interface RemovalRequestBody {
  mediaId: number;
  is4k?: boolean;
  reason?: string;
  bookFormat?: BookFormatChoice;
}
