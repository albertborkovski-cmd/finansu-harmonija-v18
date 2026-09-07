/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'main-orange': '#FF6200',
        'main-blue': '#007EA7',
        'grey': '#767676',
        'grey-100': '#FFFFFF',
        'grey-500': '#10233A',
        'grey-600': '#A1B6C6',
        'grey-700': '#7288A3',
        'border-grey': '#D3E1EC',
        'black': '#161616',
        'btn-disabled': '#F5F5F5',
        'btn-disabled-text': '#9D9D9D',
      },
      fontFamily: {
        montserrat: ['Montserrat', 'sans-serif'],
      },
      fontSize: {
        'body-s': ['12px', '18px'],
        'body-m': ['14px', '20px'],
        'body-l': ['16px', '24px'],
      },
    },
  },
  plugins: [],
};
