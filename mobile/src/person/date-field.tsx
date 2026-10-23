import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { joinDateParts, splitDateParts } from "@/lib/partial-date";
import { font, usePalette } from "@/theme";
import { Chip } from "@/ui/chip";
import { TextField } from "@/ui/text-field";

/**
 * A date as much of it as is known (Steps 17, 63, 203): its year, month
 * and day each in a box, held as the web's form holds it ("1931",
 * "1931-03", "-03-05" for a birthday without its year), and "circa"
 * beside it for a rough one (Step 81).
 */
export function DateField({
  label,
  value,
  onChange,
  circa,
  onCircaChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  circa: boolean;
  onCircaChange: (circa: boolean) => void;
  error?: string;
}) {
  const palette = usePalette();
  const parts = splitDateParts(value);
  const set = (part: keyof typeof parts) => (text: string) =>
    onChange(joinDateParts({ ...parts, [part]: text.replace(/\D/g, "") }));
  return (
    <View style={styles.box}>
      <View style={styles.top}>
        <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
        <Chip label="circa" on={circa} onPress={() => onCircaChange(!circa)} />
      </View>
      <View style={styles.parts}>
        <View style={styles.year}>
          <TextField
            label="Year"
            accessibilityLabel={`${label}, year`}
            value={parts.year}
            onChangeText={set("year")}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        <View style={styles.part}>
          <TextField
            label="Month"
            accessibilityLabel={`${label}, month`}
            value={parts.month}
            onChangeText={set("month")}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.part}>
          <TextField
            label="Day"
            accessibilityLabel={`${label}, day`}
            value={parts.day}
            onChangeText={set("day")}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: palette.destructive }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontFamily: font.medium, fontSize: 14 },
  parts: { flexDirection: "row", gap: 10 },
  year: { flex: 1.4 },
  part: { flex: 1 },
  error: { fontFamily: font.regular, fontSize: 14 },
});
