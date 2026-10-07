import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#132238",
        ocean: "#195B8A",
        skyline: "#E8F2F8",
        mint: "#E8F7EF",
        amber: "#FFF4D8",
        signal: "#D94848"
      },
      boxShadow: {
        soft: "0 12px 32px rgba(19, 34, 56, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
