import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing credentials, read from android/key.properties.
//
// That file is gitignored and must never be committed: it holds the keystore
// password. See docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md Phase 6 and
// android/key.properties.example for how to create it.
//
// Absent on a teammate's machine, or in CI without the secret, this stays
// empty and the release build falls back to debug signing below - a build
// that runs but is NOT shippable. That trade is deliberate: failing the
// build here would stop anyone without the key from testing a release build
// at all.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}
val hasReleaseKeystore = keystoreProperties.getProperty("storeFile") != null

android {
    namespace = "ph.aqone.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    defaultConfig {
        // ph.aqone.app, not Flutter's com.example placeholder: Play rejects
        // com.example.*, and this id is already what the app sends as its
        // OSM tile User-Agent, so the two now agree.
        //
        // Changing this again later moves the app's private data directory,
        // which would orphan the local database - including any queued SOS.
        applicationId = "ph.aqone.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // Real key when key.properties is present; debug key otherwise so
            // a teammate without the keystore can still build and test a
            // release. A debug-signed APK must never be distributed: that key
            // is public and identical on every machine, so anyone could ship
            // an APK Android accepts as an update to this one.
            //
            // Phase 6 requires checking which of these actually applied before
            // calling a build shippable:
            //   ./gradlew :app:signingReport
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }

            // Shrink and obfuscate. Off by default in Flutter's template; on
            // here because an unobfuscated release ships readable class and
            // method names, which hands an attacker a map of the SOS and
            // credential paths for free.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
