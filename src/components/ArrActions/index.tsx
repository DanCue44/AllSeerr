import ReleasePicker from '@app/components/ArrActions/ReleasePicker';
import { targetQuery } from '@app/components/ArrActions/releaseList';
import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import {
  ArrowPathRoundedSquareIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { isTalearrService } from '@server/constants/bookService';
import type { BookFormat } from '@server/constants/media';
import type {
  ArrActionAvailability,
  ArrActionResponse,
  ArrItemResponse,
  ArrReplaceBody,
  ArrReplaceResponse,
  ArrTarget,
} from '@server/interfaces/api/arrActionInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.ArrActions', {
  releases: 'Releases',
  releasesin: 'Releases in {service}',
  searchagain: 'Search Again',
  searchmanually: 'Search Manually',
  replacefile: 'Replace File',
  standard: 'Standard',
  fourk: '4K',
  version: 'Version',
  format: 'Format',
  season: 'Season',
  episode: 'Episode',
  entireseries: 'Entire series',
  entireseason: 'Entire season',
  seasonnumber: 'Season {seasonNumber}',
  episodeoption: 'E{episodeNumber} {title}',
  episodenofile: 'E{episodeNumber} {title} (no file)',
  checking: 'Checking {service}…',
  lookupfailed: 'Could not reach {service}.',
  searchstarted: '{service} is searching for {target}.',
  searcherror: 'Could not start the search: {message}',
  resolveafter: 'Resolve the issue after grabbing',
  replacetitle: 'Replace File',
  replacedescription:
    'This deletes the current file of {target} in {service}, so a different release can be downloaded.',
  blocklistcurrent: 'And blocklist the current release',
  blocklisthint:
    'The release is marked as failed in {service}, so it is not grabbed again. With Redownload Failed on in {service}, it may also start a search by itself.',
  afterreplace: 'Then',
  searchautomatically: 'Search automatically',
  pickrelease: 'Pick a release myself',
  replacing: 'Replacing…',
  replaced:
    'Replaced the file of {target}.{blocklisted, plural, =0 {} one { Blocklisted # release.} other { Blocklisted # releases.}}',
  replacedsearching:
    'Replaced the file of {target}.{blocklisted, plural, =0 {} one { Blocklisted # release.} other { Blocklisted # releases.}} {service} is searching for a new one.',
  replaceerror: 'Could not replace the file: {message}',
  issueresolved: 'The issue was resolved.',
});

type ArrMediaType = 'movie' | 'tv' | 'music' | 'book';

interface ArrActionsProps {
  mediaId: number;
  mediaType: ArrMediaType;
  // Only look the item up while it is on screen
  active?: boolean;
  allow4k?: boolean;
  initialTarget?: ArrTarget;
  // The issue the actions are taken from
  issueId?: number;
  // panel matches the manage panel sections, card stands alone on a page
  layout?: 'panel' | 'card';
  onChange?: () => void;
}

const errorMessage = (e: unknown): string =>
  (axios.isAxiosError(e) &&
    (e.response?.data as { message?: string } | undefined)?.message) ||
  (e as Error)?.message ||
  '';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Search again, search manually and replace the file of a movie, season,
 * episode, album or book format in its arr, for admins
 */
const ArrActions = ({
  mediaId,
  mediaType,
  active = true,
  allow4k = false,
  initialTarget,
  issueId,
  layout = 'panel',
  onChange,
}: ArrActionsProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const { currentSettings } = useSettings();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const [is4k, setIs4k] = useState(!!initialTarget?.is4k);
  const [seasonNumber, setSeasonNumber] = useState(initialTarget?.seasonNumber);
  const [episodeNumber, setEpisodeNumber] = useState(
    initialTarget?.episodeNumber
  );
  const [bookFormat, setBookFormat] = useState<BookFormat>(
    initialTarget?.bookFormat ?? 'ebook'
  );
  const [resolveIssue, setResolveIssue] = useState(false);
  const [busy, setBusy] = useState<'search' | 'replace' | null>(null);
  const [picker, setPicker] = useState<{ replaced: boolean } | null>(null);
  const [showReplace, setShowReplace] = useState(false);
  const [blocklist, setBlocklist] = useState(true);
  const [afterReplace, setAfterReplace] =
    useState<ArrReplaceBody['search']>('automatic');

  const canManage = hasPermission(Permission.MANAGE_REQUESTS);
  const canResolve = !!issueId && hasPermission(Permission.MANAGE_ISSUES);

  const target: ArrTarget = {
    ...(allow4k && is4k && { is4k: true }),
    ...(mediaType === 'tv' && {
      seasonNumber,
      episodeNumber: seasonNumber !== undefined ? episodeNumber : undefined,
    }),
    ...(mediaType === 'book' && { bookFormat }),
  };
  const query = targetQuery(target);

  const {
    data: info,
    error,
    mutate,
  } = useSWR<ArrItemResponse>(
    active && canManage ? `/api/v1/media/${mediaId}/arr${query}` : null,
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  if (!canManage) {
    return null;
  }

  const serviceName =
    info?.serviceName ??
    (mediaType === 'movie'
      ? 'Radarr'
      : mediaType === 'tv'
        ? 'Sonarr'
        : mediaType === 'music'
          ? 'Lidarr'
          : isTalearrService(currentSettings.bookService)
            ? 'TaleArr'
            : 'Chaptarr');

  const targetName = (() => {
    if (mediaType === 'tv') {
      if (seasonNumber === undefined) {
        return info?.title ?? intl.formatMessage(messages.entireseries);
      }
      return episodeNumber !== undefined
        ? `S${pad(seasonNumber)}E${pad(episodeNumber)}`
        : intl.formatMessage(messages.seasonnumber, { seasonNumber });
    }
    if (mediaType === 'book') {
      return `${info?.title ?? ''} (${intl.formatMessage(
        bookFormat === 'audiobook'
          ? globalMessages.audiobook
          : globalMessages.ebook
      )})`.trim();
    }
    return info?.title ?? '';
  })();

  const seasons = [
    ...new Set((info?.episodes ?? []).map((e) => e.seasonNumber)),
  ].sort((a, b) => a - b);
  const seasonEpisodes = (info?.episodes ?? []).filter(
    (e) => e.seasonNumber === seasonNumber
  );

  const finish = () => {
    mutate();
    onChange?.();
  };

  const searchAgain = async () => {
    setBusy('search');
    try {
      await axios.post<ArrActionResponse>(
        `/api/v1/media/${mediaId}/arr/search`,
        target
      );
      addToast(
        intl.formatMessage(messages.searchstarted, {
          service: serviceName,
          target: targetName,
        }),
        { appearance: 'success', autoDismiss: true }
      );
      finish();
    } catch (e) {
      addToast(
        intl.formatMessage(messages.searcherror, { message: errorMessage(e) }),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setBusy(null);
    }
  };

  const replaceFile = async () => {
    setBusy('replace');
    try {
      const body: ArrReplaceBody = {
        ...target,
        blocklist,
        search: afterReplace,
        ...(issueId && { issueId, resolveIssue: canResolve && resolveIssue }),
      };
      const { data } = await axios.post<ArrReplaceResponse>(
        `/api/v1/media/${mediaId}/arr/replace`,
        body
      );
      setShowReplace(false);
      addToast(
        [
          intl.formatMessage(
            data.searched ? messages.replacedsearching : messages.replaced,
            {
              target: targetName,
              service: serviceName,
              blocklisted: data.blocklisted.length,
            }
          ),
          data.issueResolved ? intl.formatMessage(messages.issueresolved) : '',
        ]
          .filter(Boolean)
          .join(' '),
        { appearance: 'success', autoDismiss: true }
      );
      finish();
      if (afterReplace === 'interactive') {
        setPicker({ replaced: true });
      }
    } catch (e) {
      addToast(
        intl.formatMessage(messages.replaceerror, { message: errorMessage(e) }),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setBusy(null);
    }
  };

  const faint = ambient ? 'text-as-ink-faint' : 'text-gray-400';
  const labelClass = `mb-1 block text-xs font-semibold uppercase tracking-wide ${faint}`;
  const selectClass = ambient
    ? 'w-full rounded-full border border-as-line bg-as-tile px-4 text-sm text-as-ink'
    : 'w-full text-sm';

  const segmented = <T extends string>(
    label: string,
    value: T,
    options: { value: T; label: string }[],
    onSelect: (value: T) => void
  ) => (
    <div>
      <span className={labelClass}>{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className={`flex p-1 ${
          ambient
            ? 'rounded-full bg-as-tile'
            : 'rounded-md border border-gray-700 bg-gray-900/40'
        }`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onSelect(option.value)}
            className={`flex-1 px-3 py-1.5 text-sm font-semibold transition ${
              ambient ? 'rounded-full' : 'rounded'
            } ${
              value === option.value
                ? ambient
                  ? 'bg-as-accent text-as-ground'
                  : 'bg-indigo-600 text-white'
                : ambient
                  ? 'text-as-ink-soft hover:text-as-ink'
                  : 'text-gray-300 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  const actionButton = (
    action: keyof ArrItemResponse['actions'],
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    buttonType: 'default' | 'warning' = 'default'
  ) => {
    const availability: ArrActionAvailability | undefined =
      info?.actions[action];

    return (
      <Button
        buttonType={buttonType}
        className="w-full"
        disabled={!availability?.available || !!busy}
        onClick={onClick}
        title={availability?.reason}
      >
        {icon}
        <span>{label}</span>
      </Button>
    );
  };

  // One reason for every action, such as the item missing from the arr,
  // is shown once
  const reasons = info
    ? [
        ...new Set(
          Object.values(info.actions)
            .map((action) => action.reason)
            .filter((reason): reason is string => !!reason)
        ),
      ]
    : [];

  const controls = (
    <div className="space-y-3">
      {(allow4k || mediaType === 'book') && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {allow4k &&
            segmented(
              intl.formatMessage(messages.version),
              is4k ? '4k' : 'standard',
              [
                {
                  value: 'standard',
                  label: intl.formatMessage(messages.standard),
                },
                { value: '4k', label: intl.formatMessage(messages.fourk) },
              ],
              (value) => setIs4k(value === '4k')
            )}
          {mediaType === 'book' &&
            segmented(
              intl.formatMessage(messages.format),
              bookFormat,
              [
                {
                  value: 'ebook',
                  label: intl.formatMessage(globalMessages.ebook),
                },
                {
                  value: 'audiobook',
                  label: intl.formatMessage(globalMessages.audiobook),
                },
              ],
              setBookFormat
            )}
        </div>
      )}
      {mediaType === 'tv' && info?.inService !== false && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>
              {intl.formatMessage(messages.season)}
            </span>
            <select
              className={selectClass}
              value={seasonNumber ?? ''}
              onChange={(e) => {
                setSeasonNumber(
                  e.target.value === '' ? undefined : Number(e.target.value)
                );
                setEpisodeNumber(undefined);
              }}
            >
              <option value="">
                {intl.formatMessage(messages.entireseries)}
              </option>
              {/* Keep the issue's season listed while the episodes load */}
              {(seasonNumber !== undefined && !seasons.includes(seasonNumber)
                ? [seasonNumber, ...seasons]
                : seasons
              ).map((season) => (
                <option key={`arr-season-${season}`} value={season}>
                  {season === 0
                    ? intl.formatMessage(globalMessages.specials)
                    : intl.formatMessage(messages.seasonnumber, {
                        seasonNumber: season,
                      })}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>
              {intl.formatMessage(messages.episode)}
            </span>
            <select
              className={selectClass}
              value={episodeNumber ?? ''}
              disabled={seasonNumber === undefined}
              onChange={(e) =>
                setEpisodeNumber(
                  e.target.value === '' ? undefined : Number(e.target.value)
                )
              }
            >
              <option value="">
                {intl.formatMessage(messages.entireseason)}
              </option>
              {episodeNumber !== undefined &&
                !seasonEpisodes.some(
                  (e) => e.episodeNumber === episodeNumber
                ) && (
                  <option value={episodeNumber}>
                    {`E${pad(episodeNumber)}`}
                  </option>
                )}
              {seasonEpisodes.map((episode) => (
                <option
                  key={`arr-episode-${episode.seasonNumber}-${episode.episodeNumber}`}
                  value={episode.episodeNumber}
                >
                  {intl.formatMessage(
                    episode.hasFile
                      ? messages.episodeoption
                      : messages.episodenofile,
                    {
                      episodeNumber: pad(episode.episodeNumber),
                      title: episode.title,
                    }
                  )}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!info && !error && (
        <div className={`text-sm ${faint}`}>
          {intl.formatMessage(messages.checking, { service: serviceName })}
        </div>
      )}
      {error && (
        <div className={`text-sm ${ambient ? 'text-as-bad' : 'text-red-400'}`}>
          {errorMessage(error) ||
            intl.formatMessage(messages.lookupfailed, { service: serviceName })}
        </div>
      )}

      {info && (
        <>
          <div
            className={
              layout === 'card'
                ? 'grid grid-cols-1 gap-2 sm:grid-cols-3'
                : 'space-y-2'
            }
          >
            {actionButton(
              'search',
              intl.formatMessage(messages.searchagain),
              <MagnifyingGlassIcon />,
              searchAgain
            )}
            {actionButton(
              'interactive',
              intl.formatMessage(messages.searchmanually),
              <ListBulletIcon />,
              () => setPicker({ replaced: false })
            )}
            {actionButton(
              'replace',
              intl.formatMessage(messages.replacefile),
              <ArrowPathRoundedSquareIcon />,
              () => setShowReplace(true),
              'warning'
            )}
          </div>
          {reasons.length > 0 && (
            <ul className={`space-y-0.5 text-xs ${faint}`}>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {canResolve && (
            <label
              className={`flex items-center gap-2 text-sm ${
                ambient ? 'text-as-ink-soft' : 'text-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={resolveIssue}
                onChange={(e) => setResolveIssue(e.target.checked)}
              />
              {intl.formatMessage(messages.resolveafter)}
            </label>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <Transition
        as="div"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        show={!!picker}
      >
        {picker && (
          <ReleasePicker
            mediaId={mediaId}
            target={target}
            serviceName={serviceName}
            subTitle={targetName}
            issueId={issueId}
            resolveIssue={canResolve && resolveIssue}
            replaced={picker.replaced}
            onClose={() => setPicker(null)}
            onGrabbed={() => {
              setPicker(null);
              finish();
            }}
          />
        )}
      </Transition>
      <Transition
        as="div"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        show={showReplace}
      >
        <Modal
          title={intl.formatMessage(messages.replacetitle)}
          subTitle={targetName}
          onCancel={() => setShowReplace(false)}
          onOk={() => replaceFile()}
          okText={intl.formatMessage(
            busy === 'replace' ? messages.replacing : messages.replacefile
          )}
          okButtonType="danger"
          okDisabled={busy === 'replace'}
          backgroundClickable={busy !== 'replace'}
        >
          <div className="space-y-4">
            <p>
              {intl.formatMessage(messages.replacedescription, {
                target: targetName,
                service: serviceName,
              })}
            </p>
            <div className="flex items-start gap-2">
              <input
                id={`arr-blocklist-${mediaId}`}
                type="checkbox"
                className="mt-0.5"
                checked={blocklist}
                onChange={(e) => setBlocklist(e.target.checked)}
              />
              <label htmlFor={`arr-blocklist-${mediaId}`}>
                <span
                  className={`block font-semibold ${
                    ambient ? 'text-as-ink' : 'text-white'
                  }`}
                >
                  {intl.formatMessage(messages.blocklistcurrent)}
                </span>
                <span className={`block text-xs ${faint}`}>
                  {intl.formatMessage(messages.blocklisthint, {
                    service: serviceName,
                  })}
                </span>
              </label>
            </div>
            <fieldset>
              <legend className={labelClass}>
                {intl.formatMessage(messages.afterreplace)}
              </legend>
              <div className="space-y-2">
                {(
                  [
                    ['automatic', messages.searchautomatically],
                    ['interactive', messages.pickrelease],
                  ] as const
                ).map(([value, message]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      className={ambient ? 'accent-as-accent' : undefined}
                      name={`arr-replace-${mediaId}`}
                      checked={afterReplace === value}
                      onChange={() => setAfterReplace(value)}
                    />
                    <span>{intl.formatMessage(message)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Modal>
      </Transition>

      {layout === 'card' ? (
        <div
          className={
            ambient
              ? 'rounded-[22px] bg-as-surface px-6 py-[22px]'
              : 'rounded-md border border-gray-700 bg-gray-800/60 p-4'
          }
        >
          <div
            className={`mb-4 ${
              ambient
                ? 'font-display text-lg font-medium text-as-ink lg:text-xl'
                : 'font-semibold text-gray-100 lg:text-xl'
            }`}
          >
            {intl.formatMessage(messages.releasesin, { service: serviceName })}
          </div>
          {controls}
        </div>
      ) : (
        <div>
          <h3 className="mb-2 text-xl font-bold">
            {intl.formatMessage(messages.releases)}
          </h3>
          {controls}
        </div>
      )}
    </>
  );
};

export default ArrActions;
