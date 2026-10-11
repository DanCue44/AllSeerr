import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { ForwardedRef, JSX } from 'react';
import React from 'react';
import { twMerge } from 'tailwind-merge';

export type ButtonType =
  | 'default'
  | 'primary'
  | 'danger'
  | 'warning'
  | 'success'
  | 'ghost';

// Ambient pills, one per button type (the classic look is set below)
const ambientTypes: Record<ButtonType, string> = {
  primary:
    'font-bold text-as-ground border-transparent bg-as-accent hover:brightness-110 active:brightness-95',
  danger:
    'text-[#f2b0aa] border-transparent bg-[#3b2427] hover:bg-[#4a2c30] active:bg-[#4a2c30]',
  warning:
    'text-[#f0d9a8] border-transparent bg-[#3b3424] hover:bg-[#4a412c] active:bg-[#4a412c]',
  success:
    'text-[#a8e6c4] border-transparent bg-[#1d3b33] hover:bg-[#244a40] active:bg-[#244a40]',
  ghost:
    'text-as-ink bg-transparent border-as-line-strong hover:bg-as-raised hover:border-as-ink-faint active:bg-as-raised',
  default:
    'text-as-ink bg-as-raised border-as-line-strong hover:bg-as-line group-hover:bg-as-line active:bg-as-line',
};

const ambientSizes = {
  sm: 'px-3 py-1.5 text-xs button-sm',
  lg: 'px-7 py-3 text-base button-lg',
  md: 'px-5 py-2 text-sm button-md',
};

// Seerr's original button look, used by the classic interface
const classicStyle = (
  buttonType: ButtonType,
  buttonSize: 'default' | 'lg' | 'md' | 'sm'
): string[] => {
  const buttonStyle = [
    'inline-flex items-center justify-center border leading-5 font-medium rounded-md focus:outline-none transition ease-in-out duration-150 cursor-pointer disabled:opacity-50 whitespace-nowrap',
  ];
  switch (buttonType) {
    case 'primary':
      buttonStyle.push(
        'text-white border border-indigo-500 bg-indigo-600/80 hover:bg-indigo-600 hover:border-indigo-500 focus:border-indigo-700 focus:ring-indigo active:bg-indigo-600 active:border-indigo-700'
      );
      break;
    case 'danger':
      buttonStyle.push(
        'text-white bg-red-600/80 border-red-500 hover:bg-red-600 hover:border-red-500 focus:border-red-700 focus:ring-red active:bg-red-700 active:border-red-700'
      );
      break;
    case 'warning':
      buttonStyle.push(
        'text-white border border-yellow-500 bg-yellow-500/80 hover:bg-yellow-500 hover:border-yellow-400 focus:border-yellow-700 focus:ring-yellow active:bg-yellow-500 active:border-yellow-700'
      );
      break;
    case 'success':
      buttonStyle.push(
        'text-white bg-green-500/80 border-green-500 hover:bg-green-500 hover:border-green-400 focus:border-green-700 focus:ring-green active:bg-green-500 active:border-green-700'
      );
      break;
    case 'ghost':
      buttonStyle.push(
        'text-white bg-transparent border-gray-600 hover:border-gray-200 focus:border-gray-100 active:border-gray-100'
      );
      break;
    default:
      buttonStyle.push(
        'text-gray-200 bg-gray-800/80 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-600 group-hover:text-white group-hover:bg-gray-700 group-hover:border-gray-600 focus:border-blue-300 focus:ring-blue active:text-gray-200 active:bg-gray-700 active:border-gray-600'
      );
  }

  switch (buttonSize) {
    case 'sm':
      buttonStyle.push('px-2.5 py-1.5 text-xs button-sm');
      break;
    case 'lg':
      buttonStyle.push('px-6 py-3 text-base button-lg');
      break;
    case 'md':
    default:
      buttonStyle.push('px-4 py-2 text-sm button-md');
  }

  return buttonStyle;
};

// Helper type to override types (overrides onClick)
type MergeElementProps<
  T extends React.ElementType,
  P extends Record<string, unknown>,
> = Omit<React.ComponentProps<T>, keyof P> & P;

type ElementTypes = 'button' | 'a';

type Element<P extends ElementTypes = 'button'> = P extends 'a'
  ? HTMLAnchorElement
  : HTMLButtonElement;

type BaseProps<P> = {
  buttonType?: ButtonType;
  buttonSize?: 'default' | 'lg' | 'md' | 'sm';
  // Had to do declare this manually as typescript would assume e was of type any otherwise
  onClick?: (
    e: React.MouseEvent<P extends 'a' ? HTMLAnchorElement : HTMLButtonElement>
  ) => void;
};

type ButtonProps<P extends React.ElementType> = {
  as?: P;
} & MergeElementProps<P, BaseProps<P>>;

function Button<P extends ElementTypes = 'button'>(
  {
    buttonType = 'default',
    buttonSize = 'default',
    as,
    children,
    className,
    ...props
  }: ButtonProps<P>,
  ref?: React.Ref<Element<P>>
): JSX.Element {
  const [interfaceStyle] = useInterfaceStyle();

  const buttonStyle =
    interfaceStyle === 'ambient'
      ? [
          'inline-flex items-center justify-center border leading-5 font-semibold rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-as-accent transition ease-in-out duration-150 cursor-pointer disabled:opacity-50 disabled:hover:brightness-100 whitespace-nowrap',
          ambientTypes[buttonType],
          ambientSizes[buttonSize === 'default' ? 'md' : buttonSize],
        ]
      : classicStyle(buttonType, buttonSize);

  buttonStyle.push(className ?? '');

  if (as === 'a') {
    return (
      <a
        className={twMerge(buttonStyle)}
        {...(props as React.ComponentProps<'a'>)}
        ref={ref as ForwardedRef<HTMLAnchorElement>}
      >
        <span className="flex items-center">{children}</span>
      </a>
    );
  } else {
    return (
      <button
        className={twMerge(buttonStyle)}
        {...(props as React.ComponentProps<'button'>)}
        ref={ref as ForwardedRef<HTMLButtonElement>}
      >
        <span className="flex items-center">{children}</span>
      </button>
    );
  }
}

export default React.forwardRef(Button) as typeof Button;
