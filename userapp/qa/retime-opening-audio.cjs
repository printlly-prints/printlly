// Remix only the user-provided original PCM stems; no synthesized replacement.
const fs = require('node:fs');
const path = require('node:path');
const input = process.argv[2];
if (!input) throw new Error('Pass the supplied Printlly_Opening_Sound folder');
const rate = 48000, channels = 2, seconds = 4.6;
const mix = new Float64Array(Math.round(rate * channels * seconds));
function read(name) {
  const bytes = fs.readFileSync(path.join(input, name));
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Expected WAV');
  let data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ' && (bytes.readUInt16LE(offset + 8) !== 1 || bytes.readUInt16LE(offset + 10) !== channels || bytes.readUInt32LE(offset + 12) !== rate || bytes.readUInt16LE(offset + 22) !== 16)) throw new Error('Expected stereo 48k PCM16');
    if (id === 'data') data = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!data) throw new Error('Missing WAV samples');
  return data;
}
function add(name, from, to, destination, destinationEnd) {
  const source = read(name), frames = Math.round((destinationEnd - destination) * rate);
  for (let frame = 0; frame < frames; frame++) {
    const inputFrame = Math.round((from + frame / frames * (to - from)) * rate);
    const outputFrame = Math.round(destination * rate) + frame;
    for (let channel = 0; channel < channels; channel++) {
      const sourceIndex = (inputFrame * channels + channel) * 2;
      const outputIndex = outputFrame * channels + channel;
      if (sourceIndex + 2 <= source.length && outputIndex < mix.length) mix[outputIndex] += source.readInt16LE(sourceIndex) / 32768;
    }
  }
}
add('paper_folding_timed.wav', 0, 2.1, 0, 2.1);
add('cloud_opening_timed.wav', 0.85, 3.085, 2.1, 3.35);
add('paper_flying_timed.wav', 2.1, 3.7, 2.1, 3.7);
add('paper_unfold_land_timed.wav', 3.7, 3.95, 3.68, 3.86);
add('paper_unfold_land_timed.wav', 4.25, 4.37, 3.84, 3.96);
let peak = 0;
for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
const gain = peak ? 0.55 / peak : 1;
const output = Buffer.alloc(44 + mix.length * 2);
output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(channels, 22);
output.writeUInt32LE(rate, 24); output.writeUInt32LE(rate * channels * 2, 28);
output.writeUInt16LE(channels * 2, 32); output.writeUInt16LE(16, 34); output.write('data', 36);
output.writeUInt32LE(mix.length * 2, 40);
for (let i = 0; i < mix.length; i++) output.writeInt16LE(Math.round(mix[i] * gain * 32767), 44 + i * 2);
fs.writeFileSync(path.join(__dirname, '../assets/opening-audio/opening-retimed.wav'), output);
console.log(JSON.stringify({ duration: seconds, sampleRate: rate, channels, peak: 0.55, gain, bytes: output.length }));
