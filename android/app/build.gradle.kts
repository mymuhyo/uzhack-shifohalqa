plugins {
    id("com.android.application") version "9.5.1"
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21"
    id("com.google.devtools.ksp") version "2.3.9"
}

val demoAbi = providers.gradleProperty("shifoAbi").orNull
require(demoAbi == null || demoAbi in setOf("arm64-v8a", "armeabi-v7a", "x86", "x86_64")) {
    "shifoAbi must name a supported Android ABI"
}

android {
    namespace = "uz.shifohalqa.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "uz.shifohalqa.android.demo"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        demoAbi?.let { ndk.abiFilters.add(it) }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Keep Android model bundles separate from the web's Lite runtime.
abstract class PrepareExerciseAssets : DefaultTask() {
    @get:InputFiles abstract val assets: ConfigurableFileCollection
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty

    @TaskAction
    fun packageAssets() {
        val directory = outputDirectory.get().asFile
        assets.files.forEach { it.copyTo(directory.resolve(it.name), overwrite = true) }
    }
}

val exerciseModelAssets = tasks.register<PrepareExerciseAssets>("prepareExerciseAssets") {
    assets.from(rootProject.file("models/pose_landmarker_full.task"), rootProject.file("models/pose_landmarker_heavy.task"),
        rootProject.file("../public/models/LICENSE.txt"), rootProject.file("../public/demo/pose-cdc-sample.webm"))
    outputDirectory.set(layout.buildDirectory.dir("generated/exercise-assets"))
}

androidComponents.onVariants { variant ->
    variant.sources.assets?.addGeneratedSourceDirectory(exerciseModelAssets, PrepareExerciseAssets::outputDirectory)
}

tasks.withType<Test>().configureEach {
    val fixtures = rootProject.file("../tests/fixtures/chair-stand/live.tsv")
    inputs.file(fixtures)
    systemProperty("shifo.chairStandFixtures", fixtures.absolutePath)
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.camera:camera-camera2:1.6.2")
    implementation("androidx.camera:camera-lifecycle:1.6.2")
    implementation("androidx.camera:camera-view:1.6.2")
    implementation("com.google.mediapipe:tasks-vision:1.2.3")
    implementation("androidx.media3:media3-inspector-frame:1.11.1")
    implementation("androidx.room:room-runtime:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")
    implementation("androidx.work:work-runtime:2.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.09.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
}
