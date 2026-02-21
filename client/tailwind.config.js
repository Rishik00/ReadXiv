/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0D0D0D',
        surface: '#111111',
        border: '#262626',
        grid: '#1A1A1A',
        foreground: '#E5E5E5',
        muted: '#666666',
        accent: '#EA580C',
        secondary: 'var(--secondary)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      letterSpacing: {
        brutalist: '-0.06em',
        'brutalist-tight': '-0.08em',
      },
    },
  },
  plugins: [],
}
