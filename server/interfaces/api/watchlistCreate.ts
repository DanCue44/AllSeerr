import { FollowType, MediaType } from '@server/constants/media';
import { requireMediaListId, watchlistIds } from '@server/lib/mediaListKeys';
import { z } from 'zod';

export const watchlistCreate = z
  .object({
    ratingKey: z.coerce.string().optional(),
    ...watchlistIds,
    // Artists and authors are followed through the watchlist
    mediaType: z.union([z.nativeEnum(MediaType), z.nativeEnum(FollowType)]),
    title: z.coerce.string().optional(),
  })
  .superRefine(requireMediaListId);
