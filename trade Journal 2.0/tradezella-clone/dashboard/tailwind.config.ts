import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark trading-app palette
        surface: {
          DEFAULT: "#0f1117",
          card: "#1a1d27",
          border: "#2a2d3a",
          hover: "#222536",
        },
        accent: {
          DEFAULT: "#6366f1", // indigo
          hover: "#4f46e5",
        },
        success: "#22c55e",
        danger: "#ef4444",
        muted: "#6b7280",
      },
    },
  },
  plugins: [],
};

export default config;
