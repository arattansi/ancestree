import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * The phone's own speech recognizer (Step 148): Apple's on an iPhone,
 * Google's on Android, through `expo-speech-recognition`. It's native code
 * that Expo Go doesn't carry, so it's there only in the app's own build;
 * without it (Expo Go, the browser) the scribe takes typed or dictated words
 * instead. Loaded only when present: importing it without its native half
 * throws.
 */

type SpeechModule = typeof import("expo-speech-recognition");

export const speech: SpeechModule | null =
  Platform.OS !== "web" && requireOptionalNativeModule("ExpoSpeechRecognition")
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("expo-speech-recognition") as SpeechModule)
    : null;

/**
 * A language the family may tell a story in: its own name, its tag, and
 * the variant to ask for when the phone's region has none of its own.
 */
export type Tongue = { name: string; prefix: string; usual: string };

/**
 * The languages offered, in order, when the phone can listen for them:
 * English and the family's own (the mobile plan's first release names
 * English and Gujarati, and Kutchi, Swahili, Hindi and Urdu come up).
 * Kutchi has no recognizer anywhere yet.
 */
export const TONGUES: Tongue[] = [
  { name: "English", prefix: "en", usual: "en-US" },
  { name: "ગુજરાતી", prefix: "gu", usual: "gu-IN" },
  { name: "हिन्दी", prefix: "hi", usual: "hi-IN" },
  { name: "اردو", prefix: "ur", usual: "ur-PK" },
  { name: "Kiswahili", prefix: "sw", usual: "sw-KE" },
];

/** The phone's language, if it says ("en-GB"). */
function phoneLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    return null;
  }
}

/**
 * Each language offered that the phone can listen for, with the locale to
 * ask for: the variant for the phone's region where there is one ("en-GB"
 * in Britain, "sw-TZ" in Tanzania), else the usual one.
 */
export async function tonguesHeard(): Promise<(Tongue & { locale: string })[]> {
  if (!speech) return [];
  let locales: string[] = [];
  try {
    locales = (await speech.ExpoSpeechRecognitionModule.getSupportedLocales({}))
      .locales;
  } catch {
    // Some Android phones can't say.
  }
  // Those that don't (Android 12 and older) still hear English.
  if (!locales.length) locales = ["en-US"];
  const tag = (l: string) => l.replace("_", "-").toLowerCase();
  const region = phoneLocale()?.split(/[-_]/)[1]?.toLowerCase();
  return TONGUES.flatMap((t) => {
    const matching = locales.filter((l) => tag(l).split("-")[0] === t.prefix);
    if (!matching.length) return [];
    const local =
      region && matching.find((l) => tag(l) === `${t.prefix}-${region}`);
    const usual = matching.find((l) => tag(l) === t.usual.toLowerCase());
    return [{ ...t, locale: local || usual || matching[0] }];
  });
}
