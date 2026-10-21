import * as React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * A form in a sheet, kept clear of the keyboard (Step 198). On Android,
 * React Native's KeyboardAvoidingView measures itself from the sheet's top
 * but the keyboard from the screen's, so a sheet that starts below the
 * status bar left its last field and button under the keyboard. This
 * measures the sheet on the screen when the keyboard comes up. The iPhone
 * keeps the KeyboardAvoidingView it had.
 */
export function SheetKeyboardAvoidingView({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView behavior="padding" style={style}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <MeasuredAvoidingView style={style}>{children}</MeasuredAvoidingView>;
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
