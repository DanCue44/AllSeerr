import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import SlideCheckbox from '@app/components/Common/SlideCheckbox';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester from '@app/components/RequestModal/AdvancedRequester';
import {
  BulkItemRow,
  BulkLimitNotice,
  BulkQuotaNotice,
  GroupCheckbox,
  getBulkRequestToast,
  isOverQuota,
} from '@app/components/RequestModal/BulkRequest';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import type {
  BulkRequestResponse,
  DiscographyRequestBody,
} from '@server/interfaces/api/requestInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type { DiscographyType } from '@server/lib/catalogFilters';
import {
  DEFAULT_DISCOGRAPHY_TYPES,
  DISCOGRAPHY_TYPES,
  MAX_BULK_REQUEST_ITEMS,
  getBulkSkipReason,
  getDiscographyType,
} from '@server/lib/catalogFilters';
import { Permission } from '@server/lib/permissions';
import type { AlbumResult } from '@server/models/Search';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages(
  'components.RequestModal.DiscographyRequestModal',
  {
    requestdiscography: 'Request Discography',
    discographyby: 'All releases by {artist}',
    releasetypes: 'Release Types',
    typeAlbum: 'Albums',
    typeEP: 'EPs',
    typeSingle: 'Singles',
    typeLive: 'Live',
    typeCompilation: 'Compilations',
    typeSoundtrack: 'Soundtracks',
    typeRemix: 'Remixes',
    typeOther: 'Other',
    selectedcount: '{selected, number} of {total, number} selected',
    showalbums: 'Show {type}',
    hidealbums: 'Hide {type}',
    nothingtorequest:
      'Everything this artist released is already requested, available or blocklisted.',
    noreleases: 'MusicBrainz lists no releases for this artist.',
    truncated:
      'Showing {shown, number} of {total, number} releases. The rest are on MusicBrainz.',
    requestadmin: 'These requests will be approved automatically.',
    monitornewreleases: 'Monitor Future Releases',
    monitornewreleasesDescription:
      'Lidarr will also monitor and search for new albums by this artist.',
    requestalbums:
      'Request {count, plural, =0 {Albums} one {# Album} other {# Albums}}',
    requesterror: 'Something went wrong while submitting the request.',
  }
);

const typeMessages: Record<DiscographyType, keyof typeof messages> = {
  Album: 'typeAlbum',
  EP: 'typeEP',
  Single: 'typeSingle',
  Live: 'typeLive',
  Compilation: 'typeCompilation',
  Soundtrack: 'typeSoundtrack',
  Remix: 'typeRemix',
  Other: 'typeOther',
};

interface DiscographyResponse {
  artistId: string;
  artistName: string;
  releaseGroups: AlbumResult[];
  totalReleaseGroups: number;
}

interface DiscographyRequestModalProps {
  artistId: string;
  artistName?: string;
  backdrop?: string;
  onCancel?: () => void;
  onComplete?: () => void;
}

/**
 * Requests the albums of an artist in one go, chosen by release type and
 * one by one. Each album is its own request.
 */
const DiscographyRequestModal = ({
  artistId,
  artistName,
  backdrop,
  onCancel,
  onComplete,
}: DiscographyRequestModalProps) => {
  const intl = useIntl();
  const settings = useSettings();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [requestOverrides, setRequestOverrides] =
    useState<RequestOverrides | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<DiscographyType[]>([]);
  const [monitorNewReleases, setMonitorNewReleases] = useState(false);
  const { data, error } = useSWR<DiscographyResponse>(
    `/api/v1/artist/${artistId}/discography`,
    { revalidateOnMount: true, revalidateOnFocus: false }
  );
  const { data: quota } = useSWR<QuotaResponse>(
    user &&
      (!requestOverrides?.user?.id || hasPermission(Permission.MANAGE_USERS))
      ? `/api/v1/user/${requestOverrides?.user?.id ?? user.id}/quota`
      : null
  );

  const groups = useMemo(
    () =>
      DISCOGRAPHY_TYPES.map((type) => {
        const albums = (data?.releaseGroups ?? []).filter(
          (album) =>
            getDiscographyType(album.albumType, album.secondaryTypes) === type
        );

        return {
          type,
          albums,
          requestable: albums.filter(
            (album) => !getBulkSkipReason(album.mediaInfo?.status)
          ),
        };
      }).filter((group) => group.albums.length > 0),
    [data?.releaseGroups]
  );

  // Albums and EPs that can be requested start out selected, as many as a
  // single request can include
  useEffect(() => {
    setSelected(
      new Set(
        groups
          .filter((group) => DEFAULT_DISCOGRAPHY_TYPES.includes(group.type))
          .flatMap((group) => group.requestable.map((album) => album.id))
          .slice(0, MAX_BULK_REQUEST_ITEMS)
      )
    );
  }, [groups]);

  const toggleAlbum = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

  const toggleType = (albums: AlbumResult[]) =>
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = albums.every((album) => next.has(album.id));

      albums.forEach((album) =>
        allSelected ? next.delete(album.id) : next.add(album.id)
      );

      return next;
    });

  const toggleExpanded = (type: DiscographyType) =>
    setExpandedTypes((current) =>
      current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type]
    );

  const isManager = hasPermission(Permission.MANAGE_REQUESTS);
  // Monitoring new releases needs a Lidarr server
  const canMonitorNewReleases =
    isManager && settings.currentSettings.musicEnabled;
  const canUseAdvanced = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const hasAutoApprove = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.AUTO_APPROVE],
    { type: 'or' }
  );
  const count = selected.size;
  const overQuota = isOverQuota(
    quota?.music,
    count,
    requestOverrides?.ignoreQuota
  );
  const nothingToRequest =
    groups.length > 0 && groups.every((group) => !group.requestable.length);

  const sendRequest = async () => {
    setIsUpdating(true);

    try {
      const body: DiscographyRequestBody = {
        artistId,
        mbIds: [...selected],
        serverId: requestOverrides?.server,
        profileId: requestOverrides?.profile,
        rootFolder: requestOverrides?.folder,
        tags: requestOverrides?.tags,
        userId: requestOverrides?.user?.id,
        ignoreQuota: requestOverrides?.ignoreQuota,
        monitorNewReleases:
          canMonitorNewReleases && monitorNewReleases ? true : undefined,
      };
      const response = await axios.post<BulkRequestResponse>(
        '/api/v1/request/discography',
        body
      );

      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');
      mutate(`/api/v1/artist/${artistId}`);
      mutate(`/api/v1/artist/${artistId}/discography`);

      const toast = getBulkRequestToast(intl, 'music', response.data);
      addToast(toast.content, {
        appearance: toast.appearance,
        autoDismiss: true,
      });

      onComplete?.();
    } catch (e) {
      addToast(
        (axios.isAxiosError(e) && e.response?.data?.message) ||
          intl.formatMessage(messages.requesterror),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const name = data?.artistName ?? artistName;

  return (
    <Modal
      loading={(!data && !error) || !quota}
      backgroundClickable
      onCancel={onCancel}
      onOk={sendRequest}
      okDisabled={
        isUpdating ||
        !data ||
        (count === 0 && !(canMonitorNewReleases && monitorNewReleases)) ||
        count > MAX_BULK_REQUEST_ITEMS ||
        overQuota
      }
      title={intl.formatMessage(messages.requestdiscography)}
      subTitle={
        name
          ? intl.formatMessage(messages.discographyby, { artist: name })
          : undefined
      }
      okText={
        isUpdating
          ? intl.formatMessage(globalMessages.requesting)
          : intl.formatMessage(messages.requestalbums, { count })
      }
      okButtonType="primary"
      backdrop={backdrop}
    >
      {hasAutoApprove && !nothingToRequest && (
        <div className="mt-6">
          <Alert
            title={intl.formatMessage(messages.requestadmin)}
            type="info"
          />
        </div>
      )}
      <BulkQuotaNotice
        type="music"
        quota={quota?.music}
        count={count}
        ignoreQuota={requestOverrides?.ignoreQuota}
        userOverride={
          requestOverrides?.user && requestOverrides.user.id !== user?.id
            ? requestOverrides.user.id
            : undefined
        }
      />
      <BulkLimitNotice type="music" count={count} />
      {data && groups.length === 0 && (
        <p className="mt-4 text-gray-300">
          {intl.formatMessage(messages.noreleases)}
        </p>
      )}
      {nothingToRequest && (
        <p className="mt-4 text-gray-300">
          {intl.formatMessage(messages.nothingtorequest)}
        </p>
      )}
      {groups.length > 0 && (
        <div className="mt-4">
          <span className="text-sm font-medium text-gray-300">
            {intl.formatMessage(messages.releasetypes)}
          </span>
          <ul className="mt-2 divide-y divide-gray-700/60 overflow-hidden rounded-md border border-gray-700">
            {groups.map((group) => {
              const typeName = intl.formatMessage(
                messages[typeMessages[group.type]]
              );
              const selectedCount = group.requestable.filter((album) =>
                selected.has(album.id)
              ).length;
              const isExpanded = expandedTypes.includes(group.type);
              const inputId = `discography-type-${group.type}`;

              return (
                <li key={`type-${group.type}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <GroupCheckbox
                      id={inputId}
                      checked={
                        selectedCount > 0 &&
                        selectedCount === group.requestable.length
                      }
                      indeterminate={
                        selectedCount > 0 &&
                        selectedCount < group.requestable.length
                      }
                      disabled={group.requestable.length === 0}
                      onChange={() => toggleType(group.requestable)}
                    />
                    <label
                      htmlFor={inputId}
                      className={`flex min-w-0 flex-1 flex-col ${
                        group.requestable.length === 0
                          ? 'opacity-50'
                          : 'cursor-pointer'
                      }`}
                    >
                      <span className="font-medium text-gray-100">
                        {typeName}
                        <span className="ml-2 text-sm text-gray-400">
                          {intl.formatNumber(group.albums.length)}
                        </span>
                      </span>
                      <span className="text-xs text-gray-400">
                        {intl.formatMessage(messages.selectedcount, {
                          selected: selectedCount,
                          total: group.requestable.length,
                        })}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="flex-shrink-0 rounded-md p-1 text-gray-400 transition hover:text-gray-100"
                      aria-expanded={isExpanded}
                      aria-label={intl.formatMessage(
                        isExpanded ? messages.hidealbums : messages.showalbums,
                        { type: typeName }
                      )}
                      onClick={() => toggleExpanded(group.type)}
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {isExpanded && (
                    <ul className="max-h-72 divide-y divide-gray-700/60 overflow-y-auto border-t border-gray-700/60 bg-gray-900/30">
                      {group.albums.map((album) => (
                        <BulkItemRow
                          key={`album-${album.id}`}
                          id={album.id}
                          title={album.title}
                          detail={album.releaseDate?.slice(0, 4)}
                          checked={selected.has(album.id)}
                          skipReason={getBulkSkipReason(
                            album.mediaInfo?.status
                          )}
                          onToggle={() => toggleAlbum(album.id)}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {data && data.totalReleaseGroups > data.releaseGroups.length && (
            <p className="mt-2 text-sm text-gray-400">
              {intl.formatMessage(messages.truncated, {
                shown: data.releaseGroups.length,
                total: data.totalReleaseGroups,
              })}
            </p>
          )}
        </div>
      )}
      {canMonitorNewReleases && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <span className="text-gray-100">
              {intl.formatMessage(messages.monitornewreleases)}
            </span>
            <p className="text-sm text-gray-400">
              {intl.formatMessage(messages.monitornewreleasesDescription)}
            </p>
          </div>
          <SlideCheckbox
            checked={monitorNewReleases}
            onClick={() => setMonitorNewReleases((value) => !value)}
          />
        </div>
      )}
      {canUseAdvanced && (
        <AdvancedRequester
          type="music"
          is4k={false}
          quota={quota}
          onChange={(overrides) => setRequestOverrides(overrides)}
        />
      )}
    </Modal>
  );
};

export default DiscographyRequestModal;
