import * as React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { font, usePalette } from "@/theme";

/** A labelled box. The form is its labels: no helper lines (Step 75). */
export const TextField = React.forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string | null }
>(function TextField({ label, error, style, ...rest }, ref) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={palette.mutedForeground}
        style={[
          styles.input,
          {
            color: palette.foreground,
            borderColor: error ? palette.destructive : palette.border,
            backgroundColor: palette.card,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: palette.destructive }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontFamily: font.medium, fontSize: 14 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    fontSize: 17,
  },
  error: { fontFamily: font.regular, fontSize: 14 },
});
