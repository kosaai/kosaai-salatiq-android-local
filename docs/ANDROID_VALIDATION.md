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

## Launcher image status

**NOT completed:** the original conversation attachment PNG is not accessible
as a readable file in this environment. No alternative Salatiq logo or generated
replacement was used. There are currently **no generated `ic_launcher*`
resources**; template launcher artwork/references were removed by the plugin.
`README.md` explains how to feed that exact PNG into the preparation script,
then prebuild the density-specific/adaptive resources. The strict
`--require-icon` verification fails until the actual source is supplied.

## Remaining device/Android Studio checks

1. Complete Gradle build/sync on a supported Android Studio host and inspect the
   real APK/AAB with `scripts/verify-apk-model.py`.
2. Install the exact attached image and verify its launcher appearance/name.
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
