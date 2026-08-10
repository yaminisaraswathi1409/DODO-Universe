/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        dark: {
          bg: '#090d16',
          card: 'rgba(15, 23, 42, 0.75)',
          border: 'rgba(255, 255, 255, 0.1)',
        },
        accent: {
          emerald: '#10b981',
          amber: '#f59e0b',
          purple: '#8b5cf6',
        }
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'Inter', 'sans-serif'],
      },
      backdropBlur: {
        glass: '16px',
      }
    },
  },
  plugins: [],
}
