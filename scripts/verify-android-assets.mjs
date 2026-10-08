import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
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

if (!fs.existsSync('assets/launcher/source.png')) {
  console.log('ICON BLOCKED: exact conversation attachment is not available as a readable source file.');
  assert.doesNotMatch(manifest, /android:(?:icon|roundIcon)=/);
  if (process.argv.includes('--require-icon')) process.exitCode = 1;
} else {
  const provenance = JSON.parse(fs.readFileSync('assets/launcher/provenance.json', 'utf8'));
  assert.equal(hash('assets/launcher/source.png'), provenance.sha256);
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const icon of ['ic_launcher.webp', 'ic_launcher_round.webp', 'ic_launcher_foreground.webp']) {
      assert(fs.existsSync(`android/app/src/main/res/mipmap-${density}/${icon}`), `Missing ${density}/${icon}`);
    }
  }
  assert(fs.existsSync('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'));
  console.log('Exact-source launcher provenance and generated Android density/adaptive resources verified.');
}
