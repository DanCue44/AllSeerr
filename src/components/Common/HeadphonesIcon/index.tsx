import type { SVGProps } from 'react';

/**
 * Solid headphones icon drawn on the heroicons 24px grid, as heroicons has
 * none. Sized and colored with classes, like the heroicons it sits beside.
 */
const HeadphonesIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M12 2.25A9.75 9.75 0 0 0 2.25 12v1.5h1.5V12a8.25 8.25 0 0 1 16.5 0v1.5h1.5V12A9.75 9.75 0 0 0 12 2.25Z" />
    <path d="M2.25 14.25a1.5 1.5 0 0 1 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5v5.25a1.5 1.5 0 0 1-1.5 1.5H4.5a2.25 2.25 0 0 1-2.25-2.25v-4.5Z" />
    <path d="M21.75 14.25a1.5 1.5 0 0 0-1.5-1.5h-1.5a1.5 1.5 0 0 0-1.5 1.5v5.25a1.5 1.5 0 0 0 1.5 1.5h.75a2.25 2.25 0 0 0 2.25-2.25v-4.5Z" />
  </svg>
);

export default HeadphonesIcon;
