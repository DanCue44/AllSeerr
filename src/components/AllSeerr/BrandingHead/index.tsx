import PWAHeader from '@app/components/PWAHeader';
import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import {
  accentColorCss,
  isDefaultAccentColor,
} from '@server/utils/accentColor';
import Head from 'next/head';

/**
 * Head tags that follow the branding settings: icons, manifest and the
 * accent color. It renders with the page on the server, so the chosen
 * accent is there on the first paint, and updates when settings change.
 */
const BrandingHead = () => {
  const { currentSettings } = useSettings();
  const { user } = useUser();

  // A user's own accent wins; the stock accent is left to the palette
  const accentColor =
    user?.settings?.accentColor ||
    (isDefaultAccentColor(currentSettings.accentColor)
      ? undefined
      : currentSettings.accentColor);
  const accentCss = accentColorCss(accentColor);

  return (
    <Head>
      {/* Called directly so next/head sees plain tags it can update */}
      {PWAHeader({
        applicationTitle: currentSettings.applicationTitle,
        logoVersion: currentSettings.applicationLogoVersion,
      })}
      {accentCss && (
        <style
          key="allseerr-accent"
          id="allseerr-accent"
          dangerouslySetInnerHTML={{ __html: accentCss }}
        />
      )}
    </Head>
  );
};

export default BrandingHead;
