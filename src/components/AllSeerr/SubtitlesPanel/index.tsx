import { Card } from '@app/components/AllSeerr/Title';
import { statusTone } from '@app/components/AllSeerr/Title/styles';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type {
  EpisodeSubtitleStatus,
  MediaSubtitlesResponse,
  SubtitleLanguage,
  SubtitleRequestBody,
  SubtitleStatus,
} from '@server/interfaces/api/subtitleInterfaces';
import axios from 'axios';
import { groupBy } from 'lodash';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AllSeerr.SubtitlesPanel', {
  subtitles: 'Subtitles',
  wanted: 'Wanted: {languages} · via Bazarr',
  missing: 'Missing',
  embedded: 'Embedded',
  forced: 'Forced',
  hi: 'HI',
  search: 'Search',
  searching: 'Searching…',
  requestlanguage: 'Request a language',
  addlanguage: '+ Request a language',
  cancel: 'Cancel',
  request: 'Request',
  nosubtitles: 'No subtitles yet.',
  season: 'Season {seasonNumber}',
  seasonsummary:
    '{missing, plural, =0 {All wanted subtitles found} one {# episode missing subtitles} other {# episodes missing subtitles}}',
  searchStarted:
    'Searching for {language} subtitles. They will show up here once downloaded.',
  searchError: 'Something went wrong while searching for subtitles.',
});

const languageLabel = (language: SubtitleLanguage) =>
  [language.name, language.forced ? 'forced' : '', language.hi ? 'HI' : '']
    .filter(Boolean)
    .join(' ');

interface StatusChipsProps {
  status: SubtitleStatus;
  canRequest: boolean;
  onSearch: (language: SubtitleLanguage) => void;
  searching: string | null;
}

const StatusChips = ({
  status,
  canRequest,
  onSearch,
  searching,
}: StatusChipsProps) => {
  const intl = useIntl();

  if (!status.subtitles.length && !status.missing.length) {
    return (
      <span className="text-sm text-as-ink-faint">
        {intl.formatMessage(messages.nosubtitles)}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status.subtitles.map((track, i) => (
        <span
          key={`track-${track.code}-${i}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-[9px] text-sm font-semibold ${statusTone.ok}`}
          title={track.fileName}
        >
          {track.name}
          {track.forced && (
            <span className="opacity-80">
              {intl.formatMessage(messages.forced)}
            </span>
          )}
          {track.hi && (
            <span className="opacity-80">
              {intl.formatMessage(messages.hi)}
            </span>
          )}
          {track.embedded && (
            <span className="opacity-70">
              · {intl.formatMessage(messages.embedded)}
            </span>
          )}
        </span>
      ))}
      {status.missing.map((language) => {
        const key = `${language.code}-${language.forced}-${language.hi}`;

        return (
          <span
            key={`missing-${key}`}
            className={`inline-flex items-center gap-2 rounded-full py-[7px] pl-3.5 pr-1.5 text-sm font-semibold ${statusTone.bad}`}
          >
            {languageLabel(language)} · {intl.formatMessage(messages.missing)}
            {canRequest && (
              <button
                type="button"
                className="rounded-full bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-wide transition hover:bg-black/30 disabled:opacity-50"
                onClick={() => onSearch(language)}
                disabled={searching === key}
              >
                {intl.formatMessage(
                  searching === key ? messages.searching : messages.search
                )}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
};

interface SubtitlesPanelProps {
  mediaId: number;
  mediaType: 'movie' | 'tv';
}

/**
 * Subtitles Bazarr has downloaded for a title, the ones still missing, and
 * a way to search again or ask for another language.
 */
const SubtitlesPanel = ({ mediaId, mediaType }: SubtitlesPanelProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [searching, setSearching] = useState<string | null>(null);
  const [requestLanguage, setRequestLanguage] = useState('');
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const { data, error, mutate } = useSWR<MediaSubtitlesResponse>(
    `/api/v1/media/${mediaId}/subtitles`,
    { shouldRetryOnError: false }
  );

  const canRequest = hasPermission(Permission.REQUEST);

  // Bazarr is optional; without it there is nothing to show
  if (error || !data) {
    return null;
  }

  const search = async (
    language: SubtitleLanguage | { code: string; name: string },
    episode?: EpisodeSubtitleStatus
  ) => {
    const forced = 'forced' in language ? language.forced : false;
    const hi = 'hi' in language ? language.hi : false;
    const key = `${episode ? `${episode.seasonNumber}x${episode.episodeNumber}-` : ''}${language.code}-${forced}-${hi}`;
    setSearching(key);

    try {
      const body: SubtitleRequestBody = {
        language: language.code,
        forced,
        hi,
        seasonNumber: episode?.seasonNumber,
        episodeNumber: episode?.episodeNumber,
      };
      await axios.post(`/api/v1/media/${mediaId}/subtitles`, body);
      addToast(
        intl.formatMessage(messages.searchStarted, { language: language.name }),
        { appearance: 'success', autoDismiss: true }
      );
      setTimeout(() => mutate(), 15000);
    } catch {
      addToast(intl.formatMessage(messages.searchError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setSearching(null);
    }
  };

  const seasons = groupBy(data.episodes ?? [], 'seasonNumber');

  return (
    <Card title={intl.formatMessage(messages.subtitles)}>
      {mediaType === 'movie' && data.movie && (
        <StatusChips
          status={data.movie}
          canRequest={canRequest}
          onSearch={(language) => search(language)}
          searching={searching}
        />
      )}

      {mediaType === 'tv' && (
        <div className="space-y-2">
          {Object.entries(seasons).map(([seasonNumber, episodes]) => {
            const season = Number(seasonNumber);
            const missingCount = episodes.filter(
              (episode) => episode.missing.length > 0
            ).length;
            const isOpen = openSeason === season;

            return (
              <div
                key={`subtitle-season-${season}`}
                className="overflow-hidden rounded-2xl bg-as-tile"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() => setOpenSeason(isOpen ? null : season)}
                >
                  <span className="font-semibold text-as-ink">
                    {intl.formatMessage(messages.season, {
                      seasonNumber: season,
                    })}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-as-ink-faint">
                    <span
                      className={missingCount ? 'text-as-warn' : 'text-as-ok'}
                    >
                      {intl.formatMessage(messages.seasonsummary, {
                        missing: missingCount,
                      })}
                    </span>
                    <ChevronDownIcon
                      className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>
                {isOpen && (
                  <ul className="divide-y divide-as-line/60 border-t border-as-line">
                    {episodes.map((episode) => (
                      <li
                        key={`subtitle-episode-${season}-${episode.episodeNumber}`}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0 truncate text-sm text-as-ink-soft">
                          <span className="mr-2 font-mono text-xs text-as-ink-faint">
                            E{String(episode.episodeNumber).padStart(2, '0')}
                          </span>
                          {episode.title}
                        </span>
                        <StatusChips
                          status={episode}
                          canRequest={canRequest}
                          onSearch={(language) => search(language, episode)}
                          searching={
                            searching?.startsWith(
                              `${episode.seasonNumber}x${episode.episodeNumber}-`
                            )
                              ? searching.split('-').slice(1).join('-')
                              : null
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {data.wanted.length > 0 && (
          <span className="text-[13px] text-as-ink-faint">
            {intl.formatMessage(messages.wanted, {
              languages: data.wanted.map(languageLabel).join(', '),
            })}
          </span>
        )}
        {canRequest &&
          mediaType === 'movie' &&
          data.available.length > 0 &&
          (showRequest ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={requestLanguage}
                onChange={(e) => setRequestLanguage(e.target.value)}
                className="h-10 rounded-full border border-as-line bg-as-tile px-4 text-sm text-as-ink"
                aria-label={intl.formatMessage(messages.requestlanguage)}
              >
                <option value="">
                  {intl.formatMessage(messages.requestlanguage)}
                </option>
                {data.available.map((language) => (
                  <option
                    key={`request-${language.code}`}
                    value={language.code}
                  >
                    {language.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="h-10 rounded-full bg-as-accent px-4 text-sm font-bold text-as-ground transition hover:brightness-110 disabled:opacity-50"
                disabled={!requestLanguage || searching !== null}
                onClick={() => {
                  const language = data.available.find(
                    (l) => l.code === requestLanguage
                  );
                  if (language) {
                    search(language);
                    setRequestLanguage('');
                    setShowRequest(false);
                  }
                }}
              >
                {intl.formatMessage(messages.request)}
              </button>
              <button
                type="button"
                className="h-10 px-2 text-sm text-as-ink-faint hover:text-as-ink"
                onClick={() => setShowRequest(false)}
              >
                {intl.formatMessage(messages.cancel)}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ml-auto h-10 rounded-full border border-dashed border-as-accent px-4 text-sm font-semibold text-as-accent-soft transition hover:bg-as-accent/10"
              onClick={() => setShowRequest(true)}
            >
              {intl.formatMessage(messages.addlanguage)}
            </button>
          ))}
      </div>
    </Card>
  );
};

export default SubtitlesPanel;
