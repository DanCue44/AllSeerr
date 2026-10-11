import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import Link from 'next/link';
import React from 'react';

type BadgeType = NonNullable<BadgeProps['badgeType']>;

// Ambient tones per badge type, with a hover tone for linked badges
const ambientTones: Record<BadgeType, [string, string]> = {
  default: ['bg-as-accent/20 !text-as-accent-soft', 'hover:bg-as-accent/30'],
  primary: ['bg-as-accent/20 !text-as-accent-soft', 'hover:bg-as-accent/30'],
  danger: ['bg-[#3b2427] !text-[#f2b0aa]', 'hover:bg-[#4a2c30]'],
  warning: ['bg-[#3b3424] !text-[#f0d9a8]', 'hover:bg-[#4a412c]'],
  success: ['bg-[#1d3b33] !text-[#a8e6c4]', 'hover:bg-[#244a40]'],
  dark: ['bg-as-tile !text-as-ink-faint', 'hover:bg-as-surface'],
  light: ['bg-as-raised !text-as-ink-soft', 'hover:bg-as-line'],
};

interface BadgeProps {
  badgeType?:
    | 'default'
    | 'primary'
    | 'danger'
    | 'warning'
    | 'success'
    | 'dark'
    | 'light';
  className?: string;
  href?: string;
  children: React.ReactNode;
}

const Badge = (
  { badgeType = 'default', className, href, children }: BadgeProps,
  ref?: React.Ref<HTMLElement>
) => {
  const [interfaceStyle] = useInterfaceStyle();
  const badgeStyle = [
    interfaceStyle === 'ambient'
      ? 'px-2.5 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap'
      : 'px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap',
  ];

  if (href) {
    badgeStyle.push('transition cursor-pointer !no-underline');
  } else {
    badgeStyle.push('cursor-default');
  }

  if (interfaceStyle === 'ambient') {
    const [tone, hoverTone] = ambientTones[badgeType];
    badgeStyle.push(tone);
    if (href) {
      badgeStyle.push(hoverTone);
    }
  } else {
    switch (badgeType) {
      case 'danger':
        badgeStyle.push('bg-red-600/80 border-red-500 border !text-red-100');
        if (href) {
          badgeStyle.push('hover:bg-red-500');
        }
        break;
      case 'warning':
        badgeStyle.push(
          'bg-yellow-500/80 border-yellow-500 border !text-yellow-100'
        );
        if (href) {
          badgeStyle.push('hover:bg-yellow-500');
        }
        break;
      case 'success':
        badgeStyle.push(
          'bg-green-500/80 border border-green-500 !text-green-100'
        );
        if (href) {
          badgeStyle.push('hover:bg-green-500');
        }
        break;
      case 'dark':
        badgeStyle.push('bg-gray-900 !text-gray-400');
        if (href) {
          badgeStyle.push('hover:bg-gray-800');
        }
        break;
      case 'light':
        badgeStyle.push('bg-gray-700 !text-gray-300');
        if (href) {
          badgeStyle.push('hover:bg-gray-600');
        }
        break;
      default:
        badgeStyle.push(
          'bg-indigo-500/80 border border-indigo-500 !text-indigo-100'
        );
        if (href) {
          badgeStyle.push('hover:bg-indigo-500');
        }
    }
  }

  if (className) {
    badgeStyle.push(className);
  }

  if (href?.includes('://')) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={badgeStyle.join(' ')}
        ref={ref as React.Ref<HTMLAnchorElement>}
      >
        {children}
      </a>
    );
  } else if (href) {
    return (
      <Link
        href={href}
        className={badgeStyle.join(' ')}
        ref={ref as React.Ref<HTMLAnchorElement>}
      >
        {children}
      </Link>
    );
  } else {
    return (
      <span
        className={badgeStyle.join(' ')}
        ref={ref as React.Ref<HTMLSpanElement>}
      >
        {children}
      </span>
    );
  }
};

export default React.forwardRef(Badge) as typeof Badge;
