const fs = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

// Android requires a launch drawable even when the animated opening is rendered
// in React Native. Keep it transparent; the supplied emblem is launcher-only.
// Register BEFORE expo-splash-screen: dangerous mods run in reverse order, so
// its image cleanup must finish before this drawable is written.
module.exports = function withNeutralAndroidSplash(config) {
  return withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'splashscreen_logo.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="1dp" android:height="1dp" android:viewportWidth="1" android:viewportHeight="1"><path android:fillColor="#00000000" android:pathData="M0,0h1v1h-1z" /></vector>\n');
    return mod;
  }]);
};

