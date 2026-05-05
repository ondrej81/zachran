import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rohlik: { yellow: "#FFE55A", ink: "#1C2529" },
      },
    },
  },
  plugins: [],
};
export default config;
