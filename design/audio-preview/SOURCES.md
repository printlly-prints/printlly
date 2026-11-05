# Recorded-paper opening previews — 17 October 2026

These are review previews only. They have **not** replaced the app audio or
triggered a new APK build. There are no synthesized tones, chimes, impacts or
generated-noise beds in either preview.

## Sources and license

All three creator pages explicitly identify the recording as **Creative
Commons Zero (CC0 1.0)**. Attribution is included for provenance even though CC0
does not require it. No creator endorsement is implied.

| Recording | Creator and original page | Public HQ preview actually downloaded |
| --- | --- | --- |
| Paper Rustle | [BenjaminNelan, #353125](https://freesound.org/people/BenjaminNelan/sounds/353125/) | `https://cdn.freesound.org/previews/353/353125_1196020-hq.mp3` |
| paper - folding 01.wav | [Anthousai, #398896](https://freesound.org/people/Anthousai/sounds/398896/) | `https://cdn.freesound.org/previews/398/398896_5923045-hq.mp3` |
| opening_note | [dalexgray, #711853](https://freesound.org/people/dalexgray/sounds/711853/) | `https://cdn.freesound.org/previews/711/711853_365075-hq.mp3` |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
The source MP3s are official public previews, not login-only original WAV
downloads. Their public preview URLs were read from each original page. The
Pixabay rustle page refers to the same BenjaminNelan recording, but its direct
download was blocked by a browser challenge, so the original CC0 source was
used instead. No challenge, login or paywall was bypassed.

## Editing and levels

Both WAVs are exactly **4.6 seconds**, PCM16 stereo at 48 kHz. MP3 copies are
provided for easy playback; encoder padding may slightly extend their container
duration. All material comes from the credited real recordings.

- Dry paper fragments at 0.55, 0.81, 1.075, 1.33, 1.585 and 1.845 seconds.
- A quiet, filtered paper pass starts at 2.10 seconds, ending by 3.35 seconds.
- Unfold at 3.68 seconds; short paper contact at 3.84 seconds.
- High-pass/low-pass filtering, rounded transient peaks, 12 ms attack and 35 ms
  release; no constant ambience or reverb bed.

| Preview | Sample peak | True peak (FFmpeg) | Integrated loudness |
| --- | --- | --- | --- |
| A — minimal | 0.142 / −17.0 dBFS | −15.1 dBFS | −29.0 LUFS |
| B — more rustle | 0.194 / −14.2 dBFS | −12.3 dBFS | −27.3 LUFS |

Both have **zero clipped PCM samples**. Loudness intentionally remains modest
for brief UI foley; the integrated values are descriptive, not a guarantee of
perceived loudness on the phone. Detailed levels are in `levels.json` and
`levels-A.txt` / `levels-B.txt`.

## Validation limit

This session has no audio listening input/tool: attempting to emit the source
returned “audio content omitted because you do not support audio input.”
Accordingly, these previews were checked for provenance, signal levels,
duration, fades and clipping, **not subjectively auditioned**. Human listening
review is required before choosing and packaging one.

Reproduce: decode each credited MP3 to mono float32 PCM at 48 kHz as
`sources/folding.pcm`, `sources/rustle.pcm`, `sources/unfold.pcm`; run
`node design/audio-preview/make-paper-previews.cjs`. Source hashes are recorded
in `source-hashes.json`.
