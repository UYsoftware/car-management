import type { Config } from "tailwindcss";
const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  darkMode: "media",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), ink: v("ink"), muted: v("muted"), line: v("line"),
        accent: v("accent"), warn: v("warn"), danger: v("danger"), dial: v("dial"), dialink: v("dialink"),
      },
      fontFamily: { sans: ["var(--font-ui)", "system-ui", "sans-serif"] },
      borderRadius: { card: "14px", cell: "5px" },
    },
  },
} satisfies Config;
