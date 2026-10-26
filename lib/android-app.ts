/**
 * The Android app, which people download from us rather than Google Play
 * (Step 198.3): the build /android offers (Step 200). Each production APK
 * from EAS goes up as a release on the public GitHub repo, named by its
 * version and build; change these to that build's when it's up
 * (mobile/README.md → Android says how).
 */
export const ANDROID_APP = {
  version: "0.1.0",
  /** EAS's versionCode for the build. */
  build: 6,
  /** The APK's size in bytes, as the release holds it. */
  bytes: 74_765_763,
  /** The oldest Android it installs on (minSdkVersion 24). */
  minAndroid: "7",
} as const;

const RELEASES = "https://github.com/arattansi/ancestree/releases/download";

/** The page with the download and how to install it. */
export function androidHref(): string {
  return "/android";
}

/** Our own address for the APK, which sends you on to the release's file. */
export function androidDownloadHref(): string {
  return "/android/download";
}

/** The release's tag, e.g. `android-v0.1.0-3`. */
export function androidReleaseTag(app = ANDROID_APP): string {
  return `android-v${app.version}-${app.build}`;
}

/** The APK itself, on the release. */
export function androidApkUrl(app = ANDROID_APP): string {
  return `${RELEASES}/${androidReleaseTag(app)}/ancestree-${app.version}-${app.build}.apk`;
}

/** "63 MB", as the page shows it. */
export function androidApkSize(app = ANDROID_APP): string {
  return `${Math.round(app.bytes / 1_000_000)} MB`;
}
