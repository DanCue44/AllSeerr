import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { Transition } from '@headlessui/react';
import type { ChaptarrSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import type { OnChangeValue } from 'react-select';
import Select from 'react-select';
import * as Yup from 'yup';

type OptionType = {
  value: number;
  label: string;
};

type BookFormat = 'ebook' | 'audiobook';

// Chaptarr root folder and metadata profile formats
const FOLDER_TYPES: Record<BookFormat, number> = { audiobook: 1, ebook: 2 };
const MIXED = 0;

export interface ChaptarrTestResponse {
  appName?: string;
  isChaptarr?: boolean;
  profiles: { id: number; name: string; profileType?: string }[];
  metadataProfiles: { id: number; name: string; profileType?: number }[];
  rootFolders: {
    id: number;
    path: string;
    folderType?: number;
    ebookQualityProfileId?: number;
    ebookMetadataProfileId?: number;
    audiobookQualityProfileId?: number;
    audiobookMetadataProfileId?: number;
  }[];
  tags: { id: number; label: string }[];
  urlBase?: string;
}

const messages = defineMessages('components.Settings.ChaptarrModal', {
  createchaptarr: 'Add New Chaptarr Server',
  editchaptarr: 'Edit Chaptarr Server',
  validationNameRequired: 'You must provide a server name',
  validationHostnameRequired: 'You must provide a valid hostname or IP address',
  validationPortRequired: 'You must provide a valid port number',
  validationApiKeyRequired: 'You must provide an API key',
  validationFormatRequired:
    'Select a quality profile, metadata profile and root folder for ebooks, audiobooks or both',
  validationFormatIncomplete:
    'Select a quality profile, metadata profile and root folder, or leave all three empty',
  toastChaptarrTestSuccess: 'Chaptarr connection established successfully!',
  toastChaptarrTestFailure: 'Failed to connect to Chaptarr.',
  add: 'Add Server',
  defaultserver: 'Default Server',
  servername: 'Server Name',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use SSL',
  apiKey: 'API Key',
  baseUrl: 'URL Base',
  ebooks: 'Ebooks',
  audiobooks: 'Audiobooks',
  formatDescription:
    'Requests for this format are added with these settings. Leave them empty if this server does not handle the format.',
  readarrNotice:
    '{appName} keeps one copy of each book. Pick the same settings for both formats to request both from it.',
  qualityprofile: 'Quality Profile',
  metadataprofile: 'Metadata Profile',
  rootfolder: 'Root Folder',
  selectQualityProfile: 'Select quality profile',
  selectRootFolder: 'Select root folder',
  selectMetadataProfile: 'Select metadata profile',
  loadingprofiles: 'Loading quality profiles…',
  testFirstQualityProfiles: 'Test connection to load quality profiles',
  loadingrootfolders: 'Loading root folders…',
  testFirstRootFolders: 'Test connection to load root folders',
  loadingmetadataprofiles: 'Loading metadata profiles…',
  testFirstMetadataProfiles: 'Test connection to load metadata profiles',
  loadingTags: 'Loading tags…',
  testFirstTags: 'Test connection to load tags',
  syncEnabled: 'Enable Scan',
  externalUrl: 'External URL',
  enableSearch: 'Enable Automatic Search',
  tagRequests: 'Tag Requests',
  tagRequestsInfo:
    "Automatically add an additional tag with the requester's user ID & display name",
  validationApplicationUrl: 'You must provide a valid URL',
  validationApplicationUrlTrailingSlash: 'URL must not end in a trailing slash',
  validationBaseUrlLeadingSlash: 'Base URL must have a leading slash',
  validationBaseUrlTrailingSlash: 'Base URL must not end in a trailing slash',
  tags: 'Tags',
  notagoptions: 'No tags.',
  selecttags: 'Select tags',
  apiKeyHelp: 'Find it in Chaptarr: Settings > General > Security > API Key',
  baseUrlHelp:
    'If you set a URL Base in Chaptarr (Settings > General > Host), enter it here (e.g. /chaptarr). Leave blank otherwise.',
  externalUrlHelp:
    'For clickable links on media pages when the hostname is not reachable from outside your network.',
  syncEnabledHelp:
    'Scan Chaptarr for existing books and request status so users cannot request books already available.',
  enableSearchHelp:
    'Automatically trigger a search in Chaptarr when a request is approved.',
});

interface ChaptarrModalProps {
  chaptarr: ChaptarrSettings | null;
  onClose: () => void;
  onSave: () => void;
}

interface FormatValues {
  profileId?: number | string;
  metadataProfileId?: number | string;
  rootFolder?: string;
}

const formatComplete = ({
  profileId,
  metadataProfileId,
  rootFolder,
}: FormatValues): boolean => !!profileId && !!metadataProfileId && !!rootFolder;

const formatEmpty = ({
  profileId,
  metadataProfileId,
  rootFolder,
}: FormatValues): boolean => !profileId && !metadataProfileId && !rootFolder;

const ChaptarrModal = ({ onClose, chaptarr, onSave }: ChaptarrModalProps) => {
  const intl = useIntl();
  const initialLoad = useRef(false);
  const { addToast } = useToasts();
  const [isValidated, setIsValidated] = useState(chaptarr ? true : false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<ChaptarrTestResponse>({
    profiles: [],
    rootFolders: [],
    metadataProfiles: [],
    tags: [],
  });

  const formatTest = (format: BookFormat) =>
    function (this: Yup.TestContext, value: unknown) {
      const values = this.parent as Record<string, string | undefined>;
      const fields: FormatValues =
        format === 'ebook'
          ? {
              profileId: values.ebookProfileId,
              metadataProfileId: values.ebookMetadataProfileId,
              rootFolder: values.ebookRootFolder,
            }
          : {
              profileId: values.audiobookProfileId,
              metadataProfileId: values.audiobookMetadataProfileId,
              rootFolder: values.audiobookRootFolder,
            };

      return !!value || formatEmpty(fields);
    };

  const ChaptarrSettingsSchema = Yup.object()
    .shape({
      name: Yup.string().required(
        intl.formatMessage(messages.validationNameRequired)
      ),
      hostname: Yup.string().required(
        intl.formatMessage(messages.validationHostnameRequired)
      ),
      port: Yup.number()
        .nullable()
        .required(intl.formatMessage(messages.validationPortRequired)),
      apiKey: Yup.string().required(
        intl.formatMessage(messages.validationApiKeyRequired)
      ),
      ebookProfileId: Yup.string().test(
        'ebook-complete',
        intl.formatMessage(messages.validationFormatIncomplete),
        formatTest('ebook')
      ),
      ebookMetadataProfileId: Yup.string().test(
        'ebook-complete',
        intl.formatMessage(messages.validationFormatIncomplete),
        formatTest('ebook')
      ),
      ebookRootFolder: Yup.string().test(
        'ebook-complete',
        intl.formatMessage(messages.validationFormatIncomplete),
        formatTest('ebook')
      ),
      audiobookProfileId: Yup.string().test(
        'audiobook-complete',
        intl.formatMessage(messages.validationFormatIncomplete),
        formatTest('audiobook')
      ),
      audiobookMetadataProfileId: Yup.string().test(
        'audiobook-complete',
        intl.formatMessage(messages.validationFormatIncomplete),
        formatTest('audiobook')
      ),
      audiobookRootFolder: Yup.string().test(
        'audiobook-complete',
        intl.formatMessage(messages.validationFormatIncomplete),
        formatTest('audiobook')
      ),
      externalUrl: Yup.string()
        .test(
          'valid-url',
          intl.formatMessage(messages.validationApplicationUrl),
          isValidURL
        )
        .test(
          'no-trailing-slash',
          intl.formatMessage(messages.validationApplicationUrlTrailingSlash),
          (value) => !value || !value.endsWith('/')
        ),
      baseUrl: Yup.string()
        .test(
          'leading-slash',
          intl.formatMessage(messages.validationBaseUrlLeadingSlash),
          (value) => !value || value.startsWith('/')
        )
        .test(
          'no-trailing-slash',
          intl.formatMessage(messages.validationBaseUrlTrailingSlash),
          (value) => !value || !value.endsWith('/')
        ),
    })
    .test(
      'one-format',
      intl.formatMessage(messages.validationFormatRequired),
      function (values) {
        if (
          formatComplete({
            profileId: values.ebookProfileId,
            metadataProfileId: values.ebookMetadataProfileId,
            rootFolder: values.ebookRootFolder,
          }) ||
          formatComplete({
            profileId: values.audiobookProfileId,
            metadataProfileId: values.audiobookMetadataProfileId,
            rootFolder: values.audiobookRootFolder,
          })
        ) {
          return true;
        }

        return this.createError({
          path: 'ebookRootFolder',
          message: intl.formatMessage(messages.validationFormatRequired),
        });
      }
    );

  const testConnection = useCallback(
    async ({
      hostname,
      port,
      apiKey,
      baseUrl,
      useSsl = false,
    }: {
      hostname: string;
      port: number;
      apiKey: string;
      baseUrl?: string;
      useSsl?: boolean;
    }) => {
      setIsTesting(true);
      try {
        const response = await axios.post<ChaptarrTestResponse>(
          '/api/v1/settings/chaptarr/test',
          {
            hostname,
            apiKey,
            port: Number(port),
            baseUrl,
            useSsl,
          }
        );

        setIsValidated(true);
        setTestResponse(response.data);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.toastChaptarrTestSuccess), {
            appearance: 'success',
            autoDismiss: true,
          });
        }
      } catch {
        setIsValidated(false);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.toastChaptarrTestFailure), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      } finally {
        setIsTesting(false);
        initialLoad.current = true;
      }
    },
    [addToast, intl]
  );

  useEffect(() => {
    if (chaptarr) {
      testConnection({
        apiKey: chaptarr.apiKey,
        hostname: chaptarr.hostname,
        port: chaptarr.port,
        baseUrl: chaptarr.baseUrl,
        useSsl: chaptarr.useSsl,
      });
    }
  }, [chaptarr, testConnection]);

  const sortByName = <T extends { name: string }>(items: T[]) =>
    items.toSorted((a, b) =>
      a.name.localeCompare(b.name, intl.locale, {
        numeric: true,
        sensitivity: 'base',
      })
    );

  // Chaptarr profiles and root folders belong to a format, other Readarr
  // compatible servers list them all for both
  const profilesFor = (format: BookFormat) =>
    sortByName(
      testResponse.profiles.filter(
        (profile) => !profile.profileType || profile.profileType === format
      )
    );

  const metadataProfilesFor = (format: BookFormat) =>
    sortByName(
      testResponse.metadataProfiles.filter(
        (profile) =>
          profile.profileType === undefined ||
          profile.profileType === MIXED ||
          profile.profileType === FOLDER_TYPES[format]
      )
    );

  const rootFoldersFor = (format: BookFormat) =>
    testResponse.rootFolders.filter(
      (folder) =>
        folder.folderType === undefined ||
        folder.folderType === MIXED ||
        folder.folderType === FOLDER_TYPES[format]
    );

  const selectPlaceholder = (
    loading: keyof typeof messages,
    testFirst: keyof typeof messages,
    select: keyof typeof messages
  ) =>
    intl.formatMessage(
      isTesting
        ? messages[loading]
        : !isValidated
          ? messages[testFirst]
          : messages[select]
    );

  return (
    <Transition
      as="div"
      appear
      show
      enter="transition-opacity ease-in-out duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity ease-in-out duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <Formik
        initialValues={{
          name: chaptarr?.name,
          hostname: chaptarr?.hostname,
          port: chaptarr?.port ?? 8789,
          ssl: chaptarr?.useSsl ?? false,
          apiKey: chaptarr?.apiKey,
          baseUrl: chaptarr?.baseUrl,
          ebookProfileId: chaptarr?.activeProfileId || '',
          ebookMetadataProfileId: chaptarr?.activeMetadataProfileId || '',
          ebookRootFolder: chaptarr?.activeDirectory ?? '',
          audiobookProfileId: chaptarr?.activeAudiobookProfileId || '',
          audiobookMetadataProfileId:
            chaptarr?.activeAudiobookMetadataProfileId || '',
          audiobookRootFolder: chaptarr?.activeAudiobookDirectory ?? '',
          tags: chaptarr?.tags ?? [],
          isDefault: chaptarr?.isDefault ?? false,
          externalUrl: chaptarr?.externalUrl,
          syncEnabled: chaptarr?.syncEnabled ?? true,
          enableSearch: !chaptarr?.preventSearch,
          tagRequests: chaptarr?.tagRequests ?? false,
        }}
        validationSchema={ChaptarrSettingsSchema}
        onSubmit={async (values) => {
          try {
            const profileName = (id: number | string) =>
              testResponse.profiles.find((profile) => profile.id === Number(id))
                ?.name;
            const metadataProfileName = (id: number | string) =>
              testResponse.metadataProfiles.find(
                (profile) => profile.id === Number(id)
              )?.name;

            const submission = {
              name: values.name,
              hostname: values.hostname,
              port: Number(values.port),
              apiKey: values.apiKey,
              useSsl: values.ssl,
              baseUrl: values.baseUrl,
              activeProfileId: Number(values.ebookProfileId) || 0,
              activeProfileName: profileName(values.ebookProfileId) ?? '',
              activeMetadataProfileId:
                Number(values.ebookMetadataProfileId) || 0,
              activeMetadataProfileName:
                metadataProfileName(values.ebookMetadataProfileId) ?? '',
              activeDirectory: values.ebookRootFolder,
              activeAudiobookProfileId:
                Number(values.audiobookProfileId) || undefined,
              activeAudiobookProfileName: profileName(
                values.audiobookProfileId
              ),
              activeAudiobookMetadataProfileId:
                Number(values.audiobookMetadataProfileId) || undefined,
              activeAudiobookMetadataProfileName: metadataProfileName(
                values.audiobookMetadataProfileId
              ),
              activeAudiobookDirectory: values.audiobookRootFolder || undefined,
              tags: values.tags,
              isDefault: values.isDefault,
              externalUrl: values.externalUrl,
              syncEnabled: values.syncEnabled,
              preventSearch: !values.enableSearch,
              tagRequests: values.tagRequests,
            };
            if (!chaptarr) {
              await axios.post('/api/v1/settings/chaptarr', submission);
            } else {
              await axios.put(
                `/api/v1/settings/chaptarr/${chaptarr.id}`,
                submission
              );
            }

            onSave();
          } catch {
            // set error here
          }
        }}
      >
        {({
          errors,
          touched,
          values,
          handleSubmit,
          setFieldValue,
          isSubmitting,
          isValid,
        }) => {
          const fieldError = (name: keyof typeof errors) => {
            const error = errors[name];

            return error && touched[name] && typeof error === 'string' ? (
              <div className="error">{error}</div>
            ) : null;
          };

          // Picking a root folder fills in its default profiles
          const selectRootFolder = (format: BookFormat, path: string) => {
            setFieldValue(`${format}RootFolder`, path);

            const folder = testResponse.rootFolders.find(
              (rootFolder) => rootFolder.path === path
            );
            const qualityProfileId = folder?.[`${format}QualityProfileId`];
            const metadataProfileId = folder?.[`${format}MetadataProfileId`];

            if (qualityProfileId && !values[`${format}ProfileId`]) {
              setFieldValue(`${format}ProfileId`, qualityProfileId);
            }
            if (metadataProfileId && !values[`${format}MetadataProfileId`]) {
              setFieldValue(`${format}MetadataProfileId`, metadataProfileId);
            }
          };

          const formatFields = (format: BookFormat) => (
            <>
              <div className="form-row">
                <label htmlFor={`${format}RootFolder`} className="text-label">
                  {intl.formatMessage(messages.rootfolder)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      as="select"
                      id={`${format}RootFolder`}
                      name={`${format}RootFolder`}
                      disabled={!isValidated || isTesting}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        selectRootFolder(format, e.target.value)
                      }
                    >
                      <option value="">
                        {selectPlaceholder(
                          'loadingrootfolders',
                          'testFirstRootFolders',
                          'selectRootFolder'
                        )}
                      </option>
                      {rootFoldersFor(format).map((folder) => (
                        <option
                          key={`loaded-rootfolder-${format}-${folder.id}`}
                          value={folder.path}
                        >
                          {folder.path}
                        </option>
                      ))}
                    </Field>
                  </div>
                  {fieldError(`${format}RootFolder`)}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor={`${format}ProfileId`} className="text-label">
                  {intl.formatMessage(messages.qualityprofile)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      as="select"
                      id={`${format}ProfileId`}
                      name={`${format}ProfileId`}
                      disabled={!isValidated || isTesting}
                    >
                      <option value="">
                        {selectPlaceholder(
                          'loadingprofiles',
                          'testFirstQualityProfiles',
                          'selectQualityProfile'
                        )}
                      </option>
                      {profilesFor(format).map((profile) => (
                        <option
                          key={`loaded-profile-${format}-${profile.id}`}
                          value={profile.id}
                        >
                          {profile.name}
                        </option>
                      ))}
                    </Field>
                  </div>
                  {fieldError(`${format}ProfileId`)}
                </div>
              </div>
              <div className="form-row">
                <label
                  htmlFor={`${format}MetadataProfileId`}
                  className="text-label"
                >
                  {intl.formatMessage(messages.metadataprofile)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      as="select"
                      id={`${format}MetadataProfileId`}
                      name={`${format}MetadataProfileId`}
                      disabled={!isValidated || isTesting}
                    >
                      <option value="">
                        {selectPlaceholder(
                          'loadingmetadataprofiles',
                          'testFirstMetadataProfiles',
                          'selectMetadataProfile'
                        )}
                      </option>
                      {metadataProfilesFor(format).map((profile) => (
                        <option
                          key={`loaded-metadataprofile-${format}-${profile.id}`}
                          value={profile.id}
                        >
                          {profile.name}
                        </option>
                      ))}
                    </Field>
                  </div>
                  {fieldError(`${format}MetadataProfileId`)}
                </div>
              </div>
            </>
          );

          return (
            <Modal
              onCancel={onClose}
              okButtonType="primary"
              okText={
                isSubmitting
                  ? intl.formatMessage(globalMessages.saving)
                  : chaptarr
                    ? intl.formatMessage(globalMessages.save)
                    : intl.formatMessage(messages.add)
              }
              secondaryButtonType="warning"
              secondaryText={
                isTesting
                  ? intl.formatMessage(globalMessages.testing)
                  : intl.formatMessage(globalMessages.test)
              }
              onSecondary={() => {
                if (values.apiKey && values.hostname && values.port) {
                  testConnection({
                    apiKey: values.apiKey,
                    baseUrl: values.baseUrl,
                    hostname: values.hostname,
                    port: values.port,
                    useSsl: values.ssl,
                  });
                  if (!values.baseUrl || values.baseUrl === '/') {
                    setFieldValue('baseUrl', testResponse.urlBase);
                  }
                }
              }}
              secondaryDisabled={
                !values.apiKey ||
                !values.hostname ||
                !values.port ||
                isTesting ||
                isSubmitting
              }
              okDisabled={!isValidated || isSubmitting || isTesting || !isValid}
              onOk={() => handleSubmit()}
              title={
                !chaptarr
                  ? intl.formatMessage(messages.createchaptarr)
                  : intl.formatMessage(messages.editchaptarr)
              }
            >
              <div className="mb-6">
                <div className="form-row">
                  <label htmlFor="isDefault" className="checkbox-label">
                    {intl.formatMessage(messages.defaultserver)}
                  </label>
                  <div className="form-input-area">
                    <Field type="checkbox" id="isDefault" name="isDefault" />
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="name" className="text-label">
                    {intl.formatMessage(messages.servername)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="off"
                        data-form-type="other"
                        data-1pignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setIsValidated(false);
                          setFieldValue('name', e.target.value);
                        }}
                      />
                    </div>
                    {fieldError('name')}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="hostname" className="text-label">
                    {intl.formatMessage(messages.hostname)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <span className="protocol">
                        {values.ssl ? 'https://' : 'http://'}
                      </span>
                      <Field
                        id="hostname"
                        name="hostname"
                        type="text"
                        inputMode="url"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setIsValidated(false);
                          setFieldValue('hostname', e.target.value);
                        }}
                        className="rounded-r-only"
                      />
                    </div>
                    {fieldError('hostname')}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="port" className="text-label">
                    {intl.formatMessage(messages.port)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      id="port"
                      name="port"
                      type="text"
                      inputMode="numeric"
                      className="short"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setIsValidated(false);
                        setFieldValue('port', e.target.value);
                      }}
                    />
                    {fieldError('port')}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="ssl" className="checkbox-label">
                    {intl.formatMessage(messages.ssl)}
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="ssl"
                      name="ssl"
                      onChange={() => {
                        setIsValidated(false);
                        setFieldValue('ssl', !values.ssl);
                      }}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="apiKey" className="text-label">
                    {intl.formatMessage(messages.apiKey)}
                    <span className="label-required">*</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.apiKeyHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <SensitiveInput
                        as="field"
                        id="apiKey"
                        name="apiKey"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setIsValidated(false);
                          setFieldValue('apiKey', e.target.value);
                        }}
                      />
                    </div>
                    {fieldError('apiKey')}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="baseUrl" className="text-label">
                    {intl.formatMessage(messages.baseUrl)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.baseUrlHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="baseUrl"
                        name="baseUrl"
                        type="text"
                        inputMode="url"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setIsValidated(false);
                          setFieldValue('baseUrl', e.target.value);
                        }}
                      />
                    </div>
                    {fieldError('baseUrl')}
                  </div>
                </div>
                <h3 className="heading mt-6">
                  {intl.formatMessage(messages.ebooks)}
                </h3>
                <p className="description">
                  {intl.formatMessage(messages.formatDescription)}
                  {testResponse.isChaptarr === false &&
                    ` ${intl.formatMessage(messages.readarrNotice, {
                      appName: testResponse.appName ?? 'Readarr',
                    })}`}
                </p>
                {formatFields('ebook')}
                <h3 className="heading mt-6">
                  {intl.formatMessage(messages.audiobooks)}
                </h3>
                <p className="description">
                  {intl.formatMessage(messages.formatDescription)}
                </p>
                {formatFields('audiobook')}
                <div className="form-row">
                  <label htmlFor="tags" className="text-label">
                    {intl.formatMessage(messages.tags)}
                  </label>
                  <div className="form-input-area">
                    <Select<OptionType, true>
                      options={
                        isValidated
                          ? testResponse.tags.map((tag) => ({
                              label: tag.label,
                              value: tag.id,
                            }))
                          : []
                      }
                      isMulti
                      isDisabled={!isValidated || isTesting}
                      placeholder={
                        !isValidated
                          ? intl.formatMessage(messages.testFirstTags)
                          : isTesting
                            ? intl.formatMessage(messages.loadingTags)
                            : intl.formatMessage(messages.selecttags)
                      }
                      isLoading={isTesting}
                      className="react-select-container"
                      classNamePrefix="react-select"
                      value={
                        isTesting
                          ? []
                          : values.tags.flatMap((tagId) => {
                              const foundTag = testResponse.tags.find(
                                (tag) => tag.id === tagId
                              );

                              return foundTag
                                ? [
                                    {
                                      value: foundTag.id,
                                      label: foundTag.label,
                                    },
                                  ]
                                : [];
                            })
                      }
                      onChange={(value: OnChangeValue<OptionType, true>) => {
                        setFieldValue(
                          'tags',
                          value.map((option) => option.value)
                        );
                      }}
                      noOptionsMessage={() =>
                        intl.formatMessage(messages.notagoptions)
                      }
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="externalUrl" className="text-label">
                    {intl.formatMessage(messages.externalUrl)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.externalUrlHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="externalUrl"
                        name="externalUrl"
                        type="text"
                        inputMode="url"
                      />
                    </div>
                    {fieldError('externalUrl')}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="syncEnabled" className="checkbox-label">
                    {intl.formatMessage(messages.syncEnabled)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.syncEnabledHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="syncEnabled"
                      name="syncEnabled"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="enableSearch" className="checkbox-label">
                    {intl.formatMessage(messages.enableSearch)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.enableSearchHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="enableSearch"
                      name="enableSearch"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="tagRequests" className="checkbox-label">
                    {intl.formatMessage(messages.tagRequests)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.tagRequestsInfo)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="tagRequests"
                      name="tagRequests"
                    />
                  </div>
                </div>
              </div>
            </Modal>
          );
        }}
      </Formik>
    </Transition>
  );
};

export default ChaptarrModal;
