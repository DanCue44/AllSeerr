import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { Transition } from '@headlessui/react';
import type { LazyLibrarianSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.LazyLibrarianModal', {
  configurelazylibrarian: 'Configure LazyLibrarian',
  editlazylibrarian: 'Edit LazyLibrarian',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use SSL',
  apiKey: 'API Key',
  urlBase: 'URL Base',
  externalUrl: 'External URL',
  apiKeyHelp:
    'Find it in LazyLibrarian: Config > Interface > API. The full API key is needed, the read-only key cannot request books.',
  urlBaseHelp:
    'If LazyLibrarian runs under a web root (http_root in its config), enter it here (e.g. /request). Leave blank otherwise.',
  externalUrlHelp:
    'For clickable links on book pages when the hostname is not reachable from outside your network.',
  validationHostnameRequired: 'You must provide a valid hostname or IP address',
  validationPortRequired: 'You must provide a valid port number',
  validationApiKeyRequired: 'You must provide an API key',
  validationUrl: 'You must provide a valid URL',
  validationUrlTrailingSlash: 'URL must not end in a trailing slash',
  validationUrlBaseLeadingSlash: 'URL Base must have a leading slash',
  validationUrlBaseTrailingSlash: 'URL Base must not end in a trailing slash',
  toastLazyLibrarianTestSuccess:
    'LazyLibrarian {version} connection established successfully!',
  toastLazyLibrarianTestFailure: 'Failed to connect to LazyLibrarian.',
  toastLazyLibrarianSaveFailure:
    'Something went wrong while saving LazyLibrarian settings.',
});

interface LazyLibrarianModalProps {
  lazyLibrarian: LazyLibrarianSettings;
  onClose: () => void;
  onSave: () => void;
}

const LazyLibrarianModal = ({
  lazyLibrarian,
  onClose,
  onSave,
}: LazyLibrarianModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const isConfigured = !!lazyLibrarian.hostname && !!lazyLibrarian.apiKey;

  const urlTests = (schema: Yup.StringSchema) =>
    schema
      .test('valid-url', intl.formatMessage(messages.validationUrl), isValidURL)
      .test(
        'no-trailing-slash',
        intl.formatMessage(messages.validationUrlTrailingSlash),
        (value) => !value || !value.endsWith('/')
      );

  const LazyLibrarianSettingsSchema = Yup.object().shape({
    hostname: Yup.string().required(
      intl.formatMessage(messages.validationHostnameRequired)
    ),
    port: Yup.number()
      .nullable()
      .required(intl.formatMessage(messages.validationPortRequired)),
    apiKey: Yup.string().required(
      intl.formatMessage(messages.validationApiKeyRequired)
    ),
    urlBase: Yup.string()
      .test(
        'leading-slash',
        intl.formatMessage(messages.validationUrlBaseLeadingSlash),
        (value) => !value || value.startsWith('/')
      )
      .test(
        'no-trailing-slash',
        intl.formatMessage(messages.validationUrlBaseTrailingSlash),
        (value) => !value || !value.endsWith('/')
      ),
    externalUrl: urlTests(Yup.string()),
  });

  const testConnection = async (values: LazyLibrarianSettings) => {
    setIsTesting(true);

    try {
      const response = await axios.post<{ version: string }>(
        '/api/v1/settings/lazylibrarian/test',
        {
          hostname: values.hostname,
          port: Number(values.port),
          useSsl: values.useSsl,
          urlBase: values.urlBase,
          apiKey: values.apiKey,
        }
      );

      addToast(
        intl.formatMessage(messages.toastLazyLibrarianTestSuccess, {
          version: response.data.version,
        }),
        { autoDismiss: true, appearance: 'success' }
      );
    } catch {
      addToast(intl.formatMessage(messages.toastLazyLibrarianTestFailure), {
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
          hostname: lazyLibrarian.hostname ?? '',
          port: lazyLibrarian.port ?? 5299,
          useSsl: lazyLibrarian.useSsl ?? false,
          urlBase: lazyLibrarian.urlBase ?? '',
          apiKey: lazyLibrarian.apiKey ?? '',
          externalUrl: lazyLibrarian.externalUrl ?? '',
        }}
        validationSchema={LazyLibrarianSettingsSchema}
        onSubmit={async (values) => {
          try {
            await axios.post('/api/v1/settings/lazylibrarian', {
              ...values,
              port: Number(values.port),
            } as LazyLibrarianSettings);

            onSave();
          } catch {
            addToast(
              intl.formatMessage(messages.toastLazyLibrarianSaveFailure),
              { autoDismiss: true, appearance: 'error' }
            );
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
          const textField = (
            name: keyof typeof values,
            label: string,
            help?: string,
            required = false
          ) => (
            <div className="form-row">
              <label htmlFor={name} className="text-label">
                {label}
                {required && <span className="label-required">*</span>}
                {help && <span className="label-tip">{help}</span>}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field
                    id={name}
                    name={name}
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    data-form-type="other"
                    data-1pignore="true"
                    data-lpignore="true"
                    data-bwignore="true"
                  />
                </div>
                {errors[name] &&
                  touched[name] &&
                  typeof errors[name] === 'string' && (
                    <div className="error">{errors[name]}</div>
                  )}
              </div>
            </div>
          );

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
                !values.apiKey ||
                !values.hostname ||
                !values.port ||
                isTesting ||
                isSubmitting
              }
              okDisabled={isSubmitting || isTesting || !isValid}
              onOk={() => handleSubmit()}
              title={intl.formatMessage(
                isConfigured
                  ? messages.editlazylibrarian
                  : messages.configurelazylibrarian
              )}
            >
              <div className="mb-6">
                <div className="form-row">
                  <label htmlFor="hostname" className="text-label">
                    {intl.formatMessage(messages.hostname)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <span className="protocol">
                        {values.useSsl ? 'https://' : 'http://'}
                      </span>
                      <Field
                        id="hostname"
                        name="hostname"
                        type="text"
                        inputMode="url"
                        className="rounded-r-only"
                      />
                    </div>
                    {errors.hostname &&
                      touched.hostname &&
                      typeof errors.hostname === 'string' && (
                        <div className="error">{errors.hostname}</div>
                      )}
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
                    />
                    {errors.port &&
                      touched.port &&
                      typeof errors.port === 'string' && (
                        <div className="error">{errors.port}</div>
                      )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="useSsl" className="checkbox-label">
                    {intl.formatMessage(messages.ssl)}
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="useSsl"
                      name="useSsl"
                      onChange={() => {
                        setFieldValue('useSsl', !values.useSsl);
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
                        autoComplete="one-time-code"
                      />
                    </div>
                    {errors.apiKey &&
                      touched.apiKey &&
                      typeof errors.apiKey === 'string' && (
                        <div className="error">{errors.apiKey}</div>
                      )}
                  </div>
                </div>
                {textField(
                  'urlBase',
                  intl.formatMessage(messages.urlBase),
                  intl.formatMessage(messages.urlBaseHelp)
                )}
                {textField(
                  'externalUrl',
                  intl.formatMessage(messages.externalUrl),
                  intl.formatMessage(messages.externalUrlHelp)
                )}
              </div>
            </Modal>
          );
        }}
      </Formik>
    </Transition>
  );
};

export default LazyLibrarianModal;
