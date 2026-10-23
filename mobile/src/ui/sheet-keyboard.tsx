import * as React from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * A form in a sheet, scrolling clear of the keyboard, which a drag down the
 * form puts away (Step 203).
 *
 * React Native's KeyboardAvoidingView measures itself from the sheet's top
 * but the keyboard from the screen's, so in a sheet that starts below the
 * status bar it fell short by the sheet's offset: the last fields and the
 * button stayed under the keyboard, out of reach (Steps 198, 203). On the
 * iPhone the scroll view now insets itself, measured on the screen, and
 * brings the field being typed in into view; on Android the sheet is
 * measured on the screen when the keyboard comes up.
 */
export function SheetForm({
  style,
  contentContainerStyle,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const ref = React.useRef<ScrollView>(null);
  const frame = React.useRef<View>(null);
  const content = React.useRef<View>(null);
  // Measured, not from scroll events (the last of those can be dropped),
  // and against the form's own bottom: in a sheet, a view measured "in the
  // window" is measured from the sheet's top, the keyboard from the
  // screen's, so only its height can be trusted. Android's wrapper is
  // already clear of the keyboard.
  const reveal = React.useCallback((view: View | null) => {
    const keyboard = Keyboard.metrics();
    const inner = content.current;
    const box = frame.current;
    if (!view || !keyboard || !inner || !box) return;
    box.measureInWindow((_bx, boxTop, _bw, boxHeight) => {
      const covered = Platform.OS === "ios" ? keyboard.height : 0;
      const clear = boxTop + boxHeight - covered - REVEAL_GAP;
      view.measureInWindow((_x, y, _width, height) => {
        if (y + height <= clear) return;
        view.measureLayout(inner, (_cx, top) => {
          ref.current?.scrollTo({ y: top + height - (clear - boxTop), animated: true });
        });
      });
    });
  }, []);
  const scroll = (
    <View ref={frame} style={styles.fill}>
      <ScrollView
        ref={ref}
        innerViewRef={content as React.RefObject<View>}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <RevealContext.Provider value={reveal}>{children}</RevealContext.Provider>
      </ScrollView>
    </View>
  );
  if (Platform.OS === "ios") return <View style={style}>{scroll}</View>;
  return <MeasuredAvoidingView style={style}>{scroll}</MeasuredAvoidingView>;
}

/** How far above the keyboard something revealed sits. */
const REVEAL_GAP = 12;

const RevealContext = React.createContext<(view: View | null) => void>(() => {});

/**
 * Scrolls the form so a view below the field being typed in (a search's
 * results) clears the keyboard, measured on the screen as the form is.
 */
export function useRevealAboveKeyboard() {
  return React.useContext(RevealContext);
}

function MeasuredAvoidingView({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const view = React.useRef<View>(null);
  const [under, setUnder] = React.useState(0);
  React.useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      view.current?.measureInWindow((_x, y, _width, height) => {
        setUnder(Math.max(0, y + height - e.endCoordinates.screenY));
      });
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => setUnder(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return (
    <View ref={view} style={[style, { paddingBottom: under }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
