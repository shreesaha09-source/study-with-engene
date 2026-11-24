# Firebase setup for ENGENEverse

This integration uses Firebase Authentication for Google sign-in and Cloud Firestore for per-account backups. App data is stored under `users/{Firebase UID}`. The sync stores all `esc_*` localStorage state plus the custom background and saved picture-sticker blobs from IndexedDB. Binary data is split into Firestore documents under 600 KB so a single Firestore document stays below its 1 MiB limit. Firebase Storage is not used.

## 1. Create and configure the Firebase project

1. In the [Firebase Console](https://console.firebase.google.com/), create or select a project.
2. Add a Web app under Project settings → Your apps.
3. Copy its config object into `firebase-config.js`, replacing each `PASTE_...` value. The web config is safe to include in a client app; access is protected by Authentication and Firestore Rules.
4. Under Authentication → Sign-in method, enable **Google**.
5. Under Authentication → Settings → Authorized domains, add the exact deployed app hostname. For this repository's GitHub Pages site, add `shreesaha09-source.github.io`.
6. Under Build → Firestore Database, create a database.

## 2. Publish Firestore rules

Open Firestore Database → Rules and publish the contents of `firestore.rules`. These rules restrict each account to documents whose path contains its own Firebase UID.

## 3. Deploy and verify

Deploy the updated site over HTTPS. Open Settings → Your Data, sign in with Google, and wait for **Everything is saved to your Google account.** A second browser or freshly cleared site data should restore the same account's state after Google sign-in.

The first Firebase sign-in attempts a one-time import of an existing Supabase `user_app_data` snapshot for the same Google account. The previous Supabase Google provider remains in use for the app's community features.

## Free-plan note

Firestore has a no-cost quota of 1 GiB stored data, 50,000 document reads/day, and 20,000 writes/day. Cloud Storage is not used, so the background and custom picture stickers are stored in Firestore chunks. When free quota is exceeded on Firebase's Spark plan, Firestore use is paused until quota resets or the project is upgraded. Review Firebase's current pricing and limits before launch.
