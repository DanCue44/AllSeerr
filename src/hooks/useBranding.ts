import useSettings from '@app/hooks/useSettings';

export const DEFAULT_APPLICATION_TITLE = 'AllSeerr';
export const DEFAULT_LOGO = '/allseerr-logo.png';

export type BrandingIconName =
  | 'favicon-16x16.png'
  | 'favicon-32x32.png'
  | 'apple-touch-icon.png'
  | 'android-chrome-192x192.png'
  | 'android-chrome-512x512.png'
  | 'favicon.ico';

/** The uploaded logo, or the bundled one when none has been uploaded. */
export const logoUrl = (version?: string): string =>
  version ? `/api/v1/branding/logo?v=${version}` : DEFAULT_LOGO;

/** An icon generated from the uploaded logo, or the bundled icon. */
export const brandingIconUrl = (
  name: BrandingIconName,
  version?: string
): string =>
  version ? `/api/v1/branding/icon/${name}?v=${version}` : `/${name}`;

/** A launch screen made from the uploaded logo, or the bundled one. */
export const brandingSplashUrl = (file: string, version?: string): string =>
  version ? `/api/v1/branding/splash/${file}?v=${version}` : `/${file}`;

interface BrandingResponse {
  applicationTitle: string;
  logoVersion: string;
  logoUrl: string;
  hasCustomLogo: boolean;
  /** Neither the title nor the logo has been changed. */
  isDefault: boolean;
}

const useBranding = (): BrandingResponse => {
  const { currentSettings } = useSettings();
  const applicationTitle =
    currentSettings.applicationTitle || DEFAULT_APPLICATION_TITLE;
  const logoVersion = currentSettings.applicationLogoVersion ?? '';

  return {
    applicationTitle,
    logoVersion,
    logoUrl: logoUrl(logoVersion),
    hasCustomLogo: !!logoVersion,
    isDefault: !logoVersion && applicationTitle === DEFAULT_APPLICATION_TITLE,
  };
};

export default useBranding;
