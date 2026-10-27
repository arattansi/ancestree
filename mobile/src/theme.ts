import { useColorScheme } from "react-native";

/**
 * The web's tokens (app/globals.css), as hex: React Native has no oklch.
 * Green and brown belong to the tree; buttons stay near-black (the brand
 * page in Notion, Step 129). Cream is for the home-screen icon only.
 */
const brand = {
  green: "#77b255",
  brown: "#a57939",
  /**
   * The apples' red (`--brand-red`, the apple in the mark): something new
   * on the menu bar (Step 209).
   */
  red: "#e8452c",
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
  /** The button that deletes, under white words (the web's destructive-solid). */
  destructiveSolid: "#e7000b",
  /** The web's `bg-attention/20`: a notice to act on, such as a changed code. */
  attentionWash: "#fcf6d8",
  /**
   * A relative's gray pill on the leaf view (Step 179.2), its edge, and the
   * dark disc its initials are cut out of.
   */
  pill: "#e8e8e8",
  pillBorder: "#d6d6d6",
  pillInk: "#525252",
  /** The canvas's dots, as React Flow draws the web's. */
  grid: "#91919a",
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
  // The web's `dark:bg-destructive/60`, over the background.
  destructiveSolid: "#9d4042",
  attentionWash: "#38301a",
  pill: "#262626",
  pillBorder: "#ffffff1a",
  pillInk: "#a3a3a3",
  grid: "#555555",
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
