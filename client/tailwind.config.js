/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        grid: 'var(--surface)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        accent: 'var(--secondary)',
        secondary: 'var(--secondary)',
        primary: 'var(--primary)',
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
