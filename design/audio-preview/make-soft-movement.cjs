// Reproduce the approved direction from credited real-paper HQ previews.
// Usage: node design/audio-preview/make-soft-movement.cjs <ffmpeg.exe> [--apply]
// --apply copies the result to tracked/native app resources. Do not run while
// an Android build is reading those resources.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ffmpeg = process.argv[2];
if (!ffmpeg) throw new Error('Pass an installed FFmpeg executable');
const root = __dirname, rate = 48000;
function decode(source, filters, output) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(root, 'sources', source), '-af', filters, '-ar', '48000', '-ac', '1', '-f', 'f32le', path.join(root, output)]);
  const bytes = fs.readFileSync(path.join(root, output));
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
}
const fold = decode('paper-folding-anthousai-398896.mp3', 'atrim=start=3.08:end=3.55,asetpts=PTS-STARTPTS,highpass=f=220,lowpass=f=3500,afade=t=in:d=0.035,afade=t=out:st=0.34:d=0.13', 'paper-ui-raw.pcm');
const air = decode('paper-rustle-benjaminnelan-353125.mp3', 'atrim=start=0.24:end=0.86,asetpts=PTS-STARTPTS,highpass=f=400,lowpass=f=1400,atempo=0.5,atempo=0.78481,afade=t=in:d=0.4,afade=t=out:st=1.03:d=0.55,apad,atrim=duration=1.58', 'paper-air-raw.pcm');
const mix = new Float64Array(Math.round(3.8 * rate));
function add(samples, start, targetPeak, quantize = false) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak ? targetPeak / peak : 0, offset = Math.round(start * rate);
  for (let i = 0; i < samples.length && offset + i < mix.length; i++) {
    const value = samples[i] * gain;
    mix[offset + i] += quantize ? Math.round(value * 32767) / 32768 : value;
  }
}
add(fold, 0.55, 0.11, true); add(air, 2.1, 0.01);
const wav = Buffer.alloc(44 + mix.length * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(mix.length * 4, 40);
for (let i = 0; i < mix.length; i++) { const value = Math.round(mix[i] * 32767); wav.writeInt16LE(value, 44 + i * 4); wav.writeInt16LE(value, 46 + i * 4); }
const output = path.join(root, 'paper-ui-soft-movement.wav');
fs.writeFileSync(output, wav);
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', output, '-codec:a', 'libmp3lame', '-b:a', '192k', path.join(root, 'paper-ui-soft-movement.mp3')]);
if (process.argv.includes('--apply')) {
  fs.copyFileSync(output, path.join(root, '../../userapp/assets/opening-audio/opening-retimed.wav'));
  fs.copyFileSync(output, path.join(root, '../../userapp/android/app/src/main/res/raw/printlly_opening_mix.wav'));
}
console.log('Wrote 3.8-second soft fold + subtle paper movement preview.');
