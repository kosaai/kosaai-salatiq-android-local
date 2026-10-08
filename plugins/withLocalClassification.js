const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod, withAndroidManifest, withSettingsGradle } = require('expo/config-plugins');

module.exports = function withLocalClassification(config) {
  config = withSettingsGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.split('\n').map((line) => line.trimEnd()).join('\n');
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    const marker = '// Salatiq bundled TFLite asset (memory-mapped offline).';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `\n${marker}\nandroid { androidResources { noCompress += ['tflite'] } }\n`;
    }
    return mod;
  });
  config = withDangerousMod(config, ['android', async (mod) => {
    const assets = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/assets');
    fs.mkdirSync(assets, { recursive: true });
    fs.copyFileSync(
      path.join(mod.modRequest.projectRoot, 'salatiq_yolo26n_cls_fp16.tflite'),
      path.join(assets, 'salatiq_yolo26n_cls_fp16.tflite'),
    );
    // The attached icon has to be supplied as a readable file. Until then, remove
    // template icons instead of shipping an old repository logo or placeholder.
    if (!mod.android?.icon) {
      const resources = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      fs.rmSync(path.join(resources, 'drawable/ic_launcher_background.xml'), { force: true });
      for (const folder of fs.readdirSync(resources)) {
        if (!folder.startsWith('mipmap-')) continue;
        for (const file of fs.readdirSync(path.join(resources, folder))) {
          if (file.startsWith('ic_launcher')) fs.unlinkSync(path.join(resources, folder, file));
        }
      }
    }
    return mod;
  }]);
  return withAndroidManifest(config, (mod) => {
    if (!mod.android?.icon) {
      const application = mod.modResults.manifest.application[0].$;
      delete application['android:icon'];
      delete application['android:roundIcon'];
    }
    return mod;
  });
};
