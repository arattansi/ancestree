import type { Metadata } from "next";

import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import {
  ANDROID_APP,
  androidApkSize,
  androidDownloadHref,
  androidHref,
} from "@/lib/android-app";
import { marketingMetadata } from "@/lib/marketing-meta";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = marketingMetadata(
  "ancestree • android app",
  "ancestree for android phones, straight from us.",
);

/**
 * /android (Step 200): the Android app, which comes from us as an APK, not
 * from Google Play (Step 198.3). The button is our own /android/download,
 * sent on to the build in `lib/android-app.ts`; the steps are what Chrome
 * and Android 16 asked on the emulator, Play Protect's block of a
 * developer it hasn't seen included. From `lg` a QR code of this page, for
 * a visitor on a computer. Linked from the home page's footer, beside the
 * changelog.
 */
export default function AndroidPage() {
  return (
    <MarketingColumn
      aside={
        <div className="hidden flex-col items-start gap-3 lg:flex">
          <QrCode
            text={`${getSiteUrl()}${androidHref()}`}
            label="Code for this page"
            className="size-40"
          />
          <p className="text-sm text-muted-foreground">
            on a computer? scan this with your phone.
          </p>
        </div>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight">(android-app)</h1>
      <MarketingCopy>
        <p>ancestree for android phones. it comes from us, not google play.</p>
      </MarketingCopy>
      <div className="flex flex-col items-start gap-2">
        <Button
          nativeButton={false}
          render={<a href={androidDownloadHref()} />}
          size="lg"
        >
          download for android
        </Button>
        <p className="text-xs text-muted-foreground">
          version {ANDROID_APP.version} ({ANDROID_APP.build}) ·{" "}
          {androidApkSize()} · android {ANDROID_APP.minAndroid} or later
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">to install it</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>on your phone, tap download for android.</li>
          <li>open the file once it&rsquo;s downloaded.</li>
          <li>
            if your phone won&rsquo;t install apps from chrome, tap settings,
            turn on allow from this source, then go back.
          </li>
          <li>tap install.</li>
          <li>
            if play protect blocks it, as it hasn&rsquo;t seen an app from
            us before, tap more details, then install anyway.
          </li>
          <li>open ancestree and sign in with your email.</li>
        </ol>
      </section>
      <MarketingCopy>
        <p>
          google was still reviewing our registration as an android developer
          on 21 october 2026.
        </p>
        <p>
          it doesn&rsquo;t update itself: for a new version, download it here
          again and tap update.
        </p>
      </MarketingCopy>
    </MarketingColumn>
  );
}
