# The Android app on Google Play

Step 198. The same app as the iPhone's (`mobile/`), built for Android. What
Play Console asks before a build reaches testers or the store, and the
answers for this app. The iPhone's are in `docs/app-store-review.md`; keep
the two in step whenever the app starts collecting something new.

## The order things happen in

Aalim's developer account is a **personal** one. Google lets a personal
account's new app reach production only after a **closed test with at
least 12 testers who stay opted in for 14 days in a row**. So:

1. **Create the app** in Play Console: name `ancestree`, default language
   English (United States), App, Free. The package name is fixed by the
   first upload: `space.ancestree.app`, the same as the iPhone's bundle ID.
2. **Internal testing** (up to 100 testers, no review wait): the first
   build goes here. Google takes the very first upload only by hand: Play
   Console → Test and release → Testing → Internal testing → Create new
   release → upload the `.aab` from the EAS build page.
3. **Closed testing** with 12 or more testers (a Google Group or a list of
   addresses), for 14 days. Testers join from the opt-in link and install
   from the Play Store.
4. **Apply for production** (Dashboard → Apply for production), answering
   Google's questions about the closed test. Google reviews it, then the
   app can go to production.

## Builds

EAS builds and signs it, as it does the iPhone's (Step 173):

```bash
npx -y eas-cli@24.14.0 build --profile production --platform android
```

- The first build made the **upload key** on EAS (`eas credentials` →
  Android shows it). Google keeps the key the store signs with (Play App
  Signing, on by default for new apps); if the upload key is ever lost, the
  account owner asks Google to reset it.
- `versionCode` counts up on EAS by itself, like the iPhone's build number
  (`appVersionSource: remote`, `autoIncrement`).
- A production build is an `.aab` for Play. A `preview` build is an `.apk`
  to install directly on a phone or emulator.

After the first hand upload, EAS can send each build to internal testing
itself (`submit.production.android.track` in `eas.json`):

```bash
npx -y eas-cli@24.14.0 build --profile production --platform android --auto-submit
```

That needs a **Google service account key**, once: Google Cloud → IAM →
Service accounts → create one → Keys → add a JSON key. In Play Console →
Users and permissions, invite the service account's address with the
release permissions for this app. Then `eas credentials` → Android →
`space.ancestree.app` → Google Service Account → upload the JSON, so it's
kept on EAS like the App Store key.

## App content

Play Console → Policy and programs → **App content**.

- **Privacy policy:** `https://www.ancestree.space/privacy`. It already
  covers Google's speech recognition, Claude and deleting an account from
  the app.
- **Ads:** No ads.
- **App access:** All or some functionality is restricted. Add the review
  account, as for Apple:
  - Name: `App review`
  - Username: `delivered+app-review@resend.dev`
  - Password: what `npm run review:account` printed (run it before each
    review, `-- --off` after).
  - Other information: the same notes as in `docs/app-store-review.md`,
    with "tap 'email me a code', then enter the password".
- **Content rating:** the IARC questionnaire. Category: Social or
  communication. Users can interact and exchange content: **Yes** (stories,
  photos, messages). Shares the user's location: No. Digital purchases: No.
  Everything about violence, sexuality, language, drugs and gambling: No.
- **Target audience:** 18 and over only. Children are on the tree as their
  parent's entries but never have accounts (Step 98), so the app isn't for
  them and stays out of the Families policy.
- **News app:** No. **Government app:** No. **Financial features:** none.
  **Health:** none.
- **Data safety:** below.
- **Account deletion URL:** `https://www.ancestree.space/account` (sign in,
  then delete the account). The app deletes an account from Settings too
  (Step 176).

## Data safety

Play Console → App content → **Data safety**.

- Does the app collect or share any of the required user data types? **Yes.**
- Is all of the user data encrypted in transit? **Yes.**
- Which account creation methods? **Username and other authentication**
  (an email and a code it sends).
- Users can ask for their data to be deleted: **Yes.**

Collected, never shared (Supabase, Vercel, Resend and Anthropic act for
ancestree, which Google counts as collecting, not sharing), not processed
ephemerally:

| Category | Data type | Required? | Purposes | What it is in ancestree |
| --- | --- | --- | --- | --- |
| Personal info | **Name** | Required | App functionality, Account management | Their own name, and their entry on the tree. |
| Personal info | **Email address** | Required | App functionality, Account management | The address they sign in with, and a relative's they invite to claim an entry. |
| Personal info | **User IDs** | Required | App functionality, Account management | Their account's ID, which every row they add is kept under. |
| Personal info | **Other info** | Optional | App functionality | Birth and death dates and places, sex, and who is whose parent or spouse, on the family tree. |
| Photos and videos | **Photos** | Optional | App functionality | Photos added to someone's album. |
| Audio | **Voice or sound recordings** | Optional | App functionality | A story told aloud to the scribe: the recording is kept with it. |
| App activity | **Other user-generated content** | Optional | App functionality | Written stories, their titles and credits, comments. |

Not collected: location (a place of birth is typed), financial info,
health, contacts, calendar, files, web browsing, search history (the search
runs on the phone), app interactions, crash logs and diagnostics (no
analytics or crash reporting in the app), device IDs.

**Messages:** the server keeps who wrote to whom and when, never a
message's words, which only the members' devices can read. Check Google's
current wording on end-to-end encrypted data before deciding whether
"Other in-app messages" belongs in the table.

## Permissions

What the app asks Android for, and when. `app.json`
`android.blockedPermissions` takes out the template's storage and overlay
permissions.

| Permission | Set by | Asked when |
| --- | --- | --- |
| `RECORD_AUDIO` | `expo-speech-recognition` plugin | Telling a story aloud |
| `CAMERA` | `expo-camera` plugin | Scanning the code that links the phone to your messages |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE` | Expo | Never asked: granted at install |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | `expo-secure-store` | Never: the app keeps its session without them |

Photos come through Android's photo picker, which needs no permission, so
the app has none of Google's restricted photo and video permissions. A
development build adds a few more for Metro (`SYSTEM_ALERT_WINDOW`,
`CHANGE_WIFI_MULTICAST_STATE`); the Play build doesn't.

## Store listing

Play Console → Grow users → Store presence → **Main store listing**.

- **App name:** ancestree
- **Short description** (80 characters at most): the brand's tagline from
  the Notion brand page.
- **Full description:** from the home page and `/features`.
- **App icon:** 512 × 512 PNG, the same mark as the iPhone's
  (`mobile/assets/icon.png` scaled).
- **Feature graphic:** 1024 × 500.
- **Phone screenshots:** at least 2, from the emulator or a phone.
