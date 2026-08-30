const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders || []),
  `${__dirname}/modules/audio-ducking`,
  `${__dirname}/modules/carplay`,
];

module.exports = config;
