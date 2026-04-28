import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "hsl(var(--canvas))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        income: "hsl(var(--income))",
        expense: "hsl(var(--expense))",
        runway: "hsl(var(--runway))",
        "savings-rate": "hsl(var(--savings-rate))",
      },
      borderRadius: {
        bento: "22px",
        "bento-inner": "10px",
      },
      boxShadow: {
        bento: "0 2px 24px -4px rgba(0, 0, 0, 0.06), 0 1px 4px -1px rgba(0, 0, 0, 0.03)",
        "bento-hover": "0 4px 32px -4px rgba(0, 0, 0, 0.10), 0 2px 8px -2px rgba(0, 0, 0, 0.04)",
      },
      fontFamily: {
        sans: [
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
