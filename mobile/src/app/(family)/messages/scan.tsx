import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { linkFragment, messenger } from "@/messages/store";
import { Notice, Words } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { HeaderButton } from "@/ui/header";
import { XIcon } from "@/ui/icons";

/**
 * Link this phone by scanning the code another device shows under Message
 * Security (Step 179.1): the code is the web's link, `…/messages/link#`
 * the transfer's id and the one-time key that opens it. The camera is
 * asked for only here.
 */
export default function Scan() {
  const palette = usePalette();
  // The root's insets: a full-screen modal's own safe area comes back
  // empty on iOS 27.
  const insets = useSafeAreaInsets();
  const screen = [
    styles.safe,
    { backgroundColor: palette.background, paddingTop: insets.top, paddingBottom: insets.bottom },
  ];
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = React.useState<
    { kind: "looking" } | { kind: "linking" } | { kind: "failed"; message: string }
  >({ kind: "looking" });
  // One code at a time: the camera reports the same one many times a second.
  const taking = React.useRef(false);

  async function onScanned({ data }: BarcodeScanningResult) {
    if (taking.current) return;
    const fragment = linkFragment(data);
    if (!fragment) return;
    taking.current = true;
    setState({ kind: "linking" });
    const problem = await messenger.takeDeviceLink(fragment);
    if (!problem) {
      router.back();
      return;
    }
    setState({ kind: "failed", message: problem });
  }

  const close = (
    <View style={styles.close}>
      <HeaderButton label="Close" onPress={() => router.back()}>
        <XIcon color={palette.foreground} />
      </HeaderButton>
    </View>
  );

  if (!permission) {
    return (
      <View style={screen}>
        {close}
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={screen}>
        {close}
        <Notice>
          <Words center>Scanning the code needs the camera.</Words>
          {permission.canAskAgain ? (
            <Button label="allow camera" onPress={() => void requestPermission()} />
          ) : (
            <>
              <Words muted center>
                Turn on the camera for ancestree in Settings.
              </Words>
              <Button label="open settings" onPress={() => void Linking.openSettings()} />
            </>
          )}
        </Notice>
      </View>
    );
  }

  return (
    <View style={screen}>
      {close}
      <View style={styles.body}>
        <Text style={[styles.title, { color: palette.foreground }]}>Scan the Code</Text>
        <Words muted center>
          On your other device, open messages, choose the lock, then link a device.
        </Words>
        <View style={[styles.frame, { borderColor: palette.border }]}>
          {state.kind === "looking" ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(result) => void onScanned(result)}
            />
          ) : state.kind === "linking" ? (
            <View style={styles.centre}>
              <ActivityIndicator color={palette.mutedForeground} />
              <Words muted>Linking this phone…</Words>
            </View>
          ) : (
            <View style={styles.centre}>
              <Words center>{state.message}</Words>
              <Button
                variant="outline"
                label="scan again"
                onPress={() => {
                  taking.current = false;
                  setState({ kind: "looking" });
                }}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  close: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: GUTTER - 12 },
  body: { flex: 1, alignItems: "center", paddingHorizontal: GUTTER + 8, gap: 12 },
  title: { fontFamily: font.semibold, fontSize: 22 },
  frame: {
    marginTop: 12,
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: GUTTER },
});
