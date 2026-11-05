const fs = require('node:fs/promises');
const path = require('node:path');
const { withMainApplication, withDangerousMod } = require('expo/config-plugins');
module.exports = function withOpeningAudio(config) {
  config = withMainApplication(config, mod => {
    const source = mod.modResults.contents;
    if (!source.includes('add(PrintllyOpeningAudioPackage())')) {
      mod.modResults.contents = source.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          add(PrintllyOpeningAudioPackage())');
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const root = mod.modRequest.platformProjectRoot;
    const java = path.join(root, 'app/src/main/java/com/printlly/customer');
    const raw = path.join(root, 'app/src/main/res/raw');
    await fs.mkdir(java, { recursive: true }); await fs.mkdir(raw, { recursive: true });
    await fs.copyFile(path.join(__dirname, 'native-audio/PrintllyOpeningAudioPackage.kt'), path.join(java, 'PrintllyOpeningAudioPackage.kt'));
    await fs.copyFile(path.join(mod.modRequest.projectRoot, 'assets/opening-audio/opening-retimed.wav'), path.join(raw, 'printlly_opening_mix.wav'));
    return mod;
  }]);
};
