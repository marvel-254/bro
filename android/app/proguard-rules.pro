# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:


# --- BRO: keep rules required once R8 minification is on --------------------
# Applied by plugins/withApkSizeOptimization.js. Regenerated on every
# `expo prebuild`, so this is the source of truth, not the generated file.

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
