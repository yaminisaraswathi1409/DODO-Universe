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
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#0f172a',
          600: '#020617',
          700: '#000000',
          800: '#000000',
          900: '#000000',
        },
        dark: {
          bg: '#ffffff',
          card: '#ffffff',
          border: '#e2e8f0',
        },
        accent: {
          emerald: '#10b981',
          amber: '#f59e0b',
          purple: '#8b5cf6',
          rose: '#f43f5e',
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
