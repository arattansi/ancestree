import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";

import { font, usePalette } from "@/theme";

/**
 * A button, near-black as on the web. Its words are lower-case, as every
 * button's are (Step 102); a link-drawn one (`variant="link"`) keeps
 * sentence case.
 */
export function Button({
  label,
  variant = "primary",
  busy = false,
  disabled,
  ...rest
}: Omit<PressableProps, "children"> & {
  label: string;
  variant?: "primary" | "outline" | "link";
  busy?: boolean;
}) {
  const palette = usePalette();
  const off = disabled || busy;
  const primary = variant === "primary";
  const link = variant === "link";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy }}
      disabled={off}
      style={({ pressed }) => [
        styles.base,
        link && styles.link,
        primary && { backgroundColor: palette.primary },
        variant === "outline" && {
          borderColor: palette.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
        (pressed || off) && { opacity: off ? 0.5 : 0.8 },
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator
          color={primary ? palette.primaryForeground : palette.foreground}
        />
      ) : (
        <Text
          style={[
            styles.label,
            {
              color: primary ? palette.primaryForeground : palette.foreground,
            },
            link && { textDecorationLine: "underline", fontFamily: font.regular },
          ]}
        >
          {link ? label : label.toLowerCase()}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  link: { minHeight: 44, paddingHorizontal: 4 },
  label: { fontFamily: font.medium, fontSize: 16 },
});
