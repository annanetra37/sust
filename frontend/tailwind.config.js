/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef7ff', 100: '#d9ecff', 200: '#bbddff', 300: '#8cc8ff', 400: '#54a8ff', 500: '#2c83ff', 600: '#1560f5', 700: '#0e4be1', 800: '#113db6', 900: '#14378f', 950: '#112357' },
        esg: { e: '#10b981', s: '#6366f1', g: '#f59e0b' },
      },
    },
  },
  plugins: [],
};
