import { useColorScheme } from "react-native";

/**
 * The web's tokens (app/globals.css), as hex: React Native has no oklch.
 * Green and brown belong to the tree; buttons stay near-black (the brand
 * page in Notion, Step 129). Cream is for the home-screen icon only.
 */
const brand = {
  green: "#77b255",
  brown: "#a57939",
};

const light = {
  ...brand,
  background: "#ffffff",
  foreground: "#0a0a0a",
  card: "#ffffff",
  muted: "#f5f5f5",
  mutedForeground: "#737373",
  border: "#e5e5e5",
  primary: "#171717",
  primaryForeground: "#fafafa",
  destructive: "#e7000b",
};

export type Palette = typeof light;

const dark: Palette = {
  ...brand,
  background: "#0a0a0a",
  foreground: "#fafafa",
  card: "#171717",
  muted: "#262626",
  mutedForeground: "#a1a1a1",
  border: "#ffffff1a",
  primary: "#e5e5e5",
  primaryForeground: "#171717",
  destructive: "#ff6467",
};

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

/** Public Sans, as on the web, loaded in the root layout. */
export const font = {
  regular: "PublicSans_400Regular",
  medium: "PublicSans_500Medium",
  semibold: "PublicSans_600SemiBold",
};

/** The phone's side gutter. */
export const GUTTER = 16;
