import ImageFader from '@app/components/Common/ImageFader';

// Shared pieces for the Ambient sign in, setup and password reset pages

/** Page ground behind the auth pages. */
export const authPage =
  'relative flex min-h-screen flex-col bg-as-ground py-14 font-body';

/** The surface card holding each auth form. */
export const authCard =
  'rounded-[28px] bg-as-surface/90 shadow-[0_30px_60px_rgba(0,0,0,0.45)] ring-1 ring-as-line backdrop-blur-xl';

/** Pill inputs on the auth cards. */
export const authInput = 'h-[50px] text-[15px] placeholder:text-as-ink-faint';

/** Large primary pill used for the main action on each auth card. */
export const authPrimary = 'h-[50px] text-[15px]';

/** Headings on the auth cards. */
export const authHeading =
  'font-display text-lg font-medium leading-7 text-as-ink';

interface AuthBackdropProps {
  images?: string[];
}

/**
 * A soft, blurred collage of the server's backdrops washed into the ground
 * colour. Without backdrops it is a plain gradient of the ground.
 */
export const AuthBackdrop = ({ images = [] }: AuthBackdropProps) => (
  <div
    className="pointer-events-none fixed inset-0 overflow-hidden"
    aria-hidden="true"
  >
    {images.length > 0 && (
      <div className="absolute inset-0 scale-110 opacity-30 blur-2xl saturate-50">
        <ImageFader backgroundImages={images} isDarker />
      </div>
    )}
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% 0%, rgb(var(--as-raised) / 0.7) 0%, rgb(var(--as-ground) / 0.65) 55%, rgb(var(--as-ground)) 100%)',
      }}
    />
  </div>
);
