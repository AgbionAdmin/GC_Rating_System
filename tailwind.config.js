/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#e8ecf2',
          100: '#c5cfe0',
          200: '#9aafc9',
          300: '#6f8fb2',
          400: '#4f769f',
          500: '#2f5e8c',
          600: '#234d79',
          700: '#1a3a60',
          800: '#162d4d',
          900: '#1a2333',
          950: '#111827',
        },
        brand: {
          50: '#fef3ee',
          100: '#fde3d2',
          200: '#fbc4a5',
          300: '#f89c6d',
          400: '#f46b33',
          500: '#c8401a',
          600: '#b03515',
          700: '#932c12',
          800: '#7a2510',
          900: '#65200f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
