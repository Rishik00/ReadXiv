import typography from '@tailwindcss/typography'

const cssVariableColor = (variable) => ({ opacityValue }) => {
  if (opacityValue === undefined) return `var(${variable})`
  const numericOpacity = Number(opacityValue)
  const percentage = Number.isFinite(numericOpacity)
    ? `${numericOpacity * 100}%`
    : `calc(${opacityValue} * 100%)`
  return `color-mix(in srgb, var(${variable}) ${percentage}, transparent)`
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'view-fade': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(-8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'backdrop-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'stagger-fade': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'lip-in': {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'actions-in': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'toast-progress': {
          '0%':   { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'view-fade': 'view-fade 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 0.35s ease-out',
        'modal-in': 'modal-in 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        'backdrop-in': 'backdrop-in 0.2s ease-out',
        'toast-in': 'toast-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'stagger-fade': 'stagger-fade 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'lip-in': 'lip-in 0.25s linear forwards',
        'actions-in': 'actions-in .22s cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-progress': 'toast-progress 2.6s linear forwards',
      },
      colors: {
        canvas: cssVariableColor('--canvas'),
        'surface-1': cssVariableColor('--surface-1'),
        'surface-2': cssVariableColor('--surface-2'),
        text: cssVariableColor('--text'),
        'text-muted': cssVariableColor('--text-muted'),
        'text-subtle': cssVariableColor('--text-subtle'),
        accent: cssVariableColor('--accent'),
        'on-accent': cssVariableColor('--on-accent'),
        divider: cssVariableColor('--divider'),
        'control-border': cssVariableColor('--control-border'),
        'focus-ring': cssVariableColor('--focus-ring'),
        success: cssVariableColor('--success'),
        warning: cssVariableColor('--warning'),
        danger: cssVariableColor('--danger'),
        // Compatibility names for incremental migration.
        background: cssVariableColor('--background'),
        surface: cssVariableColor('--surface'),
        border: cssVariableColor('--border'),
        grid: cssVariableColor('--surface'),
        foreground: cssVariableColor('--foreground'),
        muted: cssVariableColor('--muted'),
        secondary: cssVariableColor('--secondary'),
        'button-on-secondary': cssVariableColor('--button-on-secondary'),
      },
      fontFamily: {
        sans: ['var(--font-ui)'],
        ui: ['var(--font-ui)'],
        serif: ['var(--font-display)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-code)'],
        code: ['var(--font-code)'],
      },
      fontSize: {
        'very-small': ['var(--font-size-very-small)', { lineHeight: 'var(--line-height-very-small)' }],
        small: ['var(--font-size-small)', { lineHeight: 'var(--line-height-small)' }],
        medium: ['var(--font-size-medium)', { lineHeight: 'var(--line-height-medium)' }],
        large: ['var(--font-size-large)', { lineHeight: 'var(--line-height-large)' }],
        'very-large': ['var(--font-size-very-large)', { lineHeight: 'var(--line-height-very-large)' }],
        'extra-large': ['var(--font-size-extra-large)', { lineHeight: 'var(--line-height-extra-large)' }],
        display: ['var(--font-size-display)', { lineHeight: 'var(--line-height-display)' }],
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius-small)',
        sm: 'var(--radius-small)',
        md: 'var(--radius-medium)',
        lg: 'var(--radius-medium)',
        xl: 'var(--radius-large)',
        '2xl': 'var(--radius-large)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
      },
      maxWidth: {
        'content-small': 'var(--content-small)',
        'content-medium': 'var(--content-medium)',
        'content-large': 'var(--content-large)',
        'content-extra-large': 'var(--content-extra-large)',
        reading: 'var(--reading-measure)',
      },
      letterSpacing: {
        brutalist: '-0.06em',
        'brutalist-tight': '-0.08em',
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'var(--foreground)',
            '--tw-prose-headings': 'var(--foreground)',
            '--tw-prose-lead': 'var(--muted)',
            '--tw-prose-links': 'var(--secondary)',
            '--tw-prose-bold': 'var(--foreground)',
            '--tw-prose-counters': 'var(--muted)',
            '--tw-prose-bullets': 'var(--muted)',
            '--tw-prose-hr': 'var(--border)',
            '--tw-prose-quotes': 'var(--foreground)',
            '--tw-prose-quote-borders': 'var(--secondary)',
            '--tw-prose-captions': 'var(--muted)',
            '--tw-prose-code': 'var(--foreground)',
            '--tw-prose-pre-code': 'var(--foreground)',
            '--tw-prose-pre-bg': 'var(--surface)',
            '--tw-prose-th-borders': 'var(--border)',
            '--tw-prose-td-borders': 'var(--border)',
          },
        },
      },
    },
  },
  plugins: [typography],
}
