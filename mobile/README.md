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
