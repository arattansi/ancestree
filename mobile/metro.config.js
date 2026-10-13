// https://docs.expo.dev/guides/customizing-metro
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The web app's lib/ is the code both apps share ("@/lib/*" in
// tsconfig.json). Metro watches it, and only it: the web's node_modules stay
// out of sight, so a shared file that imports a package gets this app's copy
// and nothing (React above all) is bundled twice.
config.watchFolders = [path.resolve(__dirname, "../lib")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
