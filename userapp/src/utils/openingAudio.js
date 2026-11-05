import { NativeModules, Platform } from 'react-native';
const audio = Platform.OS === 'android' ? NativeModules.PrintllyOpeningAudio : null;
// Native prepare/start are policy-guarded and never request a permission or
// change volume, ringer, DND, or audio routing. An unsupported host stays quiet.
export const prepareOpeningAudio = () => audio?.prepare().catch(() => false) ?? Promise.resolve(false);
export const startOpeningAudio = () => audio?.start().catch(() => false) ?? Promise.resolve(false);
export const stopOpeningAudio = () => { audio?.stop(); };
