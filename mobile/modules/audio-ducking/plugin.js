const { withAndroidManifest } = require("@expo/config-plugins");

function withAudioDucking(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) {
      app.$["android:allowAudioPlaybackCapture"] = "true";
    }
    return mod;
  });
}

module.exports = withAudioDucking;
