import type { Metadata } from "next";

import { LinkThisDevice } from "@/components/messenger/link-this-device";
import { CenteredPage } from "@/components/page-column";
import { getProfile } from "@/lib/auth";
import { MESSAGES_LINK_KEPT } from "@/lib/messenger";

export const metadata: Metadata = {
  title: "link this device",
  description: "Read your messages on this device too.",
  robots: { index: false },
};

/**
 * Where a link made on a member's other device opens (Step 174.6): the
 * QR code in Message Security, scanned with a phone's camera, or the link
 * pasted. Its key is in the fragment, which never reaches the server; the
 * page is public so a device that isn't signed in keeps it while it signs
 * in (`LinkThisDevice`).
 */
export default async function LinkDevicePage() {
  const profile = await getProfile();
  return (
    <CenteredPage className="text-center">
      {/* Runs as the page is read, before any other script (Google
          Analytics loads only after the page is live): the link's key
          moves from the address bar into this tab's session storage, so
          no script, history entry or analytics hit ever sees it. Where
          there's no session storage it stays, for the page to read. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var h=location.hash.slice(1);if(h){sessionStorage.setItem(${JSON.stringify(MESSAGES_LINK_KEPT)},h);history.replaceState(null,"",location.pathname);}}catch(e){}})();`,
        }}
      />
      <LinkThisDevice userId={profile?.auth_user_id ?? null} />
    </CenteredPage>
  );
}
