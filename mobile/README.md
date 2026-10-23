# ancestree for iPhone and Android

The phone app (Step 147; on Android since Step 198, the same app): Expo SDK 57, React Native, Expo Router, the same
Supabase project as the web. The plan it follows is the Notion page
[Ancestree Mobile — Product Scope & Build Plan](https://app.notion.com/p/3ede5c10937e8155a47ff611c04aae00).

What it does so far:

- **Sign in** with an email and the 6-digit code, as on the web. App
  Review's one address asks for a password instead (Step 176).
- **The menu bar** (Step 179.4), left to right: record (the feather), the
  feed (the calendar, with an apple on it when there's something new),
  home (the ancestree mark), messages (the dialogue box) and you (your
  photo, or your initials). Only home and you are in colour. The ancestree
  wordmark stays at the top of every main screen; tap it to go back to your
  own leaf.
- **One leaf at a time**, drawn as the web's canvas is (Step 179.2). It
  opens on your own leaf. Your parents sit above it, your children below,
  your spouse to the left and your siblings to the right, each as a gray
  pill with their first name and their initials cut out of a disc at its
  right end. The lines branch off a bar and turn round corners, in the
  brown of the web's lit lines, over the web's dotted ground. Tap a pill to
  walk to that leaf, back retraces your steps, the magnifier finds anyone
  on your trees by name, and a "+n" pill lists the rest of a group too big
  to show.
- **add** (Step 179.3), beside the magnifier: a relative of whoever is on
  the leaf view (with the web's checks: 18 or older, the connections the
  tree implies, the database's say before anything is kept, an invite to
  claim), photos from your library for their album, or a written story.
- **Someone's details** (Step 179.5), from their leaf: how they're
  connected to you ("Your grandfather", and the chain of people between),
  their dates and places, their family, the trees they're on, their album,
  their stories and any open reports, read through
  `/api/mobile/person-sheet` as the web's sheet reads them.
- **The feed** (Step 179.4): birthdays and anniversaries in the next two
  months, and your notifications; opening it marks them read.
- **Settings** (you, in the menu bar): sign out, message security, the
  privacy notice, or delete the account for good (Step 176), choosing who
  takes over a tree you're the only Root of. A tree nobody else is on goes
  with it.
- **Tell a story** to the scribe (Step 148), from record in the menu bar or
  a leaf's details. Above the microphone, a title and whom it's about, both
  optional (Step 179.6); they fold away while you talk and come back when
  you're done, with who told it and who asked. A story may be about several
  people on one tree (Step 183): the first leads, and each has it on their
  leaf once they've said yes. The
  phone listens and shows the words as they come; pause, carry on, then
  **done**. Claude writes it up on the web's server (`/api/mobile/scribe`):
  a title, the story in the teller's own words and language, and English
  under it when it was told in another. Read it over, say who told it,
  and it's saved as a story with its recording, waiting for approval as
  any story does. Recordings stop at 12 minutes. Under the write-up comes
  what the story tells the tree (Step 148.2, `/api/mobile/scribe/facts`):
  births and deaths to tick, each made as an edit, a fill or a suggestion
  as you could on the web; people it names, to say it's about them too
  ("Also about", Step 183); and relatives not on the tree yet. Nothing
  changes until you tick it and save.
- **Messages** (Step 179.1), as on the web (Steps 174, 177): the
  dialogue box in the menu bar, with the unread count on it, opens
  your conversations; **message** on a leaf's details opens one with the
  member behind it. New Message lists everyone on your trees, closest
  first, each with who they are to you ("Your granddaughter"); a
  conversation's name opens how you're connected, mute, the security code
  and block. Tap a message for its time, to delete your own for everyone
  or to report theirs. New messages arrive as they're sent. Only the two
  of you can read them: see the next section.

## The scribe needs the app's own build

Listening uses the phone's own speech recognizer (Apple's on an iPhone,
Google's on Android) through `expo-speech-recognition`, which is native
code Expo Go doesn't have. In Expo Go, and in the browser, the scribe takes
typed words instead; the keyboard's microphone dictates them. To listen
for real, build the app onto a phone from the Mac:

```bash
npx expo run:ios --device
```

That needs Xcode, which signs the build with an ordinary Apple ID (no
developer account; the build lasts a week). For Android, see
**Android** below.

The write-up needs `ANTHROPIC_API_KEY` set on the web's server (Vercel),
and `EXPO_PUBLIC_SITE_URL` pointing at it.

## Messages and this phone's key (Step 179.1)

Each member has one messaging key, kept on their devices and never on the
server. The first device to open messages makes it. Any other device,
this phone included, starts **locked** and is given the key by one that
has it:

- **Scan the code.** On a device you've used before (the web, say), open
  messages, choose the lock, then **link a device**. On the phone, open
  messages and **scan the code** it shows. The link works once, for ten
  minutes.
- **Paste the link** instead, copied from that device.
- **Use recovery phrase**, if you've set one: your 12 words.
- **Lost every device? Start over** makes a new key. Earlier messages
  stay unreadable, and your family sees your security code change.

The phone keeps the key in the Keychain (`src/messages/keystore.ts`), as
the web keeps it in the browser, on this phone only: it's never in a
backup, so a phone restored from one is linked again. Message Security (the lock on the
Messages screen) links another device from the phone, sets the recovery
phrase, lists whom you've blocked and exports your conversations as a
text file read on the phone. The encryption is the web's own
(`lib/e2e/crypto.ts`, `@noble/*`); Hermes has no Web Crypto, so
`expo-crypto` supplies the randomness (`src/messages/random.ts`, imported
first). Scanning needs the camera (`expo-camera`). Both are native code,
so they need a development build made since Step 179.1; Expo Go and an
older build can't open messages.

## Your own build, signed by the developer account (Step 173)

Expo's build service, EAS, builds the app in the cloud and signs it with
the Apple developer account. The project is `@aalimr/ancestree` on
expo.dev, and `eas.json` holds three profiles:

- **development**: the app with Expo's dev client, for phones registered
  to the account. It takes its JavaScript from `npx expo start` on the
  Mac, so a code change shows up at once and only native changes need a
  new build.
- **preview**: the finished app for registered phones, no Mac needed.
- **production**: for TestFlight and the App Store.

The three public values live on EAS too, in its development, preview
and production environments, so builds made there have them.
`npx eas-cli env:pull --environment development` writes them into a
fresh `.env.local`, with `EXPO_PUBLIC_SITE_URL` set to the live site,
because a phone can't reach the Mac's `localhost`.

The first build on a new iPhone:

1. Build the development profile. EAS asks you to sign in to Apple (Apple
   ID, password, then the code on your phone) and to pick the team. It
   then offers to register a phone: choose **Website** and open the link
   on the iPhone, in Safari. The phone downloads a profile; install it in
   **Settings → General → VPN & Device Management**. EAS then makes the
   bundle ID, certificate and provisioning profile itself.

   ```bash
   npx eas-cli build --profile development --platform ios
   ```

2. When the build is done, which takes 10 to 30 minutes on the free plan,
   open the link it prints on the iPhone and install **ancestree**.
3. The first time it opens, iOS asks for **Developer Mode**: turn it on
   in **Settings → Privacy & Security → Developer Mode**. The phone
   restarts.
4. Start the bundler on the Mac, with the phone on the same Wi-Fi. The app
   lists the Mac's server; tap it.

   ```bash
   npx expo start --dev-client
   ```

If the profile won't download on the phone (it stalled on Aalim's iPhone),
register it by its device ID instead: plug the phone into the Mac, tap
**Trust**, read its ID (the "(UDID)" one) from

```bash
xcrun devicectl list devices
```

then run `npx eas-cli device:create`, choose **Input** and paste it.
That's also how another phone gets added, followed by a new development
build, because each build lists the phones it may run on.

## TestFlight (Step 175)

The production profile makes the build TestFlight hands out. It needs no
Mac and no registered phone: anyone in the TestFlight group installs it
from Apple's TestFlight app. Internal testers, who are users on the App
Store Connect team, get each build once Apple has processed it, with no
Beta App Review.

```bash
npx eas-cli build --profile production --platform ios --auto-submit
```

EAS counts the build number up itself and signs with the App Store
profile kept on EAS. `--auto-submit` sends the finished build to the App
Store Connect app (`ascAppId` in `eas.json`) with the App Store Connect
API key kept on EAS, so it needs no Apple sign-in or code. Apple
processes it in 5 to 30 minutes, then it shows in App Store Connect →
**ancestree** → **TestFlight**, where the internal group gets it.

The first submit (`npx eas-cli submit --profile production --platform
ios`) made the App Store Connect app and, asked to, generated that API
key. Apple's upload check wants a purpose string for every sensitive
API the app's libraries touch, even unused: `expo-file-system` can read
the photo library, so `app.json` carries `NSPhotoLibraryUsageDescription`
though the app never asks for photos.

To add a tester, give them an App Store Connect user first (Users and
Access): only the Admin, App Manager, Developer and Marketing roles can
be internal testers. Then add them to the internal group under
TestFlight.

## Building on the Mac (Step 204)

EAS's free plan builds 15 times a month for each platform in its cloud,
and iPhone builds ran out first. The same build runs on this Mac instead,
with the same `eas.json` profile, the signing kept on EAS and the build
number counted up there, and counts against nothing:

```bash
npm run build:ios
```

builds the production app into `mobile/builds/` (git-ignored), then sends
it to TestFlight with `eas submit`, as `--auto-submit` did. Add
`-- --no-submit` to keep it here. For Android:

```bash
npm run build:android
```

makes the `.apk` there for a GitHub release (below). Both run
`scripts/build-local.sh`, which sets a UTF-8 locale (CocoaPods and
fastlane stop without one), `JAVA_HOME` and `ANDROID_HOME` as the emulator
uses them, and keeps Gradle from leaving a daemon behind. EAS copies the
repo to a temporary folder first, with what isn't committed, so the
worktree can be edited again once the log reaches `INSTALL_DEPENDENCIES`.

What the Mac needs: Xcode, CocoaPods and fastlane (`brew install
fastlane`) for iOS; JDK 17 and the Android SDK (Android, below) for
Android. And for iOS, Apple's **WWDR G3** intermediate certificate in the
login keychain, which signs today's distribution certificates; without it
the build stops at "Distribution certificate … hasn't been imported
successfully":

```bash
curl -fsSLO https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
security import AppleWWDRCAG3.cer -k ~/Library/Keychains/login.keychain-db
```

The cloud commands above still work, for when the Mac is busy.

## Apple's review (Step 176)

External TestFlight testers and the App Store both go through Apple's
review, and a reviewer can't read the emailed code. So the sign-in screen
asks one address, `APP_REVIEW_EMAIL` in `lib/app-review.ts`, for a
password instead. Before each submission, from the repo root:

```bash
npm run review:account
```

It makes the account and its tree again (an invented family, the
Kapadia family, with a second Root who never signs in, so deleting the
account works) and prints a new password once. That password, with the
address, goes into App Store Connect's App Review Information.
`docs/app-store-review.md` has the notes to paste there, the App Privacy
answers and the purpose strings. Between reviews, stop the account
signing in:

```bash
npm run review:account -- --off
```

## Push notifications (Step 204)

The phone is told of a new message (who wrote, never what: the words are
end-to-end encrypted) and of a new story about someone the member sees.
Once a member's family is read, the app asks whether it may notify them,
then gives the web this phone's Expo push token (`register_push_token`);
signing out gives it back. Settings → **Notifications** has a switch for
each, kept per member (`push_settings`); on Android each is its own
channel too. Tapping one opens the conversation, or the details of whom
the story is about (`src/push/open.tsx`).

The web sends them (`lib/push.server.ts`) through Expo's push service,
free and outside the build allowance. After a message, the sender's
device asks `/api/messages/push` or `/api/mobile/messages/push`; after a
story is told, tagged or approved, the web's own actions or
`/api/mobile/stories/push` ask. `claim_message_push` and
`claim_story_push` decide whom, once each.

Each platform needs its key on EAS once, before the build that brings
`expo-notifications`:

- **iPhone:** an Apple Push Notifications key, and the Push Notifications
  capability on the App ID. Run `npx eas-cli credentials --platform ios`,
  sign in to Apple, then production → Push Notifications → set up a key;
  the next build makes a provisioning profile with the capability.
- **Android:** a Firebase project for `app.ancestree.space`. In the
  Firebase console add an Android app with that package, download
  `google-services.json` into `mobile/`, and set
  `"googleServicesFile": "./google-services.json"` under `android` in
  `app.json`. Then Project settings → Service accounts → generate a key,
  and upload it with `npx eas-cli credentials --platform android` →
  production → Google Service Account → FCM V1. Without both, an Android
  phone simply gets no token.

## Android (Step 198)

The same code, built for Android: everything above works there too. Where
Android differs, the app follows it:

- **Back** (the gesture or button) retraces the leaves you walked, closes
  a sheet, and from another tab goes home. In the scribe it closes only
  what holds nothing yet, or a saved story: a story half told is left for
  the X, as the iPhone's swipe is off.
- **The keyboard.** Forms rise above it with the same `padding` the
  iPhone uses; a form in a sheet goes through `src/ui/sheet-keyboard.tsx`,
  because React Native measures a sheet from its own top but the keyboard
  from the screen's.
- **Photos** come through Android's photo picker, which needs no
  permission. **Exporting messages** hands the file to Android's share
  sheet with `expo-sharing` (React Native's `Share` takes words only there).
- **Listening** is Google's recognizer, over the network; it hears in
  segments, which `@/lib/scribe-heard` already pieces together. Android
  13 and later keep the recording; older phones still listen.
- **Dark mode** follows the phone through `expo-system-ui`.
- `app.json` `android.blockedPermissions` takes out the template's storage
  and overlay permissions, so the app asks only for the microphone and
  the camera.

**On the Mac's emulator.** Android Studio isn't needed: JDK 17 and the
SDK's command-line tools from Homebrew do (`brew install openjdk@17` and
`brew install --cask android-commandlinetools`), then from `sdkmanager`
`platform-tools`, `emulator`, `platforms;android-36`,
`build-tools;36.0.0` and an Android 16 Play Store system image, and an
emulator made with `avdmanager`. With `JAVA_HOME` and `ANDROID_HOME`
(`/opt/homebrew/share/android-commandlinetools`) set and the emulator
running:

```bash
npx expo run:android --device <emulator name> --port 8091
```

`expo prebuild` and `run:android` rewrite the `ios` and `android` scripts
in `package.json`: put them back. The emulator reaches the Mac as
`10.0.2.2`, not `localhost`, so `EXPO_PUBLIC_SITE_URL` should be the live
site, as for a phone.

**Builds and direct download.** Android users get the app as an APK
straight from us, not from Google Play (Aalim's call, 2026-10-21). Its
package is `app.ancestree.space`, registered to Aalim's verified account
in Google's **Android Developer Console** (android.google.com/developerconsole,
the identity check Android phones will require of apps from outside Play),
so it differs from the iPhone's `space.ancestree.app`. EAS builds and signs
it with a key it made for that package and keeps:

```bash
npx eas-cli build --profile production --platform android
```

The production profile makes an `.apk` (`android.buildType` in
`eas.json`); the build page on expo.dev links to it. That key's SHA-256
fingerprint is the one registered for the package: a build signed with
any other key won't install where verification is enforced, so never
make a new keystore for it. Google Play would need an Android App Bundle
and its own Play Console account; `docs/play-store-review.md` keeps what
Play asks, for if that comes later.

The APK carries only the two ABIs phones use, `arm64-v8a` and
`armeabi-v7a` (`expo-build-properties`' `android.buildArchs` in
`app.json`, Step 200), not the emulators' `x86` and `x86_64`: that took
it from 132 MB to 74 MB. `expo run:android` still builds whatever its
device needs, the arm64 emulator included.

**Putting a build out (Step 200).** People get it at
[ancestree.space/android](https://www.ancestree.space/android), whose
**download for android** is `/android/download`, sent on to the build's
file on a GitHub release of this (public) repo. For a new build, once EAS
has finished it (or `npm run build:android` has, Step 204: the file is in
`mobile/builds/`, so skip the download):

```bash
curl -L -o ancestree-0.1.0-4.apk <the build's .apk link from expo.dev>
gh release create android-v0.1.0-4 ancestree-0.1.0-4.apk \
  --title "Android 0.1.0 (4)" --notes "ancestree for Android, from ancestree.space/android."
```

(version and versionCode as EAS gave them), then set `version`, `build`
and `bytes` in `lib/android-app.ts` to match and deploy the web. The page
and `/android/download` follow that file, so the page never offers a
build that isn't up yet. Older releases can stay. The app doesn't update
itself: people download it again and Android installs it over the old one,
which works only because every build is signed with the same key.

Installing from Chrome (tried on the emulator, 2026-10-21, build 3 over
build 2): Android first asks to allow installs from Chrome, then Google
Play Protect blocks the app, as it "hasn't seen an app from this developer
before"; **More details → Install anyway** lets it through, after which it
asks whether to send the app to Google for a check. The page's steps say
the same, so keep them in step with what phones show.

## Run it on your iPhone (no developer account needed)

Expo Go runs the app straight from your Mac.

1. Install **Expo Go** from the App Store on the iPhone.
2. On the Mac, with Node 20.19.4 or later:

   ```bash
   cd mobile
   cp .env.example .env.local   # then fill in the three values
   npm install
   npx expo start
   ```

3. Scan the QR code it prints with the iPhone's camera. The phone and the
   Mac have to be on the same Wi-Fi; if they can't be, use
   `npx expo start --tunnel`.

`.env.local` takes the same public values as the web's
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_SITE_URL`. Never the service-role key: everything in
`EXPO_PUBLIC_*` ships inside the app.

For the iOS Simulator, install Xcode from the Mac App Store, point the
command-line tools at it once
(`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`),
install CocoaPods (`brew install cocoapods`), then build the app onto a
simulator with `npx expo run:ios`. Add `--port 8083` when another
`expo start` already holds 8081. `npm run web` opens the same app in a browser, which
is handy for layout. The browser keeps the session in localStorage, where
the phone uses the Keychain.

## How it's put together

- `src/app/`: the screens, as Expo Router routes. `sign-in.tsx` is for the
  signed-out; `(family)/` is for everyone signed in. `(family)/(tabs)/`
  holds the screens behind the menu bar (Step 179.4, `expo-router/ui`'s
  headless tabs): `index.tsx` (the leaf), `feed.tsx`, `messages.tsx`,
  `settings.tsx`; record is a button, not a tab. Over them, from the
  family's stack: `person/[id].tsx`, `add/` (the + menu), `relatives/[side].tsx`,
  `search.tsx`, `messages/` (a conversation and the rest), `scribe/[id].tsx`.
- `src/ui/`: `app-header.tsx` (the wordmark), `menu-bar.tsx`, `icons.tsx`
  (Lucide's, plus the apple), buttons, chips, fields, and
  `sheet-keyboard.tsx` (a sheet's form clear of Android's keyboard).
- `src/feed/notices.ts`: your notifications, as the web's bell reads them,
  shared by the feed and the calendar's apple.
- `src/person/`: someone's details, read through `/api/mobile/person-sheet`.
- `src/auth/`: the Supabase client. The session lives in the Keychain
  (`expo-secure-store`), in chunks, because a session is larger than one
  SecureStore value, and without Face ID (`faceIDPermission: false`).
  `delete-account.ts` reads what deleting asks of you and deletes through
  `/api/mobile/account/delete` (Step 176); the screen is
  `(family)/delete-account.tsx`.
- `src/family/`: one read of everyone on every tree you belong to, and
  where you are in it; `photo.ts` signs a photo's address as the web does.
- `src/leaf/`: the leaf, drawn from the web's own leaf shapes, and the
  pills around it (`person-pill.tsx`). Where they all go, and the lines'
  corners, are `@/lib/leaf-orbit` (tested with the web's `npm test`).
- `plugins/with-scene-life-cycle.js`: an app built with the iOS 27 SDK
  won't open without UIKit's scene life cycle, and Expo 57's template
  doesn't adopt it yet. On every prebuild this hands the window to Expo's
  own scene delegate (Step 149). It leaves a template that already adopts
  scenes alone, so drop it once Expo's does.
- `src/messages/`: messages (Step 179.1). `store.ts` is the web's
  `components/messenger/messenger-store.ts` step for step (keys, reading,
  sending, the inbox, linking, block, mute, delete, export), `load.ts`
  reads the list with the web's RPCs, `relations.ts` works out who they
  are to you over the family read, `keystore.ts` keeps the keys in the
  Keychain. The screens are `(family)/messages/`. Everything about a
  message's words comes from the web's `lib/messenger.ts`,
  `lib/messenger-relation.ts` and `lib/e2e/`: a change there reaches both.
- `src/scribe/`: the scribe. `speech.ts` loads the recognizer only where
  it exists, `use-listening.ts` listens (pauses, the 12-minute stop,
  listening that stops on its own and carries on), `story.ts` makes the
  trips (write-up, facts, recording, `add_story`, the facts ticked),
  `facts-review.tsx` shows the facts, `scribe.tsx` is the screen. What was heard is pieced together by `@/lib/scribe-heard`, the
  recordings joined by `@/lib/wav`.

**Shared code is the web's `lib/`.** `@/lib/*` resolves to `../lib/*`
(`tsconfig.json` and `metro.config.js`), so the app imports
`@/lib/leaf-shapes`, `@/lib/native-leaf`, `@/lib/person-name`,
`@/lib/first-degree` and `@/lib/leaf-orbit` exactly as the web does. Only
pure TypeScript can be shared that way: nothing from Next, React DOM or
`*.server.ts`. Shared code is tested with the web's `npm test` at the repo
root, and the root needs `npm install` for the shared files' types. Never
add a `src/lib/`: `@/lib` would stop meaning the shared one.

Everything the web does through a server action or the service role is
listed in `docs/mobile-server-paths.md`, with what the app does instead.

## Checks

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run doctor
```
