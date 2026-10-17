// Reapply the configured fonts to an existing Android checkout without a clean
// prebuild, preserving its incremental C++/Gradle build cache.
const path = require("node:path");
const { compileModsAsync } = require("expo/config-plugins");
const projectRoot = path.resolve(__dirname, "..");
const { withFontsAndroid } = require(path.join(projectRoot, "node_modules/expo-font/plugin/build/withFontsAndroid.js"));
const config = require(path.join(projectRoot, "app.json")).expo;
const options = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-font")?.[1];
if (!options?.android?.fonts?.length) throw new Error("No configured Android font families");
compileModsAsync(withFontsAndroid({ ...config, plugins: [] }, options.android.fonts), {
  projectRoot, platforms: ["android"],
}).then(() => console.log("Configured Android font resources and registrations applied."))
  .catch(error => { console.error(error); process.exitCode = 1; });
