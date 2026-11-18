import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#000000",
        panel: "#061015",
        raised: "#0A1A21",
        line: "rgba(34, 211, 238, 0.14)",
        cyan: { DEFAULT: "#22D3EE", soft: "#67E8F9", deep: "#0E7490" },
        mist: "#9FB3BC",
        paper: "#E6F1F4",
        warn: "#F5B94A",
        bad: "#F26D6D",
        good: "#4ADE9B",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { panel: "14px" },
    },
  },
  plugins: [],
};
export default config;
