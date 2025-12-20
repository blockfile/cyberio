/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        cyberway: ['"CyberwayRiders"', "sans-serif"],

        play: ['"Chakra Petch"', "serif"],
        russo: ['"Russo One"', "sans-serif"],
        audiowide: ['"Audiowide"', "cursive"],
        pressstart: ['"Press Start 2P"', "cursive"],
        quantico: ['"Quantico"', "sans-serif"],
        sharetech: ['"Share Tech"', "sans-serif"],
        silkscreen: ['"Silkscreen"', "sans-serif"],
      },
      animation: {
        "spin-slow": "spin 20s linear infinite",
        flicker: "flicker 1.5s infinite alternate",
      },
      keyframes: {
        flicker: {
          "0%": { opacity: "1", filter: "drop-shadow(0 0 5px)" },
          "50%": { opacity: "0.8", filter: "drop-shadow(0 0 15px)" },
          "100%": { opacity: "1", filter: "drop-shadow(0 0 5px)" },
        },
      },
    },
  },
  plugins: [],
};
