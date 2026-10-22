import CachedImage from '@app/components/Common/CachedImage';
import FormatIcon, { useFormatLabel } from '@app/components/Common/FormatIcon';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import TitleCard from '@app/components/TitleCard';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { ChatBubbleOvalLeftIcon } from '@heroicons/react/24/solid';
import type { ComicKind } from '@server/constants/media';
import { MediaStatus } from '@server/constants/media';
import type { ComicDetails } from '@server/models/Comic';
import Link from 'next/link';
import { useInView } from 'react-intersection-observer';
import useSWR from 'swr';

interface ComicTitleCardProps {
  id: string;
  kind: ComicKind;
  title: string;
  // The authors, or the year when there are none
  subtitle?: string;
  year?: number;
  image?: string | null;
  status?: MediaStatus;
  canExpand?: boolean;
}

/**
 * Portrait card for comic and manga series, the comic counterpart of
 * BookTitleCard. Series are requested on their page.
 */
const ComicTitleCard = ({
  id,
  kind,
  title,
  subtitle,
  year,
  image,
  status,
  canExpand = false,
}: ComicTitleCardProps) => {
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const kindLabel = useFormatLabel(kind);
  const href = `/comic/${id}`;

  return (
    <div
      className={
        canExpand
          ? 'w-full'
          : ambient
            ? 'w-[150px] sm:w-[176px]'
            : 'w-36 sm:w-36 md:w-44'
      }
      data-testid="comic-title-card"
    >
      <Link
        href={href}
        className={`group relative block transform-gpu overflow-hidden bg-cover outline-none transition duration-300 ${
          ambient
            ? 'rounded-[8px_18px_18px_8px] bg-as-tile hover:scale-[1.03] hover:shadow-xl hover:shadow-black/40'
            : 'rounded-xl bg-gray-800 shadow ring-1 ring-gray-700 hover:scale-105 hover:shadow-lg hover:ring-gray-500'
        }`}
        style={{ paddingBottom: '150%' }}
      >
        <div className="absolute inset-0 h-full w-full overflow-hidden">
          {image ? (
            <CachedImage
              type="book"
              className="absolute inset-0 h-full w-full"
              alt=""
              src={image}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600">
              <ChatBubbleOvalLeftIcon className="h-1/2 w-1/2" />
            </div>
          )}
          <div className="absolute left-0 right-0 flex items-center justify-between p-2">
            {ambient ? (
              <FormatIcon
                format={kind}
                size="card"
                className="z-40 self-start"
              />
            ) : (
              <div className="pointer-events-none z-40 self-start rounded-full border border-rose-500 bg-rose-600/80 shadow-md">
                <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                  {kindLabel}
                </div>
              </div>
            )}
            {status && status !== MediaStatus.UNKNOWN && (
              <div className="pointer-events-none z-40 flex">
                <StatusBadgeMini status={status} shrink />
              </div>
            )}
          </div>
          {!ambient && (
            <div
              className="absolute inset-0 flex items-end opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
              style={{
                background:
                  'linear-gradient(180deg, rgb(var(--tw-gray-800, 45 55 72) / 0.4) 0%, rgb(var(--tw-gray-800, 45 55 72) / 0.9) 100%)',
              }}
            >
              <div className="px-2 pb-2 text-white">
                {year && <div className="text-sm font-medium">{year}</div>}
                <h1
                  className="whitespace-normal text-lg font-bold leading-tight"
                  style={{
                    WebkitLineClamp: 3,
                    display: '-webkit-box',
                    overflow: 'hidden',
                    WebkitBoxOrient: 'vertical',
                    wordBreak: 'break-word',
                  }}
                  data-testid="title-card-title"
                >
                  {title}
                </h1>
                {subtitle && <div className="truncate text-xs">{subtitle}</div>}
              </div>
            </div>
          )}
        </div>
      </Link>
      {ambient && (
        <Link href={href} className="mt-2.5 block">
          <div className="line-clamp-2 whitespace-normal break-words font-bold text-as-ink hover:underline">
            {title}
          </div>
          <div className="truncate text-[13px] text-as-ink-faint">
            {kindLabel}
            {subtitle ? ` · ${subtitle}` : year ? ` · ${year}` : ''}
          </div>
        </Link>
      )}
    </div>
  );
};

/**
 * Comic card for lists that only know the comic id, such as recently added
 */
export const ComicIdTitleCard = ({
  comicId,
  canExpand,
}: {
  comicId: string;
  canExpand?: boolean;
}) => {
  const { ref, inView } = useInView({ triggerOnce: true });
  const { data: comic, error } = useSWR<ComicDetails>(
    inView ? `/api/v1/comic/${comicId}` : null
  );

  if (!comic && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!comic) {
    return null;
  }

  return (
    <ComicTitleCard
      id={comic.id}
      kind={comic.kind}
      title={comic.title}
      subtitle={comic.authors}
      year={comic.year}
      image={comic.posterPath}
      status={comic.mediaInfo?.status}
      canExpand={canExpand}
    />
  );
};

export default ComicTitleCard;
