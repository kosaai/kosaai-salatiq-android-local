# Android-local implementation and validation

Validation host: Linux **aarch64**, Node **24.19.0**, Expo SDK **57.0.27**,
React Native **0.86.3**, downloaded Corretto **21** and Android SDK **36**.
Tooling downloads/caches are ignored inside `.android-tools/`; they are not app
dependencies and are not committed. No old repository was modified.

## Files added

- Generated Android Studio project: `android/` (Gradle wrapper, Gradle config,
  Kotlin application/activity, manifests, generated resources and bundled model).
- `modules/local-classification/`: local Expo module, Android manifest/Gradle
  dependencies, Kotlin camera view, classifier, frame/RGB preprocessing,
  Pillow-reference JUnit test and four compressed RGB reference fixtures.
- `components/LocalClassificationCamera.tsx` and
  `components/LocalClassificationCamera.android.tsx`.
- `services/engineConnection.android.ts` and `services/predictionApi.android.ts`.
- `plugins/withLocalClassification.js` and `app.config.js`.
- `scripts/prepare-launcher-icon.py`, `scripts/verify-android-assets.mjs`,
  `scripts/verify-apk-model.py`, `scripts/check-model.py`,
  `scripts/generate-preprocessing-goldens.py`,
  `scripts/test-prayer-regression.cjs`, `scripts/verify-inference-bundles.mjs`.
- `README.md` and this report.
- `.gitattributes`: normalize text while preserving model/image/archive bytes
  and Windows batch-script checkout line endings.

## Existing files modified

- `.gitignore`: track generated Android source, exclude local tools/builds/keys.
- `app.json`: Arabic name **صلاتك**, Android ID **com.kosaai.salatiq**, camera
  permission, microphone permission removal, native plugin; detach old icon config.
- `components/PrayerCamera.tsx`: Android native preview/results use the shared
  original stability path; preserve the Web capture/API path and UI.
- `components/PrayerOverviewCard.tsx`: claim on-device processing only on Android;
  correctly identify server processing on the remote platform path.
- `hooks/useEngineConnection.ts`: check the local Android module rather than
  requiring a backend URL.
- `package.json`, `package-lock.json`: SDK-compatible patches, required font and
  system UI dependencies, native-run/typecheck/preparation scripts.

## Verified implementation facts

The application loads **`assets/salatiq_yolo26n_cls_fp16.tflite`** with Android's
`AssetManager.openFd`, never from the repository root at runtime. Its generated
source path is `android/app/src/main/assets/salatiq_yolo26n_cls_fp16.tflite`.
The copy has the same SHA-256 as the original:

`884c2a67eeb20a38e9125faa66bc49a553b983563119e663a385862b4061dea6`.

Dependency: **`com.google.ai.edge.litert:litert:1.4.2`** using the standalone
`org.tensorflow.lite.Interpreter`; **CameraX 1.6.0**; local Expo Modules API view.
The runtime validates **FLOAT32 input `[1,224,224,3]`** and **FLOAT32 output `[1,4]`**.
The model retains **FP16 internal weights** and its existing final Softmax.

Native preprocessing: crop rectangle/plane strides; limited-range BT.601 YUV to
RGB; CameraX rotation metadata; unmirrored upright scene; antialiased bilinear
short-edge resize to 224, aspect ratio preserved; round-to-even center crop to
224×224; RGB `/255`, mean zero/std one; interleaved FLOAT32 NHWC. Kotlin matches
independent Pillow fixtures within one 8-bit channel value.

Authoritative index order: **0 BOWING, 1 PROSTRATING, 2 SITTING, 3 STANDING**.
Argmax is always accepted; no confidence gate, new classes or second Softmax.

Results arrive at most every 250 ms and enter the original result-driven filter:
the first result begins a candidate; another matching result after 1,000 ms
confirms it. Elapsed time alone cannot confirm it. `lastLivePoseRef` still
suppresses repeated confirmed poses. `services/prayerEngine.ts`,
`hooks/usePrayerSession.ts`, all sequence constants/types, `activeSahwEvent`,
transition timers, sahw recovery and final-tashahhud's 10-second timer are
unchanged. All five prayer sequences and final-tashahhud delayed alert/recovery
passed the regression script.

Android Metro source maps resolve `.android.ts` inference services and the
native camera view. The remote inference service implementations are absent
from the Android bundle; the Web bundle resolves its original services.

## Commands actually executed

Project/dependency checks:

```sh
npx tsc --noEmit
npx expo lint
npm run typecheck
npm run lint
npm run android:verify-assets
node scripts/verify-android-assets.mjs
npx expo install --check
npx expo install --fix
npx expo install expo-system-ui
npx expo install expo-font
CI=1 npx expo prebuild --platform android --no-install
CI=1 npm run android:prepare
npx expo-doctor
npx expo-modules-autolinking resolve --platform android --json
npx expo-modules-autolinking verify
git diff --check
git diff --cached --check
```

Typecheck, lint, SDK dependency compatibility and autolinking passed. Expo Doctor
ended at **20/21 checks passing**: the remaining advisory concerns app-config
synchronization because `android/` is committed. The documented build setup runs
`android:prepare`, which synchronizes the native config through prebuild.

Bundle checks:

```sh
npx expo export --platform android --platform web --output-dir validation-output/export --source-maps
npx expo export --platform android --platform web --output-dir validation-output/export --source-maps --no-bytecode
npx expo export --platform android --platform web --output-dir validation-output/export --source-maps --no-bytecode --max-workers 2
node scripts/verify-inference-bundles.mjs
```

The first export could not execute the x86-64 Hermes compiler on this ARM64
host. A no-bytecode retry timed out; another exposed an empty cached favicon
left by the interrupted export. After removing only that zero-byte generated
cache file, the **Android JavaScript and Web export both passed**, and the
platform-specific inference bundle check passed. This is not a native APK build.

Model/preprocessing/prayer checks:

```sh
python3 -m venv .android-tools/python
.android-tools/python/bin/pip install ai-edge-litert pillow numpy
.android-tools/python/bin/python scripts/generate-preprocessing-goldens.py
.android-tools/python/bin/python scripts/check-model.py
npx tsc services/prayerEngine.ts constants/fajrSequence.ts constants/fourRakahSequence.ts constants/maghribSequence.ts --module commonjs --target ES2020 --outDir validation-output/prayer --skipLibCheck --ignoreConfig
node scripts/test-prayer-regression.cjs validation-output/prayer
```

Actual bundled model inference passed on the host with three synthetic constant
inputs: finite four-class Softmax outputs summing to one. Inspection also
confirmed 81 FLOAT16 tensors, FLOAT32 I/O shapes and the terminal Softmax op.
This validates real model execution, not recognition accuracy on prayer images.

The Kotlin RGB preprocessor and JUnit test were also compiled with
`org.jetbrains.kotlin.cli.jvm.K2JVMCompiler` from the downloaded Kotlin 2.1.20
compiler jars and run through `org.junit.runner.JUnitCore
com.kosaai.classification.RgbPreprocessorTest`: **1 test passed**, covering four
aspect ratios, downsampling, upsampling, center-crop rounding, RGB normalization
and buffer reuse. An initial host compiler invocation used an overly broad
classpath and failed; the correctly scoped Kotlin compiler classpath passed.

Gradle commands (with `JAVA_HOME`, `ANDROID_HOME`, `GRADLE_USER_HOME` set to the
ignored `.android-tools/` installation):

```sh
./android/gradlew -p android :app:assembleDebug :local-classification:testDebugUnitTest --no-daemon
./android/gradlew -p android :app:assembleDebug :local-classification:testDebugUnitTest --no-daemon --console=plain
./android/gradlew -p android :local-classification:compileDebugKotlin :local-classification:testDebugUnitTest :app:mergeDebugAssets :app:processDebugMainManifest --no-daemon --console=plain --max-workers=2
./android/gradlew -p android :app:assembleDebug --no-daemon --console=plain --max-workers=2
```

The initial full Gradle attempts exceeded the execution timeout while compiling
plugins/installing native toolchains and resolving build tasks. After using an
ignored host-only Gradle property for in-process Kotlin compilation, the focused
native checks **succeeded in 6m 14s**:

- `:local-classification:compileDebugKotlin`: passed against actual Expo/RN,
  CameraX and LiteRT dependencies.
- `:local-classification:testDebugUnitTest`: **1 test, zero failures/errors**.
- `:app:mergeDebugAssets`: passed; the actual Gradle asset at
  `android/app/build/intermediates/assets/debug/mergeDebugAssets/salatiq_yolo26n_cls_fp16.tflite`
  was byte-for-byte verified against the original model.
- `:app:processDebugMainManifest`: passed; merged manifest verified to have the
  correct package/label reference and camera permission, without microphone
  permission or a substituted launcher icon.

The focused Gradle checks were repeated after the final config-plugin/prebuild
changes and **passed again in 4m 14s**. Android/Web export and platform-resolution
verification also passed after the final UI integration changes.

The LiteRT 1.4.2 implementation/API AARs were independently downloaded and their
`Interpreter.Options` API checked with `javap` to confirm the used XNNPACK/thread
configuration methods. Native dependency resolution and Kotlin compilation are
verified.

**Full Android APK build did NOT succeed.** The final `:app:assembleDebug`
attempt failed after 1m 54s at `:app:processDebugResources`: the Android Gradle
plugin's `aapt2-8.12.0-13700139-linux` executable is x86-64 and cannot run on this
aarch64 host (`cannot execute binary file`). This is a host-toolchain limitation,
not a Kotlin compilation error in the local module. No APK/AAB was produced, so
the model's final APK/AAB ZIP entry could not yet be inspected. Its prebuild copy
and actual Gradle-merged asset contents have both been verified.

## Exact launcher image and Sahw audio integration (2026-10-08)

The user subsequently supplied readable root files `salatiq.png` and
`سبحان الله (1).mp3`. The launcher is now configured/generated from that exact
PNG, with no substitute artwork. `assets/launcher/source.png` matches its bytes;
`icon.png` and `adaptive-foreground.png` preserve its image/aspect ratio. The
adaptive foreground fits all corners inside the safe circle. Provenance records
SHA-256 `9dbcfd9a0988089d0c8040c0db3100cc3adf522e7aab68d5454a5990cbe54fae`
and sampled background `#FDFAEC`.

Generated launcher files are under `android/app/src/main/res/`:
`mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher*.webp`,
`mipmap-anydpi-v26/{ic_launcher,ic_launcher_round}.xml`, and background/color
resources. The manifest references the generated normal/round launchers. Expo
config and adaptive XML references passed strict verification.

The supplied MP3 is copied byte-for-byte to `assets/audio/subhan_allah.mp3` and,
through the `expo-asset` config plugin, to native `res/raw/subhan_allah.mp3`.
SHA-256 of all copies:
`d383c705a06644e1b6fb1cff5d0ee568e5a2ba404eee26f590b3b63d7e6fafb7`.
`ffprobe` confirmed MP3, 44.1 kHz stereo, 1.724082 seconds.

The existing `expo-audio ~57.0.5` dependency is used; no dependency was added.
`HomeScreen.tsx` calls `useSahwAlertAudio`, which loads on mount, reuses the player,
observes `useAudioPlayerStatus`, seeks once and plays once for each claimed event.
Android uses the explicit local URI `file:///android_res/raw/subhan_allah.mp3`;
`downloadFirst` is false. No network is needed, including native debug playback.
Looping is false. Expo releases the player on unmount, and a generation guard
cancels asynchronous playback after session changes/unmount.

`services/sahwAudio.ts` is a read-only event tracker. The unchanged engine keeps
one stable active-event object until recovery, and creates a fresh object for
every activation. A per-session WeakSet prevents duplicates while allowing a
new event with the same type/stage. An append-only history cursor catches events
already recovered inside the same update; simultaneous activation/history
append is counted once. Playback/status updates cannot create new claims.

Actual additional checks:

```sh
.android-tools/python/bin/python scripts/prepare-launcher-icon.py salatiq.png
CI=1 npm run android:prepare
node scripts/verify-android-assets.mjs --require-icon
npx expo install --check
npm run typecheck
npm run lint
npx tsc services/prayerEngine.ts services/sahwAudio.ts constants/fajrSequence.ts constants/fourRakahSequence.ts constants/maghribSequence.ts --module commonjs --target ES2020 --outDir validation-output/prayer --skipLibCheck --ignoreConfig
node scripts/test-prayer-regression.cjs validation-output/prayer
node scripts/test-sahw-audio.cjs validation-output/prayer
npx expo export --platform android --platform web --output-dir validation-output/export --source-maps --no-bytecode --max-workers 2
node scripts/verify-inference-bundles.mjs
git diff --check
```

All listed checks passed. The five-prayer engine tests verify no early sound,
one sound at final-tashahhud timeout, zero duplicates across 100 active-event
updates, silent recovery, new activation with reused history, session reset,
and immediately recovered events. The actual hook also passed simulated-player
tests for preloading, 100 repeated renders, subsequent playback after Android's
ended state, no automatic replay/loop, and session/unmount seek cancellation.
These are host simulations, not audible/native device tests.

Diff checks confirm no modifications to `prayerEngine`, `usePrayerSession`,
`PrayerCamera`, the local classification module, or sequence constants/types.
Android/Web exports and platform-specific inference resolution still pass.

The APK/AAB ZIP verifier now checks the exact `res/raw/subhan_allah.mp3` bytes
(prefixed `base/` in AABs) as well as the bundled uncompressed model.

Native checks were executed again with the existing `.android-tools/` JDK/SDK
and Gradle cache environment:

```sh
./android/gradlew -p android :local-classification:compileDebugKotlin :local-classification:testDebugUnitTest :app:mergeDebugAssets :app:mergeDebugResources :app:processDebugMainManifest --no-daemon --console=plain --max-workers=2
./android/gradlew -p android :app:assembleDebug --no-daemon --console=plain --max-workers=2
```

The focused checks **passed in 3m 4s**, including **1 JUnit test with zero
failures/errors**. The actual Gradle-packaged native MP3 at
`android/app/build/intermediates/packaged_res/debug/packageDebugResources/raw/subhan_allah.mp3`
matches the original bytes. All 15 packaged density-specific icon images match
the generated source resources, and the merged manifest references both
launchers and omits microphone permission. An independent Pillow comparison of
normal/foreground density resources with resized exact-source derivatives
passed (mean visible RGB error below 2/255 in every comparison).

The full APK build **failed again after 49s** at `:app:processDebugResources`:
the x86-64 AAPT2 executable cannot execute on this Linux ARM64 host. No APK/AAB
was produced. Actual final-archive verification and audible/device testing
therefore remain pending; successful resource merge is not an APK build.

## Animated startup integration (2026-10-08)

Added `components/StartupSplash.android.tsx` and its non-Android passthrough
`components/StartupSplash.tsx`; `src/app/_layout.tsx` wraps the existing navigator
without conditionally mounting/remounting it. Added
`scripts/prepare-startup-branding.py` and `assets/startup/{mark.png,name.png,provenance.json}`.
The source is the exact root `salatiq.png`, not another repository logo.
The extracted mark is the original Arabic calligraphy; the name is the original
Latin wordmark, not newly typeset text. Independent pixel comparisons confirm
all RGB values match the corresponding source crops and all core dark/gold
artwork remains fully opaque. Initial/final source-derived reference compositions
were inspected on the host; they are not native device screenshots.

Installed SDK-compatible `expo-splash-screen ~57.0.9` via `npx expo install` and
updated `package.json`/`package-lock.json`. Installation succeeded; the CLI could
not automatically edit dynamic app config, so the configured plugin was added
explicitly to `app.json`. The official plugin generated native light/night splash
images, cream colors, Android splash theme and `MainActivity` registration.
`scripts/verify-android-assets.mjs` now checks source provenance, those resources,
launch-theme references and registration alongside model/icon/audio assertions.

The native splash shows the centered mark on `#FDFAEC` immediately and remains
visible until the React overlay's images have decoded and underlying app has
laid out. The next frame hides the native splash and begins the 1,280 ms sequence:
140 ms logo-only; 640 ms simultaneous subtle upward logo movement and downward
12 dp/fade-in wordmark; 240 ms settled composition; 260 ms overlay fade-out.
Animation uses React Native `Animated` with the native driver, transform/opacity
only, cubic easing, and no springs/loop. Reduced motion uses a 180 ms fade.
Images are local bundled assets and require no font loading. Animations/queued
frames are cancelled on unmount. App content remains mounted throughout.

Commands executed for this task:

```sh
npx expo install expo-splash-screen
.android-tools/python/bin/python scripts/prepare-startup-branding.py
CI=1 npm run android:prepare
npx expo install --check
npm run typecheck
npm run lint
node scripts/test-prayer-regression.cjs validation-output/prayer
node scripts/test-sahw-audio.cjs validation-output/prayer
npx expo export --platform android --platform web --output-dir validation-output/export --source-maps --no-bytecode --max-workers 2
node scripts/verify-inference-bundles.mjs
git diff --check
```

Preparation/native-resource verification, Expo compatibility, Android/Web export,
platform inference resolution, five-prayer regressions and one-shot Sahw tests
passed. Typecheck/lint passed after adapting to the actual RN 0.86 APIs
(`StyleSheet.absoluteFill`, `useAnimatedValue`). A later concurrent typecheck
collided with the exporter replacing ignored output files; its generated-file
errors are a tooling race, not source diagnostics, and checks were rerun after
export completed.

Final typecheck/lint, native autolinking verification and startup platform
resolution checks all passed. The full source artwork fits Android's splash
safe circle: maximum visible radius **94.15 dp**, below the **96 dp** limit at
the selected 184 dp image width. All five generated day/night density pairs
contain identical artwork.

Native commands (using the existing ignored JDK/SDK/Gradle cache environment):

```sh
./android/gradlew -p android :app:mergeDebugAssets :app:mergeDebugResources :app:processDebugMainManifest :local-classification:compileDebugKotlin :local-classification:testDebugUnitTest --no-daemon --console=plain --max-workers=2
./android/gradlew -p android :app:assembleDebug --no-daemon --console=plain --max-workers=2
```

Focused checks **passed in 3m 5s**; the JUnit result is **1 test, zero failures
or errors**. All ten Gradle-packaged day/night splash images match their
generated exact-source images. The merged activity uses
`@style/Theme.App.SplashScreen`, microphone permission remains absent, and
Gradle-packaged model/audio bytes still match their originals.

The full APK attempt **failed after 48s** at `:app:processDebugResources` with
the same x86-64 AAPT2 `cannot execute binary file` limitation on the ARM64 host.
No APK/AAB was produced. A successful resource merge does not validate native
screen rendering or replace release/device testing.

No prayer logic, native TFLite implementation or Sahw playback code was changed
by this startup task. No push was attempted. The release-native visual handoff,
Android icon masking/position across OS versions, absence of flashes, timing and
reduced-motion behavior still require an installed release app on a device.

## Remaining device/Android Studio checks

1. Complete Gradle build/sync on a supported Android Studio host and inspect the
   real APK/AAB with `scripts/verify-apk-model.py`.
2. Verify the generated exact-image launcher appearance/name on target launchers.
3. Install a release APK, disable Wi-Fi/mobile data, cold start and start prayer
   classification: the model must be immediately available with no API URL.
4. Front/back camera permission, orientation, plane strides/colors, mirrored
   preview versus unmirrored inference; representative standing/bowing/sitting/
   prostrating images and whole-body framing under different lighting/distances.
5. Session start/stop, switching camera, switching prayers, background/resume,
   activity destruction and cleanup with no stale predictions.
6. Physical timing of candidate confirmation, ITIDAL/sujud/rak'ah progression,
   sahw recovery and the final-tashahhud 10-second delayed alert.
7. Sustained-session latency, temperature and memory on representative phones;
    sampling is 4 Hz maximum but actual throughput depends on hardware.
8. With network disabled, verify audible one-shot Sahw playback for a new event,
   no repeats while active, new same-stage event playback after recovery, session
   switching and resource cleanup; verify latency/volume and background/resume.
9. Test the release startup sequence on Android 12+ and an older supported OS:
   cold launch in light/dark mode, no blank/white frame or native-to-React logo
   jump, 1–1.5 s smooth upward-logo/downward-name motion, centered final layout,
   fade into the app, reduced motion and activity recreation. Returning to the
   root route/resuming an existing activity should not replay the intro.

## Git publication status

The implementation was reviewed and committed locally on `main`. Before the
push attempt, `git remote -v` and both origin URL lists were checked to contain
only `https://github.com/kosaai/kosaai-salatiq-android-local.git`.

```sh
GIT_TERMINAL_PROMPT=0 git push origin main
```

The push **did not succeed**: Git reported `could not read Username for
'https://github.com': terminal prompts disabled`. No GitHub credentials are
available in this environment, so publication needs authenticated Git access.
The old Classification repository was not modified or pushed to.

For the subsequent icon/audio task, the user requested **no push**. No push was
attempted, and these additional changes are left uncommitted for review.
