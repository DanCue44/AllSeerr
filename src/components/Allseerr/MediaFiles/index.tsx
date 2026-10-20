import { Card } from '@app/components/Allseerr/Title';
import defineMessages from '@app/utils/defineMessages';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type {
  MediaFileInfo,
  MediaFilesResponse,
} from '@server/interfaces/api/mediaInterfaces';
import { groupBy } from 'lodash';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Allseerr.MediaFiles', {
  fileinformation: 'File information',
  size: 'Size',
  quality: 'Quality',
  video: 'Video',
  resolution: 'Resolution',
  bitrate: 'Bitrate',
  audio: 'Audio',
  audiolanguages: 'Audio languages',
  embeddedsubs: 'Embedded subs',
  runtime: 'Runtime',
  added: 'Added',
  releasegroup: 'Release group',
  edition: 'Edition',
  path: 'Path',
  season: 'Season {seasonNumber}',
  episodefiles:
    '{count, plural, one {# episode file} other {# episode files}} · {size}',
  radarr: 'Radarr',
  radarr4k: '4K Radarr',
  sonarr: 'Sonarr',
  sonarr4k: '4K Sonarr',
  showdetails: 'Show details',
  hidedetails: 'Hide details',
  summary: '{count, plural, one {# file} other {# files}} · {size}',
});

export const formatBytes = (bytes: number): string => {
  if (!bytes) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
};

const formatChannels = (channels?: number): string | undefined => {
  if (!channels) {
    return undefined;
  }
  // Newer Radarr and Sonarr report 5.1 directly, older ones report 6
  if (!Number.isInteger(channels)) return String(channels);
  if (channels === 6) return '5.1';
  if (channels === 8) return '7.1';
  if (channels === 2) return 'Stereo';
  if (channels === 1) return 'Mono';
  return `${channels} ch`;
};

const Tile = ({ label, value }: { label: string; value?: string }) =>
  value ? (
    <div className="rounded-[14px] bg-as-tile px-3.5 py-3">
      <div className="text-xs text-as-ink-faint">{label}</div>
      <div className="mt-1 break-words font-bold text-as-ink">{value}</div>
    </div>
  ) : null;

const FileHeader = ({
  file,
  service,
}: {
  file: MediaFileInfo;
  service: string;
}) => (
  <div className="flex items-center gap-3">
    <span className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-as-accent font-serif text-[15px] font-extrabold text-as-ground">
      i
    </span>
    <span className="min-w-0 break-all font-mono text-[13px] text-as-ink">
      {file.fileName}
    </span>
    <span className="ml-auto flex-none rounded-full bg-as-tile px-2.5 py-[5px] text-xs text-as-ink-muted">
      {service}
    </span>
  </div>
);

const FileTiles = ({ file }: { file: MediaFileInfo }) => {
  const intl = useIntl();
  const info = file.mediaInfo;

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label={intl.formatMessage(messages.size)}
          value={formatBytes(file.size)}
        />
        <Tile
          label={intl.formatMessage(messages.quality)}
          value={file.quality}
        />
        <Tile
          label={intl.formatMessage(messages.video)}
          value={
            [info?.videoCodec, info?.videoDynamicRange]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />
        <Tile
          label={intl.formatMessage(messages.resolution)}
          value={info?.resolution}
        />
        <Tile
          label={intl.formatMessage(messages.bitrate)}
          value={
            info?.videoBitrate
              ? `${Math.round(info.videoBitrate / 1_000_000)} Mbps`
              : info?.videoBitDepth
                ? `${info.videoBitDepth}-bit`
                : undefined
          }
        />
        <Tile
          label={intl.formatMessage(messages.audio)}
          value={
            [info?.audioCodec, formatChannels(info?.audioChannels)]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        <Tile
          label={intl.formatMessage(messages.audiolanguages)}
          value={
            info?.audioLanguages?.length
              ? info.audioLanguages.join(', ')
              : file.languages.join(', ') || undefined
          }
        />
        <Tile
          label={intl.formatMessage(messages.embeddedsubs)}
          value={
            info?.subtitles?.length ? info.subtitles.join(', ') : undefined
          }
        />
        <Tile
          label={intl.formatMessage(messages.runtime)}
          value={info?.runTime}
        />
        <Tile
          label={intl.formatMessage(messages.added)}
          value={
            file.dateAdded
              ? intl.formatDate(file.dateAdded, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : undefined
          }
        />
        <Tile
          label={intl.formatMessage(messages.releasegroup)}
          value={file.releaseGroup}
        />
        <Tile
          label={intl.formatMessage(messages.edition)}
          value={file.edition}
        />
      </div>
      {file.path && (
        <div className="break-all font-mono text-xs text-as-ink-faint">
          {file.path}
        </div>
      )}
    </>
  );
};

interface FileInfoCardProps {
  mediaId: number;
  mediaType: 'movie' | 'tv';
}

/**
 * What Radarr or Sonarr has on disk for a title: size, quality, video and
 * audio details, embedded subtitles and so on.
 */
const FileInfoCard = ({ mediaId, mediaType }: FileInfoCardProps) => {
  const intl = useIntl();
  const [openSeason, setOpenSeason] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { data } = useSWR<MediaFilesResponse>(
    `/api/v1/media/${mediaId}/files`,
    {
      shouldRetryOnError: false,
    }
  );

  const sets = [
    {
      key: 'hd',
      files: data?.files ?? [],
      service: intl.formatMessage(
        mediaType === 'movie' ? messages.radarr : messages.sonarr
      ),
    },
    {
      key: '4k',
      files: data?.files4k ?? [],
      service: intl.formatMessage(
        mediaType === 'movie' ? messages.radarr4k : messages.sonarr4k
      ),
    },
  ].filter((set) => set.files.length > 0);

  if (!sets.length) {
    return null;
  }

  const allFiles = sets.flatMap((set) => set.files);
  const totalSize = allFiles.reduce((total, file) => total + file.size, 0);
  const firstMovieFile = mediaType === 'movie' ? sets[0].files[0] : undefined;

  return (
    <Card
      title={intl.formatMessage(messages.fileinformation)}
      action={
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-semibold text-as-accent transition hover:text-as-accent-soft"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {intl.formatMessage(
            expanded ? messages.hidedetails : messages.showdetails
          )}
          <ChevronDownIcon
            className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      }
    >
      {!expanded ? (
        firstMovieFile ? (
          <button
            type="button"
            className="flex flex-col gap-2 text-left"
            onClick={() => setExpanded(true)}
          >
            <FileHeader file={firstMovieFile} service={sets[0].service} />
            <span className="pl-[42px] text-[13px] text-as-ink-faint">
              {[
                formatBytes(firstMovieFile.size),
                firstMovieFile.quality,
                firstMovieFile.mediaInfo?.videoDynamicRange,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        ) : (
          <span className="text-[13px] text-as-ink-faint">
            {intl.formatMessage(messages.summary, {
              count: allFiles.length,
              size: formatBytes(totalSize),
            })}
          </span>
        )
      ) : mediaType === 'movie' ? (
        sets.map((set) =>
          set.files.map((file) => (
            <div
              key={`file-${set.key}-${file.id}`}
              className="flex flex-col gap-3.5"
            >
              <FileHeader file={file} service={set.service} />
              <FileTiles file={file} />
            </div>
          ))
        )
      ) : (
        sets.map((set) =>
          Object.entries(groupBy(set.files, 'seasonNumber')).map(
            ([seasonNumber, files]) => {
              const key = `${set.key}-${seasonNumber}`;
              const isOpen = openSeason === key;

              return (
                <div
                  key={`files-${key}`}
                  className="overflow-hidden rounded-2xl bg-as-tile"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setOpenSeason(isOpen ? null : key)}
                  >
                    <span className="font-semibold text-as-ink">
                      {intl.formatMessage(messages.season, {
                        seasonNumber: Number(seasonNumber),
                      })}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-as-ink-faint">
                      {set.service} ·{' '}
                      {intl.formatMessage(messages.episodefiles, {
                        count: files.length,
                        size: formatBytes(
                          files.reduce((total, file) => total + file.size, 0)
                        ),
                      })}
                      <ChevronDownIcon
                        className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-5 border-t border-as-line bg-as-surface/40 p-4">
                      {files
                        .slice()
                        .sort(
                          (a, b) =>
                            (a.episodeNumbers?.[0] ?? 0) -
                            (b.episodeNumbers?.[0] ?? 0)
                        )
                        .map((file) => (
                          <div
                            key={`file-${key}-${file.id}`}
                            className="flex flex-col gap-3"
                          >
                            <FileHeader file={file} service={set.service} />
                            <FileTiles file={file} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            }
          )
        )
      )}
    </Card>
  );
};

export default FileInfoCard;
