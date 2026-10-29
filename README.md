# Dead Archive Radio

A native iOS and Android listening app for browsing and streaming Grateful Dead concert recordings hosted by the Internet Archive. It streams audio in place and has no download or offline-listening flow.

## First version

- Browse recordings from the Internet Archive's `GratefulDead` collection (`mediatype:etree`).
- Load the default archive list in descending all-time download count; searches stay sorted by show date.
- Search by year, date, venue, or show title.
- Filter loaded shows by soundboard, audience, and matrix source; show Archive ratings when available.
- Save favorite recordings on the device.
- Stream MP3/Ogg/M4A tracks from Archive.org in the app.
- Resume the last show and track near the saved playback position.
- Retry an interrupted stream and continue through tracks automatically.
- Continue playback in the background with lock-screen controls and seek buttons.
- Keep the app player visible while browsing.

## Run on a phone

1. Install Node.js 22.13 or newer and Expo Go on your iPhone or Android phone.
2. In this folder, run `npm install` and then `npx expo start --go -c`.
3. Scan the Expo QR code with the Expo Go app (Android) or the iPhone Camera app.

### Windows quick start

Download or clone the repository, open the project folder that contains `package.json`, and double-click `start-expo-go.bat`. It syncs dependencies and starts Expo with a clean Metro cache. Scan the QR code with Expo Go on your Android phone. This flow does not require Android Studio or an Android SDK.

If you use the terminal instead, run `npm install` and `npx expo start --go -c` from that same project folder. Do not use `npx expo run:android` for Expo Go; that command builds a native Android app and requires Android Studio and the Android SDK.

This project targets Expo SDK 58 so it can be tried with the compatible Expo Go release. Expo Go is useful for checking the screens and foreground streaming. Background playback and lock-screen controls need a project-specific native build; the required iOS and Android settings are already configured. A signed install or App Store / Google Play release needs platform builds and store accounts.

## Build

- Android: `npx expo run:android` with Android Studio and an Android device/emulator, or configure an EAS Android build.
- iOS: `npx expo run:ios` on macOS with Xcode, or configure an EAS iOS build.

### Android development build for background audio

Expo Go does not include this project's native audio playback service. To build an installable development APK using EAS, log in and link the project once, then build:

```sh
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile development
```

After installing the APK, start Metro for the development client with `npm run start:dev-client`. The development profile is for testing and is not the Play Store release bundle; use the `production` profile for the AAB.

## Data and playback

The app reads the Internet Archive advanced search endpoint for `collection:GratefulDead AND mediatype:etree`, then reads per-show metadata and plays the Archive-hosted audio URLs. It does not download or store audio locally. Favorites and the last playback position are stored on the device. Search results, source labels, ratings, and streaming availability depend on the metadata and files the Archive provides. The app links the recordings back to their Archive.org item pages when needed.

This is an independent fan project, not affiliated with or endorsed by the Grateful Dead or Internet Archive. Keep the service noncommercial and follow the Internet Archive and collection policies.
