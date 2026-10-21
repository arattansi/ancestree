import { androidApkUrl } from "@/lib/android-app";

/** /android/download (Step 200): our own address for the Android app,
 *  sent on to the current build's file on its GitHub release, so a link
 *  to it outlives the build it was shared for. */
export function GET() {
  return Response.redirect(androidApkUrl(), 302);
}
