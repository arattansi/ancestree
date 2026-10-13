import * as React from "react";
import { Platform } from "react-native";

import {
  hear,
  heardText,
  NOTHING_HEARD,
  settle,
  type Heard,
} from "@/lib/scribe-heard";
import { speech } from "@/scribe/speech";

/**
 * How long one story's recording runs at most: twelve minutes of 16 kHz,
 * 16-bit mono is 23 MB, under the `stories` bucket's 25.
 */
export const LISTEN_MAX_SECONDS = 12 * 60;

export type ListenPhase =
  | "idle"
  | "starting"
  | "listening"
  | "pausing"
  | "paused"
  | "finishing"
  | "done";

type Session = { locale: string; hints: string[]; onDevice: boolean };

/**
 * Listening to someone tell a story (Step 148): the phone's recognizer
 * hears it as they go, and keeps a recording of each stretch between
 * pauses. A recognizer stops on its own now and then (a long silence, the
 * minute an iPhone gives a language it can't hear on the phone itself);
 * listening carries on in a new session, so the teller needn't notice.
 */
export function useListening({
  onDone,
}: {
  /** Listening is over: everything heard, and the recordings, in order. */
  onDone: (heard: string, recordings: string[]) => void;
}) {
  const [phase, setPhase] = React.useState<ListenPhase>("idle");
  const [heard, setHeardState] = React.useState<Heard>(NOTHING_HEARD);
  const heardNow = React.useRef<Heard>(NOTHING_HEARD);
  const setHeard = React.useCallback((next: Heard | ((h: Heard) => Heard)) => {
    heardNow.current =
      typeof next === "function" ? next(heardNow.current) : next;
    setHeardState(heardNow.current);
  }, []);
  const onDoneNow = React.useRef(onDone);
  React.useEffect(() => {
    onDoneNow.current = onDone;
  });
  const [problem, setProblem] = React.useState<string | null>(null);
  const [seconds, setSeconds] = React.useState(0);

  const phaseNow = React.useRef<ListenPhase>("idle");
  const session = React.useRef<Session | null>(null);
  const recordings = React.useRef<string[]>([]);
  /** Time spent listening in sessions that have ended. */
  const spentMs = React.useRef(0);
  const startedAt = React.useRef<number | null>(null);
  /** Sessions in a row that ended within moments: something's wrong. */
  const quickEnds = React.useRef(0);
  /** Why the last session ended, when it shouldn't carry on. */
  const stopped = React.useRef(false);
  /** A session called off by `reset`, whose last events are ignored. */
  const discarding = React.useRef(false);

  const go = React.useCallback((next: ListenPhase) => {
    phaseNow.current = next;
    setPhase(next);
    if (next === "done") {
      onDoneNow.current(heardText(heardNow.current), [...recordings.current]);
    }
  }, []);

  const begin = React.useCallback(() => {
    const s = session.current;
    if (!speech || !s) return;
    const module = speech.ExpoSpeechRecognitionModule;
    module.start({
      lang: s.locale,
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: s.onDevice,
      addsPunctuation: true,
      iosTaskHint: "dictation",
      contextualStrings: s.hints,
      recordingOptions: module.supportsRecording()
        ? {
            persist: true,
            outputSampleRate: 16000,
            outputEncoding: "pcmFormatInt16",
          }
        : undefined,
    });
  }, []);

  React.useEffect(() => {
    if (!speech) return;
    const module = speech.ExpoSpeechRecognitionModule;
    const subscriptions = [
      module.addListener("start", () => {
        startedAt.current = Date.now();
        if (phaseNow.current === "starting") go("listening");
      }),
      module.addListener("result", (event) => {
        if (discarding.current) return;
        setHeard((h) =>
          hear(h, event.results[0]?.transcript ?? "", event.isFinal),
        );
      }),
      module.addListener("audioend", (event) => {
        if (event.uri && !discarding.current)
          recordings.current.push(event.uri);
      }),
      module.addListener("error", (event) => {
        if (discarding.current) return;
        switch (event.error) {
          // Silence, or a stop asked for: listening carries on, or doesn't.
          case "no-speech":
          case "speech-timeout":
          case "aborted":
            return;
          case "language-not-supported":
            // Not on the phone itself: let the recognizer use the network.
            if (session.current?.onDevice) {
              session.current = { ...session.current, onDevice: false };
              return;
            }
            setProblem("This phone can’t listen for that language.");
            break;
          case "not-allowed":
            setProblem(
              "Allow the microphone and speech recognition for ancestree in Settings.",
            );
            break;
          case "network":
            setProblem("It needs a connection to listen for that language.");
            break;
          case "interrupted":
            setProblem("Paused for a call.");
            break;
          default:
            setProblem("It stopped listening.");
        }
        stopped.current = true;
      }),
      module.addListener("end", () => {
        if (discarding.current) {
          discarding.current = false;
          return;
        }
        const lasted = startedAt.current ? Date.now() - startedAt.current : 0;
        spentMs.current += lasted;
        startedAt.current = null;
        setHeard(settle);
        const was = phaseNow.current;
        if (was === "finishing") return go("done");
        if (was === "pausing") return go("paused");
        if (was !== "listening" && was !== "starting") return;
        // It ended by itself.
        if (stopped.current) {
          stopped.current = false;
          return go("paused");
        }
        if (spentMs.current >= LISTEN_MAX_SECONDS * 1000) return go("done");
        quickEnds.current = lasted < 2000 ? quickEnds.current + 1 : 0;
        if (quickEnds.current >= 3) {
          quickEnds.current = 0;
          setProblem("It stopped listening.");
          return go("paused");
        }
        go("starting");
        begin();
      }),
    ];
    return () => {
      subscriptions.forEach((s) => s.remove());
      if (
        ["starting", "listening", "pausing", "finishing"].includes(
          phaseNow.current,
        )
      ) {
        module.abort();
      }
    };
  }, [begin, go, setHeard]);

  const finish = React.useCallback(() => {
    if (!speech) return;
    const was = phaseNow.current;
    if (was === "paused") return go("done");
    if (was === "listening" || was === "starting" || was === "pausing") {
      go("finishing");
      speech.ExpoSpeechRecognitionModule.stop();
    }
  }, [go]);

  // The clock, and the stop at the most a recording may run.
  React.useEffect(() => {
    if (phase !== "listening") return;
    const tick = setInterval(() => {
      const ms =
        spentMs.current +
        (startedAt.current ? Date.now() - startedAt.current : 0);
      setSeconds(Math.floor(ms / 1000));
      if (ms >= LISTEN_MAX_SECONDS * 1000) finish();
    }, 250);
    return () => clearInterval(tick);
  }, [phase, finish]);

  const start = React.useCallback(
    async (locale: string, hints: string[]) => {
      if (!speech || phaseNow.current !== "idle") return;
      const module = speech.ExpoSpeechRecognitionModule;
      setProblem(null);
      const allowed = await module.requestPermissionsAsync();
      if (!allowed.granted) {
        setProblem(
          "Allow the microphone and speech recognition for ancestree in Settings.",
        );
        return;
      }
      session.current = {
        locale,
        hints: hints.slice(0, 100),
        onDevice: Platform.OS === "ios" && module.supportsOnDeviceRecognition(),
      };
      go("starting");
      begin();
    },
    [begin, go],
  );

  const pause = React.useCallback(() => {
    if (!speech || phaseNow.current !== "listening") return;
    go("pausing");
    speech.ExpoSpeechRecognitionModule.stop();
  }, [go]);

  const resume = React.useCallback(() => {
    if (!speech || phaseNow.current !== "paused") return;
    if (spentMs.current >= LISTEN_MAX_SECONDS * 1000) return go("done");
    setProblem(null);
    quickEnds.current = 0;
    go("starting");
    begin();
  }, [begin, go]);

  /** Start again from nothing, the recordings so far left behind. */
  const reset = React.useCallback(() => {
    if (speech && !["idle", "paused", "done"].includes(phaseNow.current)) {
      discarding.current = true;
      speech.ExpoSpeechRecognitionModule.abort();
    }
    recordings.current = [];
    spentMs.current = 0;
    startedAt.current = null;
    stopped.current = false;
    setHeard(NOTHING_HEARD);
    setSeconds(0);
    setProblem(null);
    go("idle");
  }, [go, setHeard]);

  return {
    /** Whether this build of the app can listen at all. */
    available: !!speech,
    phase,
    text: heardText(heard),
    seconds,
    problem,
    start,
    pause,
    resume,
    finish,
    reset,
  };
}
