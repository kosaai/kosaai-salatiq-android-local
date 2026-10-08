import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const exportRoot = process.argv[2] || 'validation-output/export';
for (const platform of ['android', 'web']) {
  const dir = path.join(exportRoot, '_expo/static/js', platform);
  const filename = fs.readdirSync(dir).find((name) => /^entry-.*\.js\.map$/.test(name));
  assert(filename, `${platform} entry source map is missing`);
  const map = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8'));
  const suffix = platform === 'android' ? '.android' : '';
  for (const service of ['engineConnection', 'predictionApi']) {
    const expected = `/services/${service}${suffix}.ts`;
    const index = map.sources.findIndex((name) => name.endsWith(expected));
    assert(index >= 0, `${platform} is missing ${expected}`);
    if (platform === 'android') {
      assert(!map.sources.some((name) => name.endsWith(`/services/${service}.ts`)), 'Remote implementation included on Android');
      assert.doesNotMatch(map.sourcesContent[index], /\bfetch\s*\(/);
    }
  }
  assert(map.sources.some((name) => name.endsWith(`/components/LocalClassificationCamera${suffix}.tsx`)));
  console.log(`${platform}: expected camera view and inference services resolved.`);
}
