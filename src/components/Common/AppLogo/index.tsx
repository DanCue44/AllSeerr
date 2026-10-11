import useBranding from '@app/hooks/useBranding';
import Image from 'next/image';

interface AppLogoProps {
  /** Stacked puts the title under the logo; full puts it beside it. */
  variant: 'stacked' | 'full';
  loading?: 'eager' | 'lazy';
}

/**
 * The application logo with its title, filling a sized, relatively
 * positioned parent. The bundled artwork is used until the title or logo
 * is changed in the settings.
 */
const AppLogo = ({ variant, loading }: AppLogoProps) => {
  const { applicationTitle, logoUrl, isDefault } = useBranding();

  if (isDefault) {
    return (
      <Image
        src={variant === 'stacked' ? '/logo_stacked.svg' : '/logo_full.svg'}
        alt={applicationTitle}
        fill
        loading={loading}
      />
    );
  }

  if (variant === 'stacked') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          className="min-h-0 w-auto flex-1 object-contain"
        />
        <span className="max-w-full truncate font-display text-3xl font-bold text-white">
          {applicationTitle}
        </span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className="h-14 w-14 flex-shrink-0 object-contain"
      />
      <span className="min-w-0 truncate font-display text-2xl font-bold text-white">
        {applicationTitle}
      </span>
    </div>
  );
};

export default AppLogo;
