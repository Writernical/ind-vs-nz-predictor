/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Racing Sans One", "cursive"],
        body: ["Outfit", "sans-serif"],
      },
      colors: {
        brand: {
          gold: "#f59e0b",
          goldLight: "#fbbf24",
          dark: "#0b0f1a",
          card: "rgba(255,255,255,0.04)",
        },
      },
    },
  },
  plugins: [],
};
