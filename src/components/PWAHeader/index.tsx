import { brandingIconUrl, brandingSplashUrl } from '@app/hooks/useBranding';

// iOS launch screens and the screens they fit
const SPLASH_SCREENS: [string, string][] = [
  [
    'apple-splash-2048-2732.jpg',
    '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-2732-2048.jpg',
    '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
  [
    'apple-splash-1668-2388.jpg',
    '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-2388-1668.jpg',
    '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
  [
    'apple-splash-1536-2048.jpg',
    '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-2048-1536.jpg',
    '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
  [
    'apple-splash-1668-2224.jpg',
    '(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-2224-1668.jpg',
    '(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
  [
    'apple-splash-1620-2160.jpg',
    '(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-2160-1620.jpg',
    '(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
  [
    'apple-splash-1284-2778.jpg',
    '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  ],
  [
    'apple-splash-2778-1284.jpg',
    '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)',
  ],
  [
    'apple-splash-1170-2532.jpg',
    '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  ],
  [
    'apple-splash-2532-1170.jpg',
    '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)',
  ],
  [
    'apple-splash-1125-2436.jpg',
    '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  ],
  [
    'apple-splash-2436-1125.jpg',
    '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)',
  ],
  [
    'apple-splash-1242-2688.jpg',
    '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  ],
  [
    'apple-splash-2688-1242.jpg',
    '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)',
  ],
  [
    'apple-splash-828-1792.jpg',
    '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-1792-828.jpg',
    '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
  [
    'apple-splash-1242-2208.jpg',
    '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  ],
  [
    'apple-splash-2208-1242.jpg',
    '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)',
  ],
  [
    'apple-splash-750-1334.jpg',
    '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-1334-750.jpg',
    '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
  [
    'apple-splash-640-1136.jpg',
    '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  ],
  [
    'apple-splash-1136-640.jpg',
    '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
  ],
];

interface PWAHeaderProps {
  applicationTitle?: string;
  logoVersion?: string;
}

const PWAHeader = ({
  applicationTitle = 'AllSeerr',
  logoVersion,
}: PWAHeaderProps) => {
  return (
    <>
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href={brandingIconUrl('apple-touch-icon.png', logoVersion)}
      />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href={brandingIconUrl('favicon-32x32.png', logoVersion)}
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href={brandingIconUrl('favicon-16x16.png', logoVersion)}
      />
      {SPLASH_SCREENS.map(([file, media]) => (
        <link
          key={file}
          rel="apple-touch-startup-image"
          href={brandingSplashUrl(file, logoVersion)}
          media={media}
        />
      ))}
      <meta
        name="apple-mobile-web-app-status-bar-style"
        content="black-translucent"
      />
      <link
        rel="manifest"
        href={`/site.webmanifest${logoVersion ? `?v=${logoVersion}` : ''}`}
        crossOrigin="use-credentials"
      />
      <meta name="apple-mobile-web-app-title" content={applicationTitle} />
      <meta
        name="description"
        content="Request and Media Discovery Application"
      />
      <meta name="format-detection" content="telephone=no" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="theme-color" content="#202124" />
      <meta name="application-name" content={applicationTitle} />
    </>
  );
};

export default PWAHeader;
