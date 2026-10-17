// Local connected-device QA only: disable the fixture tunnel, record an offline
// cold launch, and always restore the tunnel. No OS network settings are changed.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const serial = process.argv[2];
if (!serial) throw new Error('Pass an authorized ADB serial');
const adb = 'D:/Android/Sdk/platform-tools/adb.exe';
const run = (...args) => cp.execFileSync(adb, ['-s', serial, ...args]);
const out = path.resolve(__dirname, '../../design/implementation-validation/mascot-android');
(async () => {
  try {
    run('reverse', '--remove', 'tcp:8083');
    run('shell', 'am', 'force-stop', 'com.printlly.customer');
    const recording = cp.spawn(adb, ['-s', serial, 'shell', 'screenrecord', '--time-limit', '12', '--bit-rate', '3000000', '/sdcard/printlly-cloud-recovery.mp4']);
    const complete = new Promise((resolve, reject) => { recording.on('error', reject); recording.on('close', code => code === 0 ? resolve() : reject(new Error(`screenrecord ${code}`))); });
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(run('shell', 'am', 'start', '-W', '-n', 'com.printlly.customer/.MainActivity').toString());
    await complete;
    run('pull', '/sdcard/printlly-cloud-recovery.mp4', path.join(out, 'physical-cloud-recovery.mp4'));
    fs.writeFileSync(path.join(out, 'physical-cloud-recovery.png'), run('exec-out', 'screencap', '-p'));
  } finally { run('reverse', 'tcp:8083', 'tcp:8083'); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
