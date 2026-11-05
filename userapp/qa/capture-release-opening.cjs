// Records one cold launch on an explicitly selected, authorized Android target.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const serial = process.argv[2];
if (!serial) throw new Error('Pass the authorized ADB serial');
const adb = 'D:/Android/Sdk/platform-tools/adb.exe';
const pkg = 'com.printlly.customer';
const target = path.resolve(__dirname, '../../design/implementation-validation');
const run = (...args) => cp.execFileSync(adb, ['-s', serial, ...args]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  run('shell', 'am', 'force-stop', pkg);
  run('shell', 'dumpsys', 'gfxinfo', pkg, 'reset');
  const record = cp.spawn(adb, ['-s', serial, 'shell', 'screenrecord', '--time-limit', '18', '--bit-rate', '3000000', '/sdcard/printlly-opening-release.mp4']);
  const recordingDone = new Promise((resolve, reject) => { record.on('error', reject); record.on('close', code => code === 0 ? resolve() : reject(new Error(`screenrecord ${code}`))); });
  await delay(500);
  const launch = run('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`).toString();
  fs.writeFileSync(path.join(target, 'android-opening-release-launch.txt'), launch);
  console.log(launch);
  await recordingDone;
  run('pull', '/sdcard/printlly-opening-release.mp4', path.join(target, 'android-opening-release.mp4'));
  fs.writeFileSync(path.join(target, 'android-opening-release-gfxinfo.txt'), run('shell', 'dumpsys', 'gfxinfo', pkg, 'framestats'));
  fs.writeFileSync(path.join(target, 'android-opening-release-final.png'), run('exec-out', 'screencap', '-p'));
  console.log('Saved cold launch video, frame stats and final screenshot.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
