import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = process.cwd();
const model = 'salatiq_yolo26n_cls_fp16.tflite';
const packagedSource = path.join(root, 'android/app/src/main/assets', model);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(packagedSource), hash(path.join(root, model)), 'Android asset must match the original model');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
assert.match(gradle, /noCompress.*tflite/);
assert.match(gradle, /applicationId 'com\.kosaai\.salatiq'/);
assert.match(fs.readFileSync('android/app/src/main/res/values/strings.xml', 'utf8'), /name="app_name">صلاتك</);
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
assert.match(manifest, /android\.permission\.CAMERA/);
assert.match(manifest, /android:label="@string\/app_name"/);
console.log(`Bundled Android source asset verified: ${packagedSource}\nSHA256: ${hash(packagedSource)}`);
console.log('Arabic app name, package ID, camera permission and uncompressed TFLite packaging configured.');

const originalSound = 'سبحان الله (1).mp3';
assert.equal(hash('assets/audio/subhan_allah.mp3'), hash(originalSound), 'Audio copy must preserve the exact supplied MP3');
assert.equal(hash('android/app/src/main/res/raw/subhan_allah.mp3'), hash(originalSound), 'Android must embed the exact supplied MP3');
console.log(`Bundled native alert sound verified: res/raw/subhan_allah.mp3\nSHA256: ${hash(originalSound)}`);

if (!fs.existsSync('assets/launcher/source.png')) {
  console.log('ICON BLOCKED: exact conversation attachment is not available as a readable source file.');
  assert.doesNotMatch(manifest, /android:(?:icon|roundIcon)=/);
  if (process.argv.includes('--require-icon')) process.exitCode = 1;
} else {
  const provenance = JSON.parse(fs.readFileSync('assets/launcher/provenance.json', 'utf8'));
  assert.equal(hash('salatiq.png'), provenance.sha256, 'Launcher source must be the supplied salatiq.png');
  assert.equal(hash('assets/launcher/source.png'), provenance.sha256);
  const { exp } = createRequire(import.meta.url)('expo/config').getConfig(root);
  assert.equal(exp.icon, './assets/launcher/icon.png');
  assert.equal(exp.android.icon, './assets/launcher/icon.png');
  assert.equal(exp.android.adaptiveIcon.foregroundImage, './assets/launcher/adaptive-foreground.png');
  assert.equal(exp.android.adaptiveIcon.backgroundColor, provenance.backgroundColor);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const icon of ['ic_launcher.webp', 'ic_launcher_round.webp', 'ic_launcher_foreground.webp']) {
      assert(fs.existsSync(`android/app/src/main/res/mipmap-${density}/${icon}`), `Missing ${density}/${icon}`);
    }
  }
  assert(fs.existsSync('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'));
  for (const icon of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const adaptive = fs.readFileSync(`android/app/src/main/res/mipmap-anydpi-v26/${icon}`, 'utf8');
    assert.match(adaptive, /@mipmap\/ic_launcher_foreground/);
    assert.match(adaptive, /@color\/iconBackground/);
  }
  console.log('Exact-source launcher provenance and generated Android density/adaptive resources verified.');
}

const startup = JSON.parse(fs.readFileSync('assets/startup/provenance.json', 'utf8'));
assert.equal(startup.source, 'salatiq.png');
assert.equal(hash(startup.source), startup.sha256, 'Startup branding must derive from the exact supplied PNG');
const { exp } = createRequire(import.meta.url)('expo/config').getConfig(root);
const splash = exp.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1].android;
assert.equal(splash.image, './assets/startup/mark.png');
assert.equal(splash.backgroundColor, startup.backgroundColor);
assert.equal(splash.dark.backgroundColor, startup.backgroundColor);
assert.equal(splash.dark.image, splash.image);
assert.equal(splash.imageWidth, 184);
for (const folder of ['drawable-mdpi', 'drawable-hdpi', 'drawable-xhdpi', 'drawable-xxhdpi', 'drawable-xxxhdpi']) {
  assert(fs.existsSync(`android/app/src/main/res/${folder}/splashscreen_logo.png`));
  assert(fs.existsSync(`android/app/src/main/res/${folder.replace('drawable-', 'drawable-night-')}/splashscreen_logo.png`));
}
for (const folder of ['values', 'values-night']) {
  assert.match(fs.readFileSync(`android/app/src/main/res/${folder}/colors.xml`, 'utf8'), /name="splashscreen_background">#FDFAEC/i);
}
const styles = fs.readFileSync('android/app/src/main/res/values/styles.xml', 'utf8');
assert.match(styles, /name="Theme.App.SplashScreen" parent="Theme.SplashScreen"/);
assert.match(styles, /name="windowSplashScreenAnimatedIcon">@drawable\/splashscreen_logo/);
assert.match(styles, /name="postSplashScreenTheme">@style\/AppTheme/);
assert.match(manifest, /android:theme="@style\/Theme.App.SplashScreen"/);
assert.match(fs.readFileSync('android/app/src/main/java/com/kosaai/salatiq/MainActivity.kt', 'utf8'), /SplashScreenManager\.registerOnActivity\(this\)/);
console.log('Exact-source native splash image, day/night cream backgrounds, launch theme and Expo handoff registration verified.');
