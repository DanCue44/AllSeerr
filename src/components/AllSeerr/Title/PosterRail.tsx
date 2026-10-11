import { RailHeader } from '@app/components/AllSeerr/Title';
import CachedImage from '@app/components/Common/CachedImage';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import type { MovieResult, TvResult } from '@server/models/Search';
import Link from 'next/link';
import useSWR from 'swr';

interface PosterRailProps {
  title: string;
  url: string;
  linkUrl: string;
  seeAllLabel: string;
}

/**
 * A row of posters with the title and year under each, used for
 * recommendations and similar titles. Hidden when there is nothing to show.
 */
const PosterRail = ({ title, url, linkUrl, seeAllLabel }: PosterRailProps) => {
  const { data } = useSWR<{ results: (MovieResult | TvResult)[] }>(url);

  const items = (data?.results ?? []).filter(
    (item) => item.mediaType === 'movie' || item.mediaType === 'tv'
  );

  if (data && !items.length) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 pt-[34px]">
      <RailHeader title={title} href={linkUrl} seeAllLabel={seeAllLabel} />
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 lg:-mx-10 lg:px-10">
        {!data
          ? [...Array(6)].map((_, i) => (
              <div
                key={`poster-skeleton-${i}`}
                className="aspect-[2/3] w-[140px] flex-none animate-pulse rounded-2xl bg-as-tile sm:w-[180px]"
              />
            ))
          : items.slice(0, 20).map((item) => {
              const name = item.mediaType === 'movie' ? item.title : item.name;
              const date =
                item.mediaType === 'movie'
                  ? item.releaseDate
                  : item.firstAirDate;

              return (
                <Link
                  key={`poster-${item.mediaType}-${item.id}`}
                  href={`/${item.mediaType}/${item.id}`}
                  className="group w-[140px] flex-none sm:w-[180px]"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-as-tile ring-1 ring-transparent transition group-hover:ring-as-line-strong">
                    <CachedImage
                      type="tmdb"
                      src={
                        item.posterPath
                          ? `https://image.tmdb.org/t/p/w300_and_h450_face${item.posterPath}`
                          : '/images/seerr_poster_not_found.png'
                      }
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      fill
                    />
                    {item.mediaInfo?.status && (
                      <div className="absolute right-2 top-2">
                        <StatusBadgeMini status={item.mediaInfo.status} />
                      </div>
                    )}
                  </div>
                  <div className="mt-2.5 line-clamp-2 text-sm font-bold text-as-ink group-hover:underline">
                    {name}
                  </div>
                  {date && (
                    <div className="text-xs text-as-ink-faint">
                      {date.slice(0, 4)}
                    </div>
                  )}
                </Link>
              );
            })}
      </div>
    </section>
  );
};

export default PosterRail;
