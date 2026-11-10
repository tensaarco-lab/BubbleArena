# Bubble Pop Arena — native Android shell (offline WebView APK)

The game in `app/src/main/assets/www/` is bundled INSIDE the APK — no browser, no URL bar, works offline.

## Build without installing anything (recommended)
1. Create a GitHub repo and push the contents of this folder as the repo root.
2. Open the repo's Actions tab → `Build APK` run → download the `bubble-pop-arena-apk` artifact (`app-debug.apk`).
3. Send it to the phone, tap to install (allow “Install unknown apps” once). Debug builds install directly — no signing setup.

## Build locally
Open this folder in Android Studio → Run ▶ on a phone/emulator.

## Update the game later
Replace the files under `app/src/main/assets/www/` (fresh `index.html` + `src/*.js`), bump `versionCode`/`versionName` in `app/build.gradle`, push again.
