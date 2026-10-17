# ancestree for iPhone

The phone app (Step 147): Expo SDK 57, React Native, Expo Router, the same
Supabase project as the web. The plan it follows is the Notion page
[Ancestree Mobile — Product Scope & Build Plan](https://app.notion.com/p/3ede5c10937e8155a47ff611c04aae00).

What it does so far:

- **Sign in** with an email and the 8-digit code, as on the web. App
  Review's one address asks for a password instead (Step 176).
- **Your account:** sign out, read the privacy notice, or delete the
  account for good (Step 176), choosing who takes over a tree you're the
  only Root of. A tree nobody else is on goes with it.
- **One leaf at a time.** It opens on your own leaf. Your parents sit above
  it, your children below, your spouse to the left and your siblings to the
  right, each as a small circle. Tap a circle to walk to that leaf, and tap
  the leaf for its details. **you** brings you home, the magnifier finds
  anyone on your trees by name, and a "+n" circle lists the rest of a group
  too big to show.
- **Tell a story** to the scribe (Step 148), from a leaf's details. The
  phone listens and shows the words as they come; pause, carry on, then
  **done**. Claude writes it up on the web's server (`/api/mobile/scribe`):
  a title, the story in the teller's own words and language, and English
  under it when it was told in another. Read it over, say who told it,
  and it's saved as a story with its recording, waiting for approval as
  any story does. Recordings stop at 12 minutes. Under the write-up comes
  what the story tells the tree (Step 148.2, `/api/mobile/scribe/facts`):
  births and deaths to tick, each made as an edit, a fill or a suggestion
  as you could on the web; people it mentions, to tag; and relatives not
  on the tree yet. Nothing changes until you tick it and save.
- **Messages** (Step 179.1), as on the web (Steps 174, 177): the
  speech-bubble in the leaf's header, with the unread count on it, opens
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
developer account; the build lasts a week). For an Android phone, with
Android Studio's SDK and the phone in developer mode:

```bash
npx expo run:android --device
```

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
  signed-out; `(family)/` is for everyone signed in: `index.tsx` (the leaf),
  `person/[id].tsx`, `relatives/[side].tsx`, `search.tsx`, `account.tsx`,
  `messages/`.
- `src/auth/`: the Supabase client. The session lives in the Keychain
  (`expo-secure-store`), in chunks, because a session is larger than one
  SecureStore value, and without Face ID (`faceIDPermission: false`).
  `delete-account.ts` reads what deleting asks of you and deletes through
  `/api/mobile/account/delete` (Step 176); the screen is
  `(family)/delete-account.tsx`.
- `src/family/`: one read of everyone on every tree you belong to, and
  where you are in it.
- `src/leaf/`: the leaf, drawn from the web's own leaf shapes, and the
  circles around it.
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
