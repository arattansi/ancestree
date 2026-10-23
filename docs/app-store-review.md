# The iPhone app in App Store review

Step 176, as of build 0.1.0 (4). What App Store Connect asks before a build
goes to external TestFlight testers or the App Store, and the answers for
this app. Go over it again whenever the app starts collecting something new:
photos from the phone, push tokens, analytics or crash reports.

## App Privacy (the "nutrition label")

App Store Connect → ancestree → **App Privacy** → Get Started.

**Do you or your third-party partners collect data from this app?** Yes.

Collect these six types and nothing else. For each one the answers are the
same:

- **Purpose:** App Functionality only. Not analytics, not advertising, not
  product personalisation.
- **Linked to the user's identity:** Yes. Everything is kept against their
  account.
- **Used for tracking:** No.

| Category | Data type | What it is in ancestree |
| --- | --- | --- |
| Contact Info | **Name** | Their own name, on their account and their entry on the tree. |
| Contact Info | **Email Address** | The address they sign in with. Also the address of a relative they invite to claim an entry. |
| User Content | **Audio Data** | A story told aloud to the scribe: the recording is kept with the story. |
| User Content | **Other User Content** | Stories (the words, title and credits), and the family details they add: names, births, deaths, places, sex, and who is whose parent or spouse. |
| Identifiers | **User ID** | Their account's ID, which every row they add is kept under. |
| Identifiers | **Device ID** | Since Step 204: the phone's push token, if they allow notifications, kept against their account to tell that phone of new messages and stories. Gone when they sign out on it. |

Everything else is **not collected**:

- Health and fitness, financial info, contacts.
- Location: no precise or coarse location. A place of birth is typed, so it
  counts as user content, not location.
- Browsing or search history: the search on the phone runs on the phone.
- Sensitive info, purchases.
- Usage data and diagnostics: no analytics, no crash reporting. The web's
  Google Analytics doesn't run in the app.
- Photos or videos: the app shows photos from the album but can't add any
  yet.

Who handles that data for ancestree (they count as collection by
ancestree, not as third-party tracking): Supabase stores it, Vercel runs the
server, Resend sends the emails, Expo hands notifications to Apple's push
service (who wrote, never what; whom a story is about), and Anthropic's
Claude writes up a story from what was heard. The phone's own speech recognizer, which is Apple's,
does the hearing.

**Privacy Policy URL:** `https://www.ancestree.space/privacy`. It already
covers the scribe, Claude and the phone's speech recognition, and deleting
an account from the app. The app links to it from the sign-in screen and
the account screen.

## App Review Information

App Store Connect → ancestree → the version (or TestFlight → Test
Information for external testing) → **App Review Information**.

- **Sign-in required:** Yes.
- **User name:** `delivered+app-review@resend.dev`
- **Password:** what `npm run review:account` printed. It's shown once and
  kept nowhere else, so if it's lost, run the script again for a new one.
- **Notes:** paste this:

> ancestree signs people in with a 6-digit code it emails them. For review,
> the address above asks for a password instead of sending a code: type the
> address, tap "email me a code", then enter the password.
>
> The account is a Root of an invented family tree, the Kapadia family:
> every person and story on it is fiction. The app opens on Asha Mehta's
> leaf, which is you. Tap a circle to walk to a relative, and tap the leaf
> for its details.
>
> To tell a story aloud: tap a leaf, then "tell a story". It asks for the
> microphone and speech recognition.
>
> To delete the account: the person button at the top right, then "delete
> my account", then "delete permanently". The family tree stays with its
> other Root.

**Before each submission,** run the script so the account and its tree are
there as described, even if App Review deleted the account last time:

```bash
npm run review:account
```

Paste the new password it prints into App Review Information. Between
reviews, turn the account off so nobody can sign in with it:

```bash
npm run review:account -- --off
```

## How the review sign-in works

- The phone asks for a password for one address only: `APP_REVIEW_EMAIL` in
  `lib/app-review.ts`. For every other address it emails the code, as before.
- Every ancestree account already has a password, a random one Supabase gave
  it at sign-up that nobody knows, so password sign-in was always switched
  on for the project. The review account is the only one whose password
  anyone knows. Supabase limits how often anyone can try one.
- The review account and the tree's second Root (`APP_REVIEW_STEWARD_EMAIL`,
  who never signs in) are both Resend's test inbox, which takes mail and
  drops it. Their newsletter and getting-started emails are off.
- The tree counts in `/admin` like any other.

## Purpose strings

These are the permission messages iOS shows. Apple's upload check wants one
for every sensitive API the app's libraries touch, even unused (Step 175).

| Key | Set by | Shown when |
| --- | --- | --- |
| `NSMicrophoneUsageDescription` | `expo-speech-recognition` plugin | Telling a story |
| `NSSpeechRecognitionUsageDescription` | `expo-speech-recognition` plugin | Telling a story |
| `NSPhotoLibraryUsageDescription` | `app.json` `ios.infoPlist` | Never yet (`expo-file-system` can read photos) |
| `NSLocalNetworkUsageDescription` | `expo-dev-client` | Only in a development build, finding Metro on the Mac |
| `NSCameraUsageDescription` | `expo-camera` plugin | Scanning the code that links the phone to your messages (Step 179.1) |

`expo-camera` also touches the microphone (for video, which the app never
records); its plugin keeps the scribe's microphone message.

There's no `NSFaceIDUsageDescription`. `expo-secure-store` adds Expo's stock
Face ID message unless told not to (`"faceIDPermission": false`). The app
keeps the session in the Keychain without Face ID, so it never asks. If the
app starts using Face ID, give it a real message there.

## Header and search results art

App Store Connect → ancestree → the version → **Header and Search Results**
(new 2026-10-05, shown on iOS 27). Step 201 made both images, in
`docs/app-store/`:

| File | Placement | Size | What it shows |
| --- | --- | --- | --- |
| `header.png` | Product page header | 3840 × 1646 (21:9) | The tagline, with the home page's family either side of it |
| `search-result.png` | Search results | 3840 × 2560 (3:2) | The leaf view on Nila from the review family, seen by Asha |

`npm run store:art` draws them again from the app's own geometry (Chrome,
headless); `-- --guides` writes copies with Apple's art safe area on them.
Apple's rules: no transparency, no prices, web addresses or copyright
symbols. Its templates mark only a centred safe area (header x 1097–2743,
y 493–1154; search x 836–3004, y 765–1795), not where the icon, name and
get button sit, so check every device in **Preview** before submitting.
Without a search results image, Apple shows the screenshots.

## Still to check before the App Store

- **Shared content (guideline 1.2).** Once the phone shows other people's
  stories and photos (Phase 4, the story feed), it needs a way to report one
  and to block someone, as the web has. Messages already have both (Step
  179.1).
- **Encryption export compliance.** Until Step 179 `app.json` said
  `"usesNonExemptEncryption": false`, which held while the app used
  encryption only through iOS (HTTPS, the Keychain). Since Step 179.1 the
  app encrypts messages itself, with standard published algorithms
  (X25519, Ed25519, XChaCha20-Poly1305, `@noble/*`). Declaring it
  (`"usesNonExemptEncryption": true`) needs the code App Store Connect gives
  under General → App Information → App Encryption Documentation, in
  `ios.infoPlist.ITSEncryptionExportComplianceCode`; without it Apple
  rejects the upload (ITMS-90592, build 5). **Decided 2026-10-17 (Aalim):
  leave it out.** `app.json` says nothing about encryption, so each build
  waits in TestFlight as "Missing Compliance" and the questions are
  answered under its Manage link (standard algorithms, used in addition to
  iOS's own). Setting `false` instead would say the app has no encryption
  of its own, which stopped being true with 179.1.
- **Messages in App Privacy.** The server keeps who wrote to whom and when,
  but never a message's words, which only the members' devices can read.
  Check Apple's wording on end-to-end encrypted data before adding
  messages to the labels above.
- **Support URL.** App Store Connect needs one. There's no support page
  yet; `https://www.ancestree.space/about-us` can stand in.
- **Age rating.** Answer "No" to everything except user-generated content,
  which is "Yes".
