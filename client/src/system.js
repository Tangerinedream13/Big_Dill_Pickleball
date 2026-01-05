import { createSystem, defaultConfig } from "@chakra-ui/react";

const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      colors: {
        club: {
          900: { value: "#0B2E1D" },
          800: { value: "#123B27" },
          700: { value: "#1B5E3A" },
          600: { value: "#2F7D4E" },
          500: { value: "#3F9A61" },
          100: { value: "#EAF6EE" },
        },
        pickle: {
          500: { value: "#B7F34A" },
          200: { value: "#E6FFB8" },
        },
        cream: {
          50: { value: "#FBFAF7" },
        },
        border: {
          DEFAULT: { value: "#E6E2DA" },
        },
      },

      radii: {
        xl: { value: "16px" },
        "2xl": { value: "22px" },
        pill: { value: "999px" },
      },

      shadows: {
        soft: { value: "0 10px 30px rgba(11, 46, 29, 0.08)" },
        lift: { value: "0 14px 40px rgba(11, 46, 29, 0.12)" },
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
        },
        fg: {
          default: { value: "{colors.club.900}" },
        },
        accent: {
          solid: { value: "{colors.club.700}" },
          hover: { value: "{colors.club.800}" },
        },
        highlight: {
          value: "{colors.pickle.500}" },
      },
    },
  },
});

export default system;