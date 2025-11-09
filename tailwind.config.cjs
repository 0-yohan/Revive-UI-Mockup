/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "brand-green": "#00B386",
        "brand-red": "#E55C5C",
        "brand-blue": "#3E8EFA",
        "brand-yellow": "#FFC857",
      },
      boxShadow: {
        soft: "0 4px 16px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
