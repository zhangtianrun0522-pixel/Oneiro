import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

function assertIncludes(relativePath: string, expected: string): void {
  assert.ok(
    read(relativePath).includes(expected),
    `${relativePath} should include ${expected}`
  );
}

const requiredFunctions = [
  'cloudHealth',
  'login',
  'interpretDream',
  'generateDreamImage',
  'saveProfile',
  'saveDream',
  'trackEvent',
  'createShareCard',
  'getShareCard',
  'speechRecognize',
  'profileMemory',
];

const projectConfig = readJson<{
  appid?: string;
  cloudfunctionRoot?: string;
}>('miniprogram/project.config.json');

assert.equal(projectConfig.appid, 'wx61800035c4e1a092', 'project.config.json should use the real Mini Program AppID');
assert.equal(projectConfig.cloudfunctionRoot, 'cloudfunctions/', 'project.config.json should declare cloudfunctionRoot');

const privateConfig = readJson<{ appid?: string }>('miniprogram/project.private.config.json');
assert.equal(privateConfig.appid, projectConfig.appid, 'private appid should match project appid');

for (const name of requiredFunctions) {
  const base = `miniprogram/cloudfunctions/${name}`;
  assert.ok(exists(`${base}/index.js`), `${name} should have index.js`);
  assert.ok(exists(`${base}/package.json`), `${name} should have package.json`);

  const packageJson = readJson<{
    main?: string;
    dependencies?: Record<string, string>;
  }>(`${base}/package.json`);
  assert.equal(packageJson.main, 'index.js', `${name} package main should be index.js`);
  assert.ok(packageJson.dependencies?.['wx-server-sdk'], `${name} should depend on wx-server-sdk`);

  assertIncludes(`${base}/index.js`, "require('wx-server-sdk')");
  assertIncludes(`${base}/index.js`, 'cloud.init');
}

assertIncludes('miniprogram/utils/cloudBase.js', 'wx.cloud.init');
assertIncludes('miniprogram/utils/cloudBase.js', 'cloud1-d9gb0sjvg6a8d9864');
assertIncludes('miniprogram/utils/cloudBase.js', 'wx.cloud.callFunction');
assertIncludes('miniprogram/utils/cloudBase.js', 'cloudHealth');
assertIncludes('miniprogram/utils/cloudBase.js', 'generateDreamImage');
assertIncludes('miniprogram/utils/cloudBase.js', 'imageHealth');
assertIncludes('miniprogram/utils/cloudBase.js', 'startDreamImageQuality');
assertIncludes('miniprogram/utils/cloudBase.js', 'pollDreamImageQuality');
assertIncludes('miniprogram/utils/cloudBase.js', 'getProfileMemory');
assertIncludes('miniprogram/utils/cloudBase.js', 'generateProfilePortrait');

assertIncludes('miniprogram/pages/new-dream/index.js', "cloudBase.interpretDream");
assertIncludes('miniprogram/pages/new-dream/index.js', "cloudBase.saveDream");
assertIncludes('miniprogram/pages/new-dream/index.js', "dream_saved_before_interpretation");
assertIncludes('miniprogram/utils/cloudBase.js', "deleteDream");
assertIncludes('miniprogram/utils/cloudBase.js', "getDreamArchive");
assertIncludes('miniprogram/pages/dream-chat/index.js', "cloudBase.chatAboutDream");
assertIncludes('miniprogram/pages/dream-chat/index.js', "cloudBase.saveDream");
assertIncludes('miniprogram/pages/profile/index.js', "cloudBase.saveProfile");
assertIncludes('miniprogram/pages/result/index.js', "cloudBase.generateDreamImage");
assertIncludes('miniprogram/pages/result/index.js', "cloudBase.createShareCard");
assertIncludes('miniprogram/pages/share/index.js', "cloudBase.getShareCard");

assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'users');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'dream_entries');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'life_notes');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'profile_snapshots');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'profile_memory_state');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'deletion_jobs');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'events');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'share_pages');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'generated_assets');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'image_generation_jobs');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'INTERPRET_PROVIDER');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'DEEPSEEK_API_KEY');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'OPENAI_COMPATIBLE_API_KEY');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'cloudbase-static-fallback');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'healthCheck');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'providerConfigured');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'OPENAI_IMAGE_API_KEY');
assertIncludes('docs/CLOUDBASE_DEPLOYMENT.md', 'generateDreamImage');
assertIncludes('miniprogram/cloudfunctions/generateDreamImage/index.js', 'qualityChannel');

console.log('CloudBase deployment readiness checks passed.');
