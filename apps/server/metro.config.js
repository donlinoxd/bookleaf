const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

config.cacheStores = [
  new FileStore({
    root: path.join(__dirname, 'node_modules', '.cache', 'metro'),
  }),
];

config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './global.css' });
