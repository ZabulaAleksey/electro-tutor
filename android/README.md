# ElectroTutor Android debug

Bundled responsive Astro application; package `dev.electrotutor.app`, min Android 8/API26, target35. Debug build only, not a Play Store/release package. No new JavaScript dependencies or Gradle download.

Prerequisites: pinned project pnpm, Node >=22.12, installed Android SDK platform35/build-tools36.0.0 and JDK. `build.ps1` accepts `-SdkRoot` and `-JdkRoot`; no installation or licence acceptance is performed.

```powershell
pwsh -NoProfile -File android/build.ps1
adb install -r android/build/electrotutor-debug.apk
adb shell am start -n dev.electrotutor.app/.MainActivity
```

The default command builds web production assets first. `-SkipWebBuild` is only for a just-verified current `dist`. Generated assets, APK and debug key remain ignored in `android/build`; never use this key for release signing.

The WebView serves bundled HTTPS assets locally (including Worker/WASM), uses local browser storage, native Back/fullscreen and Android file pickers. External HTTPS opens only after a user gesture and explicit confirmation. No JavaScript bridge, file URL access, certificate exception or cleartext. Debugging is enabled for this debug package.

Native acceptance: create a disposable emulator named `ElectroTutorSmoke`, install/start this APK, then run `node android/smoke.mjs emulator-5580 <screenshot.png>` with its explicit serial. The runner rejects other emulator names. It checks real WebView touch preview/commit, persistence, Back, local Worker calculations and temporarily disables networking only inside that emulator. A physical device has not been tested.
