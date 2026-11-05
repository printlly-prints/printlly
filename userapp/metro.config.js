const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../shared")];
// tslib 1's conditional import shim default-imports a UMD entry and loses
// its namespace under Metro. Resolve only this helper to its installed
// CommonJS entry; retain the normal package-export rules for other modules.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib") return { type: "sourceFile", filePath: require.resolve("tslib", { paths: [path.dirname(context.originModulePath)] }) };
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
