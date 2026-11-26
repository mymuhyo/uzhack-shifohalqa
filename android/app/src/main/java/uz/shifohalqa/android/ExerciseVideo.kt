package uz.shifohalqa.android

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
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
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

internal class ExerciseClip private constructor(
    val uri: Uri,
    val isPublic: Boolean,
    val sampleMovement: PoseMovement? = null,
    val localFile: File? = null,
) {
    companion object {
        val PublicSample = ExerciseClip("asset:///pose-cdc-sample.webm".toUri(), true, PoseMovement.ChairStand)

        fun fromCachedSample(file: File, movement: PoseMovement) =
            ExerciseClip(Uri.fromFile(file), isPublic = true, sampleMovement = movement, localFile = file)

        fun fromPicker(uri: Uri) = ExerciseClip(uri, isPublic = false)
    }
}

internal data class ExerciseVideoResult(
    val measurement: ExerciseMeasurement,
    val cycles: List<ExerciseCycle>,
    val sha256: String?,
    val isPublic: Boolean,
    val movement: PoseMovement = PoseMovement.ChairStand,
    val modelMode: PoseModelMode = PoseModelMode.Full,
    val elapsedMs: Long = 0L,
    val durationMs: Long = 0L,
    val sizeBytes: Long = 0L,
    val mimeType: String? = null,
    val clip: ExerciseClip? = null,
)

internal data class FlaggedCycleSpec(
    val cycleIndex: Int,
    val fromMs: Long,
    val toMs: Long,
    val severity: String,
    val peakAngleDeg: Double,
    val errorCodes: List<String>,
)

internal data class ExtractedKeyframe(
    val timestampMs: Long,
    val mimeType: String,
    val dataBase64: String,
)

internal class ExerciseVideoTooLong : Exception()

private const val maxClipMs = 120_000L
private const val frameIntervalMs = 100L
private const val maxKeyframeBytes = 512 * 1024

internal suspend fun analyzeExerciseVideo(
    context: Context,
    clip: ExerciseClip,
    targetAngle: Int,
    movement: PoseMovement = PoseMovement.ChairStand,
    targetReps: Int = 5,
    maxShallow: Int = 1,
    modelMode: PoseModelMode = PoseModelMode.Full,
    onProgress: (Int) -> Unit = {},
): ExerciseVideoResult = Executors.newSingleThreadExecutor().asCoroutineDispatcher().use { decoder ->
    withContext(decoder) {
        analyzeClip(
            context = context,
            clip = clip,
            plan = ExercisePlan("video", targetAngle, targetReps, movement, maxShallow),
            modelMode = modelMode,
            onProgress = onProgress,
        )
    }
}

@OptIn(UnstableApi::class)
private suspend fun analyzeClip(
    context: Context,
    clip: ExerciseClip,
    plan: ExercisePlan,
    modelMode: PoseModelMode,
    onProgress: (Int) -> Unit,
): ExerciseVideoResult {
    val startedNs = System.nanoTime()
    val coroutine = currentCoroutineContext()
    val app = context.applicationContext
    require(clip.isPublic || clip.uri.scheme == "content")

    val duration = when {
        clip.localFile != null -> clipDuration(app, clip.uri)
        clip.isPublic -> 8_792L
        else -> clipDuration(app, clip.uri)
    }
    require(duration > 0)
    if (duration > maxClipMs) throw ExerciseVideoTooLong()

    val tracker = ExerciseMotionTracker(plan, live = false)
    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetPath(modelMode.assetName).build())
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
                            val points = BitmapImageBuilder(bitmap).build().use { image ->
                                landmarker.detectForVideo(image, lastFrameTime).landmarks().firstOrNull()
                            }
                            tracker.update(points, bitmap.width, bitmap.height, lastFrameTime)
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
        openClipStream(app, clip).use { fingerprint(it) { coroutine.ensureActive() } }
    } else null

    val fileMeta = if (!clip.isPublic) inspectClipMetadata(app, clip.uri) else Pair(clip.localFile?.length() ?: 0L, "video/webm")
    val elapsedMs = max(1L, (System.nanoTime() - startedNs) / 1_000_000L)

    return ExerciseVideoResult(
        measurement = result,
        cycles = tracker.completedCycles(),
        sha256 = fingerprint,
        isPublic = clip.isPublic,
        movement = plan.movement,
        modelMode = modelMode,
        elapsedMs = elapsedMs,
        durationMs = duration,
        sizeBytes = fileMeta.first,
        mimeType = fileMeta.second,
        clip = clip,
    )
}

internal fun selectFlaggedCycles(
    pose: PoseTrackerResult,
    diagnostics: ExerciseDiagnosticsSummary,
): List<FlaggedCycleSpec> {
    if (pose.cycles.isEmpty()) return emptyList()
    val indexed = pose.cycles.mapIndexed { index, cycle -> index to cycle }
    val shallowCycles = indexed.filter { (_, cycle) -> !cycle.reachesTarget }
    val chosen = when {
        shallowCycles.isNotEmpty() -> shallowCycles.take(2)
        diagnostics.needsDoctorReview || diagnostics.errorCodes.isNotEmpty() -> {
            // Pick the slowest or first flagged cycle so clinician/AI gets concrete evidence.
            listOf(indexed.maxBy { (_, c) -> c.toMs - c.fromMs })
        }
        else -> emptyList()
    }
    return chosen.map { (index, cycle) ->
        val codes = if (!cycle.reachesTarget && "shallow_range" !in diagnostics.errorCodes) {
            diagnostics.errorCodes + "shallow_range"
        } else {
            diagnostics.errorCodes
        }
        FlaggedCycleSpec(
            cycleIndex = index,
            fromMs = cycle.fromMs,
            toMs = cycle.toMs,
            severity = if (diagnostics.severity == "ok" && cycle.reachesTarget) "ok" else "yellow",
            peakAngleDeg = cycle.minAngle,
            errorCodes = codes,
        )
    }
}

@OptIn(UnstableApi::class)
internal suspend fun extractCycleKeyframes(
    context: Context,
    clip: ExerciseClip,
    cycle: FlaggedCycleSpec,
    durationMs: Long,
    count: Int = 4,
): List<ExtractedKeyframe> = Executors.newSingleThreadExecutor().asCoroutineDispatcher().use { decoder ->
    withContext(decoder) {
        val coroutine = currentCoroutineContext()
        val app = context.applicationContext
        val boundedCount = count.coerceIn(3, 5)
        val safeEnd = max(cycle.fromMs + 200L, cycle.toMs).coerceAtMost(max(durationMs, cycle.fromMs + 200L))
        val span = max(100L, safeEnd - cycle.fromMs)
        val timestamps = List(boundedCount) { idx ->
            (cycle.fromMs + (span * idx) / (boundedCount - 1)).coerceAtLeast(0L)
        }
        val frames = mutableListOf<ExtractedKeyframe>()
        FrameExtractor.Builder(app, MediaItem.fromUri(clip.uri))
            .setEffects(listOf(Presentation.createForWidthAndHeight(480, 480, Presentation.LAYOUT_SCALE_TO_FIT)))
            .build().use { extractor ->
                for (ts in timestamps) {
                    coroutine.ensureActive()
                    val decoded = runInterruptible { extractor.getFrame(ts).get(10, TimeUnit.SECONDS) }
                    try {
                        val out = ByteArrayOutputStream()
                        decoded.bitmap.compress(Bitmap.CompressFormat.JPEG, 74, out)
                        var jpegBytes = out.toByteArray()
                        if (jpegBytes.size > maxKeyframeBytes) {
                            out.reset()
                            decoded.bitmap.compress(Bitmap.CompressFormat.JPEG, 50, out)
                            jpegBytes = out.toByteArray()
                        }
                        if (jpegBytes.isNotEmpty() && jpegBytes.size <= maxKeyframeBytes) {
                            frames.add(
                                ExtractedKeyframe(
                                    timestampMs = max(0L, decoded.presentationTimeMs),
                                    mimeType = "image/jpeg",
                                    dataBase64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP),
                                ),
                            )
                        }
                    } finally {
                        decoded.bitmap.recycle()
                    }
                }
            }
        frames
    }
}

@OptIn(UnstableApi::class)
internal suspend fun extractVideoThumbnail(
    context: Context,
    clip: ExerciseClip,
): Bitmap? = withContext(Dispatchers.IO) {
    runCatching {
        val app = context.applicationContext
        FrameExtractor.Builder(app, MediaItem.fromUri(clip.uri))
            .setEffects(listOf(Presentation.createForWidthAndHeight(480, 480, Presentation.LAYOUT_SCALE_TO_FIT)))
            .build().use { extractor ->
                val frame = extractor.getThumbnail().get(8, TimeUnit.SECONDS)
                frame.bitmap.copy(Bitmap.Config.ARGB_8888, false).also {
                    frame.bitmap.recycle()
                }
            }
    }.getOrNull()
}

internal fun buildKeyframeReviewPayload(
    attemptId: String?,
    movement: PoseMovement,
    targetAngle: Int,
    cycle: FlaggedCycleSpec,
    keyframes: List<ExtractedKeyframe>,
): JSONObject = JSONObject().apply {
    if (attemptId != null) put("attemptId", attemptId)
    put("movement", movement.apiKey)
    put("cycleIndex", cycle.cycleIndex)
    put("fromMs", cycle.fromMs.toInt())
    put("toMs", cycle.toMs.toInt())
    put("severity", cycle.severity)
    put("peakAngleDeg", cycle.peakAngleDeg)
    put("targetAngle", targetAngle)
    put("errorCodes", JSONArray(cycle.errorCodes))
    put(
        "keyframes",
        JSONArray().apply {
            keyframes.forEach { kf ->
                put(
                    JSONObject()
                        .put("timestampMs", kf.timestampMs.toInt())
                        .put("mimeType", kf.mimeType)
                        .put("dataBase64", kf.dataBase64),
                )
            }
        },
    )
}

internal fun openClipStream(context: Context, clip: ExerciseClip): InputStream = when {
    clip.localFile != null -> clip.localFile.inputStream()
    clip.isPublic -> context.assets.open("pose-cdc-sample.webm")
    else -> requireNotNull(context.contentResolver.openInputStream(clip.uri))
}

private fun inspectClipMetadata(context: Context, uri: Uri): Pair<Long, String?> {
    val resolver = context.contentResolver
    val mime = normalizeVideoMimeType(resolver.getType(uri))
    var size = 0L
    resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (idx >= 0 && !cursor.isNull(idx)) size = cursor.getLong(idx)
        }
    }
    if (size <= 0L) {
        size = runCatching {
            resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: 0L
        }.getOrDefault(0L)
    }
    if (size <= 0L) {
        size = runCatching {
            resolver.openInputStream(uri)?.use { stream ->
                val buf = ByteArray(16 * 1024)
                var total = 0L
                while (true) {
                    val n = stream.read(buf)
                    if (n < 0) break
                    total += n
                }
                total
            } ?: 0L
        }.getOrDefault(0L)
    }
    return size to (mime ?: "video/mp4")
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
