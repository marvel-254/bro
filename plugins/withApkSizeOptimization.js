const {
  withGradleProperties,
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * ABI selection.
 *
 * `x86`/`x86_64` only exist to run on emulators. Leaving them enabled puts
 * four copies of every native library (Hermes, reanimated, SQLite, the Expo
 * image codecs) into the release APK, which is the single largest avoidable
 * contributor to download size for a real user on a real phone.
 *
 * Emulator/debug builds still get the emulators: pass
 * `-PreactNativeArchitectures=x86_64` on the Gradle command line and this
 * property is overridden for that invocation only.
 */
const REACT_NATIVE_ARCHITECTURES = 'armeabi-v7a,arm64-v8a';

/**
 * Release minification.
 *
 * Both flags are read by android/app/build.gradle. `minifyEnabled` runs R8
 * over the Java/Kotlin bytecode and drops unreachable classes plus
 * reflection-only references R8 cannot see; `shrinkResources` then deletes
 * assets and resources nothing points at. On a React Native app these
 * together are worth tens of megabytes.
 */
const PROGUARD_ENABLED = true;
const SHRINK_RESOURCES_ENABLED = true;

/**
 * Keep rules that must survive R8.
 *
 * React Native, Hermes and Expo resolve large parts of their surface
 * reflectively at runtime: view managers and native modules are looked up by
 * name from JS, and `@DoNotStrip` members are found by annotation. R8 cannot
 * see those call sites, so a minified build compiles cleanly and then crashes
 * on first launch without these.
 *
 * Scope note: these are deliberately narrow. A blanket
 * `-keep class com.facebook.react.** { *; }` would keep essentially all of
 * React Native and Expo, handing back most of what R8 just saved while
 * keeping the crash risk — paying the cost for none of the benefit.
 */
const PROGUARD_KEEP_RULES = `
# --- BRO: keep rules required once R8 minification is on --------------------
# Applied by plugins/withApkSizeOptimization.js. Regenerated on every
# \`expo prebuild\`, so this is the source of truth, not the generated file.

# Annotation-based opt-outs shipped by RN core.
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

# Classes JS resolves by name. Subclass rules rather than whole packages, so
# ordinary RN/Expo internals stay minifiable.
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends com.facebook.react.bridge.BaseJavaModule { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.jni.** { *; }

# Every expo.modules.* class is looked up by name from the module registry.
-keep class expo.modules.** { *; }

# Hermes is reached through JSI, but its Java entry points are still resolved
# reflectively at startup.
-keep class com.facebook.hermes.** { *; }

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }

# Kotlin metadata is read reflectively by coroutines and serialization.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
# --- end BRO keep rules ---
`;

const BEGIN_MARKER = '# --- BRO: keep rules required once R8 minification is on';
const END_MARKER = '# --- end BRO keep rules ---';

/**
 * Per-ABI APK output.
 *
 * This is the single biggest remaining size win. Measured on a build of this
 * app, the native libraries alone came to roughly 40 MB:
 *
 *   libjingle_peerconnection_so.so   18.1 MB  (react-native-webrtc, for calls)
 *   libreactnative.so                11.3 MB
 *   libhermes.so                      3.8 MB
 *   libappmodules.so                  2.7 MB
 *   libexpo-modules-core.so           2.2 MB
 *   libc++_shared.so                  2.2 MB
 *
 * Every one of those ships once per ABI. A user on an arm64 phone is paying
 * for an armeabi-v7a copy they can never execute, and vice versa. Splitting
 * the output means each download carries only the libraries that device can
 * actually run.
 */
const SPLITS_BLOCK = `    // Added by plugins/withApkSizeOptimization.js -- see that file for why.
    // Native libs dominate this APK (~40MB of a ~58MB universal build) and each
    // one is duplicated per ABI, so per-ABI APKs are a large download win.
    splits {
        abi {
            enable true
            reset()
            include "armeabi-v7a", "arm64-v8a"
            // No universal APK: it would re-bundle both ABIs and undo the point.
            universalApk false
        }
    }

`;

/** The android {} block always contains this; used as the insertion anchor. */
const SPLITS_ANCHOR = '    packagingOptions {';

/** Upsert `key=value` in a PropertiesItem[] list, replacing any prior value. */
function setProperty(properties, key, value) {
  const existing = properties.find((item) => item.key === key);
  if (existing) {
    existing.value = value;
    existing.type = 'property';
    return;
  }
  properties.push({ type: 'property', key, value });
}

const withApkSizeOptimization = (config) => {
  config = withGradleProperties(config, (config) => {
    const properties = config.modResults;
    setProperty(properties, 'reactNativeArchitectures', REACT_NATIVE_ARCHITECTURES);
    setProperty(properties, 'android.enableProguardInReleaseBuilds', String(PROGUARD_ENABLED));
    setProperty(
      properties,
      'android.enableShrinkResourcesInReleaseBuilds',
      String(SHRINK_RESOURCES_ENABLED)
    );
    return config;
  });

  // app/build.gradle has no mod for a raw Groovy fragment, so the splits block
  // is spliced in ahead of `packagingOptions {`, which sits inside the android
  // block in every generated template. Guarded so re-running prebuild is a
  // no-op rather than a duplicate block.
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;
    const contents = config.modResults.contents;
    if (contents.includes('Added by plugins/withApkSizeOptimization.js')) {
      return config;
    }
    if (!contents.includes(SPLITS_ANCHOR)) {
      throw new Error(
        'withApkSizeOptimization: could not find `packagingOptions {` in ' +
          'android/app/build.gradle, so the ABI splits block could not be inserted.'
      );
    }
    config.modResults.contents = contents.replace(
      SPLITS_ANCHOR,
      SPLITS_BLOCK + SPLITS_ANCHOR
    );
    return config;
  });

  // proguard-rules.pro has no first-class mod, so it is written directly. The
  // block is delimited by markers and replaced wholesale rather than appended,
  // which keeps prebuild idempotent: running it twice yields the same file.
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );

      let existing = '';
      if (fs.existsSync(proguardPath)) {
        existing = fs.readFileSync(proguardPath, 'utf8');
      }

      // Drop a previously injected block so re-running replaces rather than
      // duplicates, then append the current rules.
      const begin = existing.indexOf(BEGIN_MARKER);
      const end = existing.indexOf(END_MARKER);
      let base = existing;
      if (begin !== -1 && end !== -1 && end > begin) {
        base = existing.slice(0, begin) + existing.slice(end + END_MARKER.length);
      }

      const separator = base.endsWith('\n') ? '\n' : '\n\n';
      fs.writeFileSync(proguardPath, `${base}${separator}${PROGUARD_KEEP_RULES}`, 'utf8');
      return config;
    },
  ]);

  return config;
};

module.exports = withApkSizeOptimization;