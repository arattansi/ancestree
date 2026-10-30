import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import * as React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { CARD_VOICE_SECONDS } from "@/lib/birthday-cards";
import { formatDuration } from "@/lib/story-audio";
import type { Voice } from "@/cards/cards";
import { font, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { PauseIcon, PlayIcon, XIcon } from "@/ui/icons";

/**
 * A voice memo as the card keeps one: speech-sized AAC in an .m4a, one
 * channel, as the web shrinks a recording (`prepareStoryAudio`). Two
 * minutes is under 2 MB.
 */
const VOICE: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
  },
};

/**
 * Recording a voice memo for a birthday card on the phone (Step 217.4,
 * `expo-audio`; the scribe's recognizer records only for its words).
 * Record, speak, stop; it stops itself at two minutes. Then it can be
 * listened to, recorded again or removed.
 */
export function VoiceRecorder({
  value,
  onChange,
  disabled,
}: {
  value: Voice | null;
  onChange: (voice: Voice | null) => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  const [denied, setDenied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // A finished take reports no length: the last one seen while recording.
  const [lastSeconds, setLastSeconds] = React.useState(0);
  const recorder = useAudioRecorder(VOICE);
  // It stops itself at two minutes; however it stops, the take is kept.
  React.useEffect(() => {
    const finished = recorder.addListener("recordingStatusUpdate", (status) => {
      if (!status.isFinished) return;
      void setAudioModeAsync({ allowsRecording: false });
      if (status.url && !status.hasError) {
        onChange({ kind: "new", uri: status.url, seconds: Math.min(CARD_VOICE_SECONDS, lastSeconds) });
      } else {
        setFailed(true);
      }
    });
    return () => finished.remove();
  }, [recorder, onChange, lastSeconds]);
  const state = useAudioRecorderState(recorder, 250);
  const elapsed = state.durationMillis / 1000;
  if (state.isRecording && elapsed > lastSeconds) setLastSeconds(elapsed);

  async function start() {
    setFailed(false);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      setLastSeconds(0);
      recorder.record({ forDuration: CARD_VOICE_SECONDS });
    } catch {
      setFailed(true);
    }
  }

  if (state.isRecording) {
    return (
      <View style={[styles.recording, { borderColor: palette.destructive }]}>
        <View style={[styles.dot, { backgroundColor: palette.destructive }]} />
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.time, { color: palette.foreground }]}
        >
          recording · {formatDuration(elapsed)} of {formatDuration(CARD_VOICE_SECONDS)}
        </Text>
        <Button variant="outline" label="stop" onPress={() => void recorder.stop().catch(() => setFailed(true))} />
      </View>
    );
  }

  if (value) {
    return (
      <View style={styles.row}>
        <VoicePlayer
          url={value.kind === "new" ? value.uri : value.url}
          seconds={value.seconds}
          name="your"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="remove voice memo"
          disabled={disabled}
          hitSlop={8}
          onPress={() => onChange(null)}
          style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}
        >
          <XIcon size={18} color={palette.foreground} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.start}>
      <Button variant="outline" label="record a voice memo" disabled={disabled} onPress={() => void start()} />
      {denied ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openSettings()}>
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            The microphone is off for ancestree. Turn it on in Settings.
          </Text>
        </Pressable>
      ) : null}
      {failed ? (
        <Text style={[styles.note, { color: palette.destructive }]}>Couldn’t record. Try again.</Text>
      ) : null}
    </View>
  );
}

/**
 * A voice memo to listen to: play and pause, how far through, how long.
 * `name` says whose to a screen reader ("Ada’s", "your").
 */
export function VoicePlayer({
  url,
  seconds,
  name,
}: {
  url: string | null;
  seconds: number | null;
  name: string;
}) {
  const palette = usePalette();
  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);
  if (!url) {
    return (
      <Text style={[styles.note, { color: palette.mutedForeground }]}>
        the voice memo couldn’t be loaded.
      </Text>
    );
  }
  const playing = status.playing;
  const done = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  return (
    <View style={[styles.player, { borderColor: palette.kraftLine, backgroundColor: palette.background }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${playing ? "pause" : "play"} ${name} voice memo`}
        onPress={() => {
          if (playing) {
            player.pause();
            return;
          }
          if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) {
            void player.seekTo(0);
          }
          void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
          player.play();
        }}
        style={({ pressed }) => [
          styles.play,
          { backgroundColor: palette.primary },
          pressed && { opacity: 0.8 },
        ]}
      >
        {playing ? (
          <PauseIcon size={16} color={palette.primaryForeground} />
        ) : (
          <PlayIcon size={16} color={palette.primaryForeground} />
        )}
      </Pressable>
      <View style={[styles.track, { backgroundColor: palette.kraft }]}>
        <View style={[styles.done, { width: `${Math.round(done * 100)}%`, backgroundColor: palette.brown }]} />
      </View>
      <Text style={[styles.length, { color: palette.mutedForeground }]}>
        {seconds !== null ? formatDuration(seconds) : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  recording: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  time: { flex: 1, fontFamily: font.regular, fontSize: 15, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  remove: { padding: 6 },
  start: { gap: 6, alignItems: "flex-start" },
  note: { fontFamily: font.regular, fontSize: 14 },
  player: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 16,
  },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden", opacity: 0.6 },
  done: { height: 6, borderRadius: 3 },
  length: { fontFamily: font.regular, fontSize: 13, fontVariant: ["tabular-nums"] },
});
