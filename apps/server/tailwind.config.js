/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2A5C33',
          light: '#3A7A45',
          dark: '#1C3E23',
        },
        mint: {
          DEFAULT: '#E2EFE0',
          dark: '#C8DFC5',
        },
        leaf: '#5CB85C',
        bio: '#FAFDF9',
      },
    },
  },
  plugins: [],
};
