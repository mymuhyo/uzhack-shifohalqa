package uz.shifohalqa.android

import android.content.Context
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

internal class ExerciseClip private constructor(val uri: Uri, val isPublic: Boolean) {
    companion object {
        val PublicSample = ExerciseClip("asset:///pose-cdc-sample.webm".toUri(), true)
        fun fromPicker(uri: Uri) = ExerciseClip(uri, false)
    }
}

internal data class ExerciseVideoResult(
    val measurement: ChairStandResult,
    val cycles: List<ExerciseCycle>,
    val sha256: String?,
    val isPublic: Boolean,
)

internal class ExerciseVideoTooLong : Exception()
private const val maxClipMs = 120_000L
private const val frameIntervalMs = 100L

internal suspend fun analyzeExerciseVideo(
    context: Context,
    clip: ExerciseClip,
    targetAngle: Int,
    onProgress: (Int) -> Unit = {},
): ExerciseVideoResult = Executors.newSingleThreadExecutor().asCoroutineDispatcher().use { decoder ->
    withContext(decoder) { analyzeClip(context, clip, targetAngle, onProgress) }
}

@OptIn(UnstableApi::class)
private suspend fun analyzeClip(
    context: Context, clip: ExerciseClip, targetAngle: Int, onProgress: (Int) -> Unit,
): ExerciseVideoResult {
    val coroutine = currentCoroutineContext()
    val app = context.applicationContext
    // The system picker gives the app only the selected content URI.
    require(clip.isPublic || clip.uri.scheme == "content")
    val duration = if (clip.isPublic) 8_792L else clipDuration(app, clip.uri)
    require(duration > 0)
    if (duration > maxClipMs) throw ExerciseVideoTooLong()

    val tracker = ChairStandTracker(targetAngle, live = false)
    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetPath("pose_landmarker_heavy.task").build())
        .setRunningMode(RunningMode.VIDEO)
        .setNumPoses(1)
        .build()
    FrameExtractor.Builder(app, MediaItem.fromUri(clip.uri))
        .setEffects(listOf(Presentation.createForWidthAndHeight(640, 640, Presentation.LAYOUT_SCALE_TO_FIT)))
        .build().use { extractor ->
            PoseLandmarker.createFromOptions(app, options).use { landmarker ->
                var lastFrameTime = -1L
                var previousSide: Int? = null
                var lastProgress = 0
                for (offset in 0L until duration step frameIntervalMs) {
                    coroutine.ensureActive()
                    val decoded = runInterruptible { extractor.getFrame(offset).get(15, TimeUnit.SECONDS) }
                    if (decoded.presentationTimeMs > lastFrameTime) {
                        lastFrameTime = decoded.presentationTimeMs
                        val bitmap = decoded.bitmap
                        val points = BitmapImageBuilder(bitmap).build().use { image ->
                            landmarker.detectForVideo(image, lastFrameTime).landmarks().firstOrNull()
                        }
                        val knee = points?.let { pickKnee(it, bitmap.width, bitmap.height, previousSide, live = false) }
                        tracker.update(lastFrameTime, knee?.angle, knee?.visibility ?: 0.0, knee?.side)
                        previousSide = knee?.side
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
        val stream = if (clip.isPublic) app.assets.open("pose-cdc-sample.webm")
            else requireNotNull(app.contentResolver.openInputStream(clip.uri))
        stream.use { fingerprint(it) { coroutine.ensureActive() } }
    } else null
    return ExerciseVideoResult(result, tracker.completedCycles(), fingerprint, clip.isPublic)
}

private fun clipDuration(context: Context, uri: Uri): Long {
    val retriever = MediaMetadataRetriever()
    return try {
        retriever.setDataSource(context, uri)
        requireNotNull(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull())
    } finally {
        retriever.release()
    }
}

private fun fingerprint(stream: InputStream, checkCancellation: () -> Unit): String {
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
