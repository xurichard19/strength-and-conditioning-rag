const { getDefaultConfig } = require('expo/metro-config');
const pLimit = require('p-limit');

const config = getDefaultConfig(__dirname);

if (process.platform === 'win32') {
  // Metro reads its disk cache outside the worker pool. Bound these operations
  // together so a large bundle cannot exhaust Windows file descriptors.
  const limit = pLimit(64);
  config.cacheStores = config.cacheStores.map(store => ({
    get: key => limit(() => store.get(key)),
    set: (key, value) => limit(() => store.set(key, value)),
    clear: () => store.clear(),
  }));
}

module.exports = config;
