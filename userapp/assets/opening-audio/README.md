# Soft paper fold and movement cue

`opening-retimed.wav` is now 3.8 seconds: one short dry paper fold at 0.55 s, followed by one very faint smooth paper-derived movement gesture from 2.10–3.68 s. No repeated folds, sharp swoosh, landing/drop, chime, synthetic tone or continuous noise bed.

Sources (CC0 1.0):
- [paper - folding 01.wav by Anthousai #398896](https://freesound.org/people/Anthousai/sounds/398896/), official public preview `https://cdn.freesound.org/previews/398/398896_5923045-hq.mp3`.
- [Paper Rustle by BenjaminNelan #353125](https://freesound.org/people/BenjaminNelan/sounds/353125/), official public preview `https://cdn.freesound.org/previews/353/353125_1196020-hq.mp3`.

[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Credit is kept for provenance; no endorsement is implied. No login-only original downloads were used.

Fold: source 3.08–3.55 s, high-pass 220 Hz, low-pass 3500 Hz, 35 ms attack and 130 ms release, peak 0.11. Movement: source rustle 0.24–0.86 s, high-pass 400 Hz and low-pass 1400 Hz, time-stretched to 1.58 s with FFmpeg atempo, 400 ms attack and 550 ms release, peak 0.01 (about 21 dB below fold). No compression, tanh distortion or layered movement gestures. PCM16 stereo 48 kHz, total peak about −19.2 dBFS, zero clipped samples.

Reproduce with `node design/audio-preview/make-soft-movement.cjs <ffmpeg.exe>`; optional `--apply` updates tracked/native resources. The script reads the credited downloaded source MP3s. Do not apply during a native build.

Review copies: `design/audio-preview/paper-ui-soft-movement.mp3` and `.wav`. The session cannot receive audio input, so objective signal properties were checked without claiming subjective audition.

Android embeds this in `res/raw/printlly_opening_mix.wav`. Native MediaPlayer prepares during the logo and starts once with animation. It respects media volume, silent/vibrate, DND and audio focus; stops on skip/background/interruption, never changes volume or displays an opening notification. Disabled/reduced-motion opening skips it. Confirmed order sounds remain separate, requiring server states, deduplication and OS permission.
