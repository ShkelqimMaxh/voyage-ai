const { withInfoPlist, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withCarPlay(config) {
  config = withInfoPlist(config, (mod) => {
    const plist = mod.modResults;
    plist.UIApplicationSceneManifest = {
      CPTemplateApplicationSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: "CarPlay",
          UISceneDelegateClassName: "CarPlaySceneDelegate",
        },
      ],
    };
    const usages = plist.LSApplicationQueriesSchemes || [];
    if (!usages.includes("spotify")) usages.push("spotify");
    plist.LSApplicationQueriesSchemes = usages;
    return mod;
  });

  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const destDir = path.join(mod.modRequest.platformProjectRoot, mod.modRequest.projectName || "RouteRadio");
      const src = path.join(__dirname, "ios", "CarPlaySceneDelegate.swift");
      const dest = path.join(destDir, "CarPlaySceneDelegate.swift");
      if (fs.existsSync(src) && fs.existsSync(destDir)) {
        fs.copyFileSync(src, dest);
      }
      return mod;
    },
  ]);
}

module.exports = withCarPlay;
