// client/src/theme.js
import { createSystem, defaultConfig } from "@chakra-ui/react";

const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      colors: {
        // Country-club greens (primary)
        club: {
          900: { value: "#0A2418" }, // deep evergreen
          800: { value: "#113527" },
          700: { value: "#1B4A36" },
          600: { value: "#2B6246" },
          500: { value: "#3C7A57" },
          100: { value: "#EAF4EE" }, // subtle mint-cream tint
        },

        // Muted vintage gold (accent)
        gold: {
          700: { value: "#7A5A1F" },
          600: { value: "#8F6A26" },
          500: { value: "#A67A2B" }, // primary gold accent
          200: { value: "#EFE3C7" },
          100: { value: "#F6EEDC" },
        },

        // Cream canvas + warm neutrals
        cream: {
          50: { value: "#FBFAF6" },
          100: { value: "#F5F1E7" },
        },

        // Warm border + subtle ink
        border: {
          DEFAULT: { value: "#E6E0D5" },
        },
        ink: {
          900: { value: "#1A1A1A" },
          700: { value: "#2D2D2D" },
        },

        // Keep pickle around if you still want a “fun” accent sometimes
        // (but don’t use it as your main highlight anymore)
        pickle: {
          500: { value: "#B7F34A" },
          200: { value: "#E6FFB8" },
        },
      },

      radii: {
        xl: { value: "16px" },
        "2xl": { value: "22px" },
        pill: { value: "999px" },
      },

      shadows: {
        soft: { value: "0 10px 30px rgba(10, 36, 24, 0.08)" },
        lift: { value: "0 14px 40px rgba(10, 36, 24, 0.12)" },
      },

      fonts: {
        heading: {
          value: "'Inter', system-ui, -apple-system, Segoe UI, sans-serif",
        },
        body: {
          value: "'Inter', system-ui, -apple-system, Segoe UI, sans-serif",
        },
      },
    },

    semanticTokens: {
      colors: {
        bg: {
          canvas: { value: "{colors.cream.50}" },
          surface: { value: "white" },
          subtle: { value: "{colors.cream.100}" },
        },
        fg: {
          default: { value: "{colors.club.900}" },
          muted: { value: "{colors.ink.700}" },
        },

        // Primary CTA “country club green”
        accent: {
          solid: { value: "{colors.club.900}" },
          hover: { value: "{colors.club.800}" },
        },

        // Highlight for badges/lines/accents = gold
        highlight: {
          value: "{colors.gold.500}",
        },

        // Borders
        border: {
          subtle: { value: "{colors.border}" },
        },
      },
    },
  },
});

export default system;
