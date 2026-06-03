const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { FileStore } = require('metro-cache');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all workspace packages so Metro picks up changes without restart
config.watchFolders = [monorepoRoot];

// Resolve packages from the app's node_modules first, then the root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Persist Metro cache across runs
config.cacheStores = [
  new FileStore({ root: path.join(projectRoot, 'node_modules/.cache/metro') }),
];

config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './global.css' });
