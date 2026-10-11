import Button from '@app/components/Common/Button';
import useHomeScreenNotice from '@app/components/Settings/SettingsMain/useHomeScreenNotice';
import { logoUrl as brandingLogoUrl } from '@app/hooks/useBranding';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { ArrowPathIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { mutate } from 'swr';

const messages = defineMessages(
  'components.Settings.SettingsMain.ApplicationLogo',
  {
    applicationLogo: 'Application Logo',
    applicationLogoTip:
      'Square PNG, SVG or WebP image, up to 2 MB. Used in the top bar, on the sign in page, as the browser and home screen icon, and in notifications.',
    uploadLogo: 'Upload Logo',
    resetLogo: 'Reset to Default',
    preview: 'Preview',
    toastLogoSuccess: 'Application logo saved!',
    toastLogoFailure: 'Something went wrong while saving the logo.',
    toastLogoReset: 'Application logo reset to the default.',
    toastLogoResetFailure: 'Something went wrong while resetting the logo.',
    invalidType: 'The logo must be a PNG, SVG or WebP image.',
    tooLarge: 'The logo must be 2 MB or smaller.',
    notSquare: 'The logo must be square.',
  }
);

const ACCEPTED_TYPES = ['image/png', 'image/svg+xml', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const imageSize = (src: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });

interface ApplicationLogoProps {
  logoVersion?: string;
  /** The title as currently typed, so the preview follows it. */
  applicationTitle?: string;
  onChange: () => void;
}

const ApplicationLogo = ({
  logoVersion,
  applicationTitle,
  onChange,
}: ApplicationLogoProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const showHomeScreenNotice = useHomeScreenNotice();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const [isSaving, setSaving] = useState(false);

  const currentLogo = preview ?? brandingLogoUrl(logoVersion);

  const showError = (message: string) =>
    addToast(message, { autoDismiss: true, appearance: 'error' });

  const refresh = async () => {
    await mutate('/api/v1/settings/public');
    onChange();
  };

  const upload = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return showError(intl.formatMessage(messages.invalidType));
    }

    if (file.size > MAX_BYTES) {
      return showError(intl.formatMessage(messages.tooLarge));
    }

    const dataUrl = await readAsDataUrl(file);

    // SVGs scale and may not report a size, so only check bitmaps here
    if (file.type !== 'image/svg+xml') {
      try {
        const { width, height } = await imageSize(dataUrl);
        if (Math.abs(width - height) / Math.max(width, height) > 0.02) {
          return showError(intl.formatMessage(messages.notSquare));
        }
      } catch {
        return showError(intl.formatMessage(messages.invalidType));
      }
    }

    setPreview(dataUrl);
    setSaving(true);

    try {
      await axios.post('/api/v1/settings/main/logo', { file: dataUrl });
      await refresh();
      addToast(intl.formatMessage(messages.toastLogoSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
      showHomeScreenNotice(applicationTitle);
    } catch (e) {
      showError(
        axios.isAxiosError(e) && e.response?.data?.message
          ? e.response.data.message
          : intl.formatMessage(messages.toastLogoFailure)
      );
    } finally {
      setPreview(undefined);
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);

    try {
      await axios.delete('/api/v1/settings/main/logo');
      await refresh();
      addToast(intl.formatMessage(messages.toastLogoReset), {
        autoDismiss: true,
        appearance: 'success',
      });
      showHomeScreenNotice(applicationTitle);
    } catch {
      showError(intl.formatMessage(messages.toastLogoResetFailure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-row">
      <label htmlFor="applicationLogo" className="text-label">
        {intl.formatMessage(messages.applicationLogo)}
        <span className="label-tip">
          {intl.formatMessage(messages.applicationLogoTip)}
        </span>
      </label>
      <div className="form-input-area">
        <div
          className="flex flex-wrap items-center gap-4"
          aria-label={intl.formatMessage(messages.preview)}
        >
          {/* As in the top bar */}
          <div className="flex h-[52px] min-w-0 max-w-full items-center gap-2.5 rounded-full bg-gray-900 pl-2 pr-5 ring-1 ring-gray-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentLogo}
              alt=""
              className="h-10 w-10 flex-shrink-0 object-contain"
            />
            <span className="truncate font-display text-xl font-bold text-gray-100">
              {applicationTitle}
            </span>
          </div>
          {/* As a browser tab icon */}
          <div className="flex items-end gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentLogo} alt="" className="h-8 w-8 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentLogo} alt="" className="h-4 w-4 object-contain" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id="applicationLogo"
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) {
                upload(file);
              }
            }}
          />
          <Button
            type="button"
            buttonType="default"
            disabled={isSaving}
            onClick={() => inputRef.current?.click()}
          >
            <ArrowUpTrayIcon />
            <span>{intl.formatMessage(messages.uploadLogo)}</span>
          </Button>
          {logoVersion && (
            <Button
              type="button"
              buttonType="ghost"
              disabled={isSaving}
              onClick={() => reset()}
            >
              <ArrowPathIcon />
              <span>{intl.formatMessage(messages.resetLogo)}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationLogo;
