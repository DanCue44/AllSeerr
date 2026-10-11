/* eslint-disable @typescript-eslint/no-require-imports */
const defaultTheme = require('tailwindcss/defaultTheme');

// Seerr's gray, indigo and purple scales read from CSS variables that
// default to the stock Tailwind values, so the classic interface is
// unchanged and the Ambient interface can repaint every page by redefining
// the variables (see src/styles/allseerr-theme.css).
const stock = {
  gray: {
    50: '249 250 251',
    100: '243 244 246',
    200: '229 231 235',
    300: '209 213 219',
    400: '156 163 175',
    500: '107 114 128',
    600: '75 85 99',
    700: '55 65 81',
    800: '31 41 55',
    900: '17 24 39',
    950: '3 7 18',
  },
  indigo: {
    50: '238 242 255',
    100: '224 231 255',
    200: '199 210 254',
    300: '165 180 252',
    400: '129 140 248',
    500: '99 102 241',
    600: '79 70 229',
    700: '67 56 202',
    800: '55 48 163',
    900: '49 46 129',
    950: '30 27 75',
  },
  purple: {
    50: '250 245 255',
    100: '243 232 255',
    200: '233 213 255',
    300: '216 180 254',
    400: '192 132 252',
    500: '168 85 247',
    600: '147 51 234',
    700: '126 34 206',
    800: '107 33 168',
    900: '88 28 135',
    950: '59 7 100',
  },
};

const themable = (name) =>
  Object.fromEntries(
    Object.entries(stock[name]).map(([shade, rgb]) => [
      shade,
      `rgb(var(--tw-${name}-${shade}, ${rgb}) / <alpha-value>)`,
    ])
  );

const solid = (name, shade) =>
  `rgb(var(--tw-${name}-${shade}, ${stock[name][shade]}))`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  content: [
    './node_modules/@seerr-team/react-tailwindcss-datepicker/dist/index.esm.js',
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      transitionProperty: {
        'max-height': 'max-height',
        width: 'width',
      },
      fontFamily: {
        sans: ['Inter Variable', ...defaultTheme.fontFamily.sans],
        display: ['Unbounded Variable', ...defaultTheme.fontFamily.sans],
        body: ['Manrope Variable', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        gray: themable('gray'),
        indigo: themable('indigo'),
        purple: themable('purple'),
        as: {
          ground: 'rgb(var(--as-ground) / <alpha-value>)',
          surface: 'rgb(var(--as-surface) / <alpha-value>)',
          tile: 'rgb(var(--as-tile) / <alpha-value>)',
          line: 'rgb(var(--as-line) / <alpha-value>)',
          'line-strong': 'rgb(var(--as-line-strong) / <alpha-value>)',
          raised: 'rgb(var(--as-raised) / <alpha-value>)',
          ink: 'rgb(var(--as-ink) / <alpha-value>)',
          'ink-soft': 'rgb(var(--as-ink-soft) / <alpha-value>)',
          'ink-muted': 'rgb(var(--as-ink-muted) / <alpha-value>)',
          'ink-faint': 'rgb(var(--as-ink-faint) / <alpha-value>)',
          accent: 'rgb(var(--as-accent) / <alpha-value>)',
          'accent-soft': 'rgb(var(--as-accent-soft) / <alpha-value>)',
          ok: 'rgb(var(--as-ok) / <alpha-value>)',
          'ok-bg': 'rgb(var(--as-ok-bg) / <alpha-value>)',
          info: 'rgb(var(--as-info) / <alpha-value>)',
          'info-bg': 'rgb(var(--as-info-bg) / <alpha-value>)',
          warn: 'rgb(var(--as-warn) / <alpha-value>)',
          'warn-bg': 'rgb(var(--as-warn-bg) / <alpha-value>)',
          bad: 'rgb(var(--as-bad) / <alpha-value>)',
          'bad-bg': 'rgb(var(--as-bad-bg) / <alpha-value>)',
        },
      },
      typography: () => ({
        DEFAULT: {
          css: {
            color: solid('gray', 300),
            a: {
              color: solid('indigo', 500),
              '&:hover': {
                color: solid('indigo', 400),
              },
            },

            h1: {
              color: solid('gray', 300),
            },
            h2: {
              color: solid('gray', 300),
            },
            h3: {
              color: solid('gray', 300),
            },
            h4: {
              color: solid('gray', 300),
            },
            h5: {
              color: solid('gray', 300),
            },
            h6: {
              color: solid('gray', 300),
            },

            strong: {
              color: solid('gray', 400),
            },

            code: {
              color: solid('gray', 300),
            },

            figcaption: {
              color: solid('gray', 500),
            },
          },
        },
      }),
    },
    aspectRatio: {
      auto: 'auto',
      square: '1 / 1',
      video: '16 / 9',
      1: '1',
      2: '2',
      3: '3',
      4: '4',
      5: '5',
      6: '6',
      7: '7',
      8: '8',
      9: '9',
      10: '10',
      11: '11',
      12: '12',
      13: '13',
      14: '14',
      15: '15',
      16: '16',
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
};
