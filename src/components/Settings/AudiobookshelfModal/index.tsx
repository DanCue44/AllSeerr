import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { Transition } from '@headlessui/react';
import type { AudiobookshelfLibrary } from '@server/api/audiobookshelf';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useState } from 'react';
import type { MessageDescriptor } from 'react-intl';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.AudiobookshelfModal', {
  configureaudiobookshelf: 'Configure Audiobookshelf',
  editaudiobookshelf: 'Edit Audiobookshelf',
  url: 'Audiobookshelf URL',
  urlHelp:
    'Public address of your Audiobookshelf server. Available books link to it.',
  apiKey: 'API Key',
  apiKeyHelp:
    'Optional. With an API key, Test lists your libraries to pick from and available books open straight to the book instead of a title search. It is never sent to users. Find it in Audiobookshelf: Settings > Users > your user > API Token.',
  library: 'Audiobook Library',
  libraryHelp:
    'Optional. With a library, available books open a title search in it instead of the Audiobookshelf home page.',
  libraryId: 'Audiobook Library ID',
  ebookLibrary: 'Ebook Library',
  ebookLibraryId: 'Ebook Library ID',
  ebookLibraryHelp:
    'Optional. The library your ebooks are in, when they are kept apart from the audiobooks.',
  sameLibrary: 'Same as the audiobook library',
  nolibrary: 'No library (home page)',
  testForLibraries: 'Enter an API key and click Test to list your libraries.',
  showNoBookEnds: 'Show Open in NoBookEnds',
  showNoBookEndsHelp:
    'Available books offer to open in the NoBookEnds app, which reads and listens through Audiobookshelf. Needs an API key to find the book.',
  validationUrlRequired: 'You must provide a valid URL',
  validationUrlTrailingSlash: 'URL must not end in a trailing slash',
  toastTestSuccess: 'Audiobookshelf connection established successfully!',
  toastTestSuccessVersion:
    'Audiobookshelf {version} connection established successfully!',
  toastTestFailure: 'Failed to connect to Audiobookshelf.',
  toastSaveFailure:
    'Something went wrong while saving Audiobookshelf settings.',
});

interface AudiobookshelfModalProps {
  audiobookshelf: AudiobookshelfSettings;
  onClose: () => void;
  onSave: () => void;
}

const AudiobookshelfModal = ({
  audiobookshelf,
  onClose,
  onSave,
}: AudiobookshelfModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const [libraries, setLibraries] = useState<AudiobookshelfLibrary[]>();
  const isConfigured = !!audiobookshelf.url;

  const AudiobookshelfSettingsSchema = Yup.object().shape({
    url: Yup.string()
      .required(intl.formatMessage(messages.validationUrlRequired))
      .test(
        'valid-url',
        intl.formatMessage(messages.validationUrlRequired),
        isValidURL
      )
      .test(
        'no-trailing-slash',
        intl.formatMessage(messages.validationUrlTrailingSlash),
        (value) => !value || !value.endsWith('/')
      ),
  });

  const testConnection = async (values: AudiobookshelfSettings) => {
    setIsTesting(true);

    try {
      const response = await axios.post<{
        version?: string;
        libraries?: AudiobookshelfLibrary[];
      }>('/api/v1/settings/audiobookshelf/test', {
        url: values.url,
        ...(values.apiKey ? { apiKey: values.apiKey } : {}),
      });

      // Only book libraries can hold the books that are linked
      setLibraries(
        response.data.libraries?.filter(
          (library) => !library.mediaType || library.mediaType === 'book'
        )
      );
      addToast(
        response.data.version
          ? intl.formatMessage(messages.toastTestSuccessVersion, {
              version: response.data.version,
            })
          : intl.formatMessage(messages.toastTestSuccess),
        { autoDismiss: true, appearance: 'success' }
      );
    } catch {
      addToast(intl.formatMessage(messages.toastTestFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsTesting(false);
    }
  };

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
          url: audiobookshelf.url ?? '',
          apiKey: audiobookshelf.apiKey ?? '',
          libraryId: audiobookshelf.libraryId ?? '',
          ebookLibraryId: audiobookshelf.ebookLibraryId ?? '',
          showNoBookEnds: audiobookshelf.showNoBookEnds !== false,
        }}
        validationSchema={AudiobookshelfSettingsSchema}
        onSubmit={async (values) => {
          try {
            await axios.post('/api/v1/settings/audiobookshelf', values);

            onSave();
          } catch {
            addToast(intl.formatMessage(messages.toastSaveFailure), {
              autoDismiss: true,
              appearance: 'error',
            });
          }
        }}
      >
        {({
          errors,
          touched,
          values,
          handleSubmit,
          isSubmitting,
          isValid,
          setFieldValue,
        }) => {
          const libraryRow = ({
            name,
            label,
            help,
            empty,
          }: {
            name: 'libraryId' | 'ebookLibraryId';
            label: MessageDescriptor;
            help: MessageDescriptor;
            empty: MessageDescriptor;
          }) => {
            // The saved library stays pickable when the list does not have it
            const knownLibrary = libraries?.some(
              (library) => library.id === values[name]
            );

            return (
              <div className="form-row">
                <label htmlFor={name} className="text-label">
                  {intl.formatMessage(label)}
                  <span className="label-tip">{intl.formatMessage(help)}</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    {libraries ? (
                      <Field as="select" id={name} name={name}>
                        <option value="">{intl.formatMessage(empty)}</option>
                        {values[name] && !knownLibrary && (
                          <option value={values[name]}>{values[name]}</option>
                        )}
                        {libraries.map((library) => (
                          <option key={library.id} value={library.id}>
                            {library.name}
                          </option>
                        ))}
                      </Field>
                    ) : (
                      <Field
                        id={name}
                        name={name}
                        type="text"
                        autoComplete="off"
                        data-form-type="other"
                        data-1pignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                      />
                    )}
                  </div>
                  {!libraries && (
                    <p className="mt-1 text-xs text-gray-400">
                      {intl.formatMessage(messages.testForLibraries)}
                    </p>
                  )}
                </div>
              </div>
            );
          };

          return (
            <Modal
              onCancel={onClose}
              okButtonType="primary"
              okText={
                isSubmitting
                  ? intl.formatMessage(globalMessages.saving)
                  : intl.formatMessage(globalMessages.save)
              }
              secondaryButtonType="warning"
              secondaryText={
                isTesting
                  ? intl.formatMessage(globalMessages.testing)
                  : intl.formatMessage(globalMessages.test)
              }
              onSecondary={() => testConnection(values)}
              secondaryDisabled={
                !values.url || !!errors.url || isTesting || isSubmitting
              }
              okDisabled={isSubmitting || isTesting || !isValid}
              onOk={() => handleSubmit()}
              title={intl.formatMessage(
                isConfigured
                  ? messages.editaudiobookshelf
                  : messages.configureaudiobookshelf
              )}
            >
              <div className="mb-6">
                <div className="form-row">
                  <label htmlFor="url" className="text-label">
                    {intl.formatMessage(messages.url)}
                    <span className="label-required">*</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.urlHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="url"
                        name="url"
                        type="text"
                        inputMode="url"
                        autoComplete="off"
                        data-form-type="other"
                        data-1pignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                      />
                    </div>
                    {errors.url && touched.url && (
                      <div className="error">{errors.url}</div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="apiKey" className="text-label">
                    {intl.formatMessage(messages.apiKey)}
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
                        autoComplete="one-time-code"
                      />
                    </div>
                  </div>
                </div>
                {libraryRow({
                  name: 'libraryId',
                  label: libraries ? messages.library : messages.libraryId,
                  help: messages.libraryHelp,
                  empty: messages.nolibrary,
                })}
                {libraryRow({
                  name: 'ebookLibraryId',
                  label: libraries
                    ? messages.ebookLibrary
                    : messages.ebookLibraryId,
                  help: messages.ebookLibraryHelp,
                  empty: messages.sameLibrary,
                })}
                <div className="form-row">
                  <label htmlFor="showNoBookEnds" className="checkbox-label">
                    {intl.formatMessage(messages.showNoBookEnds)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.showNoBookEndsHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="showNoBookEnds"
                      name="showNoBookEnds"
                      onChange={() => {
                        setFieldValue('showNoBookEnds', !values.showNoBookEnds);
                      }}
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

export default AudiobookshelfModal;
