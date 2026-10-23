import * as React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { PlaceChoice } from "@/lib/entry-edit";
import { searchPlaces, type PlaceOption } from "@/person/edit";
import { font, usePalette } from "@/theme";
import { useRevealAboveKeyboard } from "@/ui/sheet-keyboard";
import { TextField } from "@/ui/text-field";

/** How long typing rests before the search goes out. */
const REST_MS = 250;

/**
 * A place, searched for as it's typed and picked from what the search finds
 * (Step 203), as the web's picker does: only a place that's found can be
 * kept. The places found scroll up clear of the keyboard and stay when it's
 * put away, until one's picked; a name that finds nothing goes back to the
 * place there was. Emptied, the place is taken away. `onPicking` says while
 * a name is typed and nothing picked, which the form won't save over.
 */
export function PlaceField({
  label,
  shown,
  onChange,
  onPicking,
}: {
  label: string;
  /** The place as the entry keeps it now, or "". */
  shown: string;
  onChange: (place: PlaceChoice) => void;
  onPicking: (picking: boolean) => void;
}) {
  const palette = usePalette();
  const reveal = useRevealAboveKeyboard();
  const results = React.useRef<View>(null);
  const [typed, setTyped] = React.useState(shown);
  const [found, setFound] = React.useState<PlaceOption[] | null>(null);
  const [looking, setLooking] = React.useState(false);
  const searching = typed.trim() !== shown && typed.trim().length >= 2;

  React.useEffect(() => {
    onPicking(searching);
  }, [searching, onPicking]);

  React.useEffect(() => {
    if (!searching) return;
    let live = true;
    const timer = setTimeout(() => {
      setLooking(true);
      searchPlaces(typed)
        .then((places) => live && setFound(places))
        .catch(() => live && setFound([]))
        .finally(() => live && setLooking(false));
    }, REST_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typed, searching]);

  const pick = (place: PlaceOption) => {
    onChange({ id: place.id, city: place.city, country: place.country, label: place.kept });
    setTyped(place.kept);
    setFound(null);
  };

  return (
    <View style={styles.box}>
      <TextField
        label={label}
        value={typed}
        onChangeText={(text) => {
          setTyped(text);
          if (!text.trim()) {
            setFound(null);
            if (shown) onChange(null);
          }
        }}
        onBlur={() => {
          if (found?.length) return;
          setTyped(shown);
          setFound(null);
        }}
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="search"
      />
      {searching && found ? (
        <View ref={results} onLayout={() => reveal(results.current)}>
          {found.map((place) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              onPress={() => pick(place)}
              style={({ pressed }) => [
                styles.row,
                { borderColor: palette.border },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={[styles.rowText, { color: palette.foreground }]}>{place.label}</Text>
            </Pressable>
          ))}
          {found.length === 0 && !looking ? (
            <Text style={[styles.none, { color: palette.mutedForeground }]}>
              No place by that name.
            </Text>
          ) : null}
        </View>
      ) : searching && looking ? (
        <ActivityIndicator color={palette.mutedForeground} style={styles.looking} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  row: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontFamily: font.regular, fontSize: 16 },
  none: { fontFamily: font.regular, fontSize: 15, paddingVertical: 8 },
  looking: { alignSelf: "flex-start", paddingVertical: 8 },
});
