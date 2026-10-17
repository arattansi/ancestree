import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import { Public_Sans, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";

import { ConsentBanner } from "@/components/consent-banner";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, SiteHeaderShell } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { consentDefaultScript, needsConsent } from "@/lib/consent";
import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// The promise under the home page's tagline (the brand page in Notion).
const description =
  "connect with your family, share stories, meet your ancestors.";

/** The ancestree GA4 property's web stream (Step 137). */
const GA_MEASUREMENT_ID = "G-WRNLXD8WBF";

export const metadata: Metadata = {
  // The link preview (app/opengraph-image.tsx) needs an absolute URL.
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "ancestree",
    template: "%s · ancestree",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "ancestree",
    title: "ancestree",
    description,
  },
  twitter: { card: "summary_large_image" },
  // Search Console's ownership tag for https://www.ancestree.space/
  // (Step 137): the home page carries it, so the property stays verified.
  verification: { google: "s_-HgW3jWQk4FeFbjJREzJ86qOPNeLUigdUtNV0hI5I" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Where the visitor is, as Vercel says: the consent banner shows where
  // the law asks before a cookie (Step 137). Unknown (local dev), it doesn't.
  const askConsent = needsConsent((await headers()).get("x-vercel-ip-country"));
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${publicSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* Google's consent defaults, before its tag loads: the Analytics
            cookie denied in the EEA, the UK and Switzerland until allowed. */}
        <Script id="consent-default" strategy="beforeInteractive">
          {consentDefaultScript()}
        </Script>
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
          >
            Skip to content
          </a>
          {/* The header streams in on its own, so the page below never waits
              for its counts, and a page's loading.tsx shows at once (Step
              61). */}
          <Suspense fallback={<SiteHeaderShell />}>
            <SiteHeader />
          </Suspense>
          <div id="main-content" className="flex flex-1 flex-col">
            {children}
          </div>
          <SiteFooter />
          <Toaster />
        </ThemeProvider>
        {/* Google Analytics, the ancestree property in the Medfair account
            (Step 137): its tag on every page, loaded after the page is
            interactive. */}
        <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
        {askConsent ? <ConsentBanner /> : null}
      </body>
    </html>
  );
}
