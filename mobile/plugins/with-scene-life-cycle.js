// Step 149: an app built with the iOS 27 SDK won't launch unless it adopts
// UIKit's scene life cycle ("UIScene life cycle is required for apps built
// with this SDK"). Expo 57 ships the scene delegate for it
// (`EXExpoAppSceneDelegate`, in expo/ios/AppDelegates), but its template
// (57.0.30) still makes the window in the app delegate. This plugin hands
// the window to that scene delegate on every prebuild:
//
// - Info.plist names `EXExpoAppSceneDelegate` as the scene delegate.
// - AppDelegate conforms to `ExpoReactNativeFactoryProvider`, the protocol
//   the scene delegate reads the React Native factory through, and no longer
//   makes the window or starts React Native itself.
//
// A template that already adopts scenes is left as it is. One the plugin
// can't read fails the prebuild instead of building an app that won't open.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const SCENE_DELEGATE = "EXExpoAppSceneDelegate";
const PROVIDER = "ExpoReactNativeFactoryProvider";

const CLASS_LINE = /class AppDelegate: ExpoAppDelegate \{/;
const WINDOW_BLOCK =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([^)]*\)\n#endif\n/;

function adoptScenes(swift) {
  if (swift.includes(PROVIDER)) return swift;
  if (!CLASS_LINE.test(swift) || !WINDOW_BLOCK.test(swift)) {
    throw new Error(
      "with-scene-life-cycle: AppDelegate.swift isn't the shape this plugin knows. " +
        "Check whether the Expo template adopts the scene life cycle now, and update or drop the plugin.",
    );
  }
  return swift
    .replace(CLASS_LINE, `class AppDelegate: ExpoAppDelegate, ${PROVIDER} {`)
    .replace(
      WINDOW_BLOCK,
      `\n    // ${SCENE_DELEGATE} (Info.plist) makes the window and starts React Native.\n`,
    );
}

module.exports = function withSceneLifeCycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest ??= {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: SCENE_DELEGATE,
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("with-scene-life-cycle: expected a Swift AppDelegate.");
    }
    mod.modResults.contents = adoptScenes(mod.modResults.contents);
    return mod;
  });
};
