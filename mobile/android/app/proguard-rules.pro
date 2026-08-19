# R8 / ProGuard rules for the release build.
#
# Shrinking and obfuscation are enabled in app/build.gradle.kts. An
# unobfuscated release ships readable class and method names, which hands an
# attacker a labelled map of the SOS and credential code paths.
#
# Flutter's own engine rules are contributed by the Flutter Gradle plugin, so
# this file only covers what R8 cannot see through reflection.

# --- Plugins that resolve classes reflectively -------------------------------

# flutter_secure_storage: the Android implementation reaches Keystore and
# cipher classes by name. Stripping them breaks the credential store at
# runtime rather than at build time, which is the worst way to find out.
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# sqflite: platform channel handlers.
-keep class com.tekartik.sqflite.** { *; }

# --- Diagnostics --------------------------------------------------------------

# Keep line numbers so a crash report from a fisherman's handset is
# actionable, but hide the original source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Deliberately NOT kept ----------------------------------------------------
#
# No blanket `-keep class **` and no `-dontobfuscate`. Either would silence R8
# problems by disabling the protection this file exists to provide. If the
# release build fails or misbehaves, add a narrow rule for the specific class
# and record why here, rather than widening the net.
