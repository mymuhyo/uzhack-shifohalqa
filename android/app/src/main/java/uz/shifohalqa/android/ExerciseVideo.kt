package uz.shifohalqa.android

import android.content.Context
import android.os.SystemClock
import java.io.File
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.inspector.frame.FrameExtractor
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext

internal class ExerciseClip private constructor(val uri: Uri, val sample: ExerciseSample?) {
    val isPublic get() = sample != null

    companion object {
        val PublicSample = ExerciseClip("asset:///pose-cdc-sample.webm".toUri(), ExerciseSample.Chair)
        fun fromPicker(uri: Uri) = ExerciseClip(uri, null)
        fun cached(file: File, sample: ExerciseSample) = ExerciseClip(Uri.fromFile(file), sample)
    }
}

internal data class ExerciseVideoResult(
    val measurement: ExerciseMeasurement,
    val cycles: List<ExerciseCycle>,
    val sha256: String?,
    val clip: ExerciseClip,
    val movement: PoseMovement,
    val targetAngle: Int,
    val durationMs: Long,
    val elapsedMs: Long,
    val accuracy: PoseAccuracy,
) {
    val isPublic get() = clip.isPublic
}

internal class ExerciseVideoTooLong : Exception()
private const val maxClipMs = 120_000L
private const val frameIntervalMs = 100L

internal suspend fun analyzeExerciseVideo(
    context: Context,
    clip: ExerciseClip,
    targetAngle: Int,
    movement: PoseMovement = PoseMovement.ChairStand,
    targetReps: Int = 5,
    maxShallow: Int = 1,
    accuracy: PoseAccuracy = PoseAccuracy.Full,
    onProgress: (Int) -> Unit = {},
): ExerciseVideoResult = Executors.newSingleThreadExecutor().asCoroutineDispatcher().use { decoder ->
    withContext(decoder) { analyzeClip(context, clip, ExercisePlan("video", targetAngle, targetReps, movement, maxShallow), accuracy, onProgress) }
}

@OptIn(UnstableApi::class)
private suspend fun analyzeClip(
    context: Context, clip: ExerciseClip, plan: ExercisePlan, accuracy: PoseAccuracy, onProgress: (Int) -> Unit,
): ExerciseVideoResult {
    val coroutine = currentCoroutineContext()
    val app = context.applicationContext
    val started = SystemClock.elapsedRealtime()
    // The system picker gives the app only the selected content URI.
    require(clip.isPublic || clip.uri.scheme == "content")
    val duration = if (clip.uri.scheme == "asset") 8_792L else clipDuration(app, clip.uri)
    require(duration > 0)
    if (duration > maxClipMs) throw ExerciseVideoTooLong()

    val tracker = ExerciseMotionTracker(plan, live = false)
    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetPath(accuracy.asset).build())
        .setRunningMode(RunningMode.VIDEO)
        .setNumPoses(1)
        .build()
    FrameExtractor.Builder(app, MediaItem.fromUri(clip.uri))
        .setEffects(listOf(Presentation.createForWidthAndHeight(640, 640, Presentation.LAYOUT_SCALE_TO_FIT)))
        .build().use { extractor ->
            PoseLandmarker.createFromOptions(app, options).use { landmarker ->
                var lastFrameTime = -1L
                var lastProgress = 0
                for (offset in 0L until duration step frameIntervalMs) {
                    coroutine.ensureActive()
                    val decoded = runInterruptible { extractor.getFrame(offset).get(15, TimeUnit.SECONDS) }
                    try {
                        if (decoded.presentationTimeMs > lastFrameTime) {
                            lastFrameTime = decoded.presentationTimeMs
                            val bitmap = decoded.bitmap
                            BitmapImageBuilder(bitmap).build().use { image ->
                                val points = landmarker.detectForVideo(image, lastFrameTime).landmarks().firstOrNull()
                                tracker.update(points, bitmap.width, bitmap.height, lastFrameTime)
                            }
                        }
                    } finally {
                        decoded.bitmap.recycle()
                    }
                    val progress = (offset * 100 / duration).toInt()
                    if (progress - lastProgress >= 10) {
                        lastProgress = progress
                        withContext(Dispatchers.Main.immediate) { onProgress(progress) }
                    }
                }
                require(lastFrameTime >= 0 && duration - lastFrameTime <= 1_000)
            }
        }

    val result = tracker.result()
    val fingerprint = if (result.savable) {
        clip.sample?.sha256 ?: requireNotNull(app.contentResolver.openInputStream(clip.uri)).use {
            fingerprint(it) { coroutine.ensureActive() }
        }
    } else null
    return ExerciseVideoResult(
        result, tracker.completedCycles(), fingerprint, clip, plan.movement, plan.targetAngle, duration,
        SystemClock.elapsedRealtime() - started, accuracy,
    )
}

internal fun clipDuration(context: Context, uri: Uri): Long {
    val retriever = MediaMetadataRetriever()
    return try {
        retriever.setDataSource(context, uri)
        requireNotNull(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull())
    } finally {
        retriever.release()
    }
}

internal fun fingerprint(stream: InputStream, checkCancellation: () -> Unit): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val chunk = ByteArray(64 * 1024)
    while (true) {
        checkCancellation()
        val read = stream.read(chunk)
        if (read < 0) break
        digest.update(chunk, 0, read)
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
}
