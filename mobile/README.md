# ancestree for iPhone

The phone app (Step 147): Expo SDK 57, React Native, Expo Router, the same
Supabase project as the web. The plan it follows is the Notion page
[Ancestree Mobile — Product Scope & Build Plan](https://app.notion.com/p/3ede5c10937e8155a47ff611c04aae00).

What it does so far:

- **Sign in** with an email and the 8-digit code, as on the web.
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

For the iOS Simulator, install Xcode from the Mac App Store, then press `i`
in `npx expo start`. `npm run web` opens the same app in a browser, which
is handy for layout. The browser keeps the session in localStorage, where
the phone uses the Keychain.

## How it's put together

- `src/app/`: the screens, as Expo Router routes. `sign-in.tsx` is for the
  signed-out; `(family)/` is for everyone signed in: `index.tsx` (the leaf),
  `person/[id].tsx`, `relatives/[side].tsx`, `search.tsx`, `account.tsx`.
- `src/auth/`: the Supabase client. The session lives in the Keychain
  (`expo-secure-store`), in chunks, because a session is larger than one
  SecureStore value.
- `src/family/`: one read of everyone on every tree you belong to, and
  where you are in it.
- `src/leaf/`: the leaf, drawn from the web's own leaf shapes, and the
  circles around it.
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
