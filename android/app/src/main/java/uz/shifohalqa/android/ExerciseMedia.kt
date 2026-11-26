package uz.shifohalqa.android

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.inspector.frame.FrameExtractor
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

internal enum class ExerciseSample(val movement: PoseMovement, val fileName: String, val sha256: String) {
    Chair(PoseMovement.ChairStand, "pose-cdc-sample.webm", "04caa87ae78f78607d0628a3837001b027a964952597ca99925dad681b5ef65c"),
    Elbow(PoseMovement.ElbowBend, "pose-cdc-elbow.webm", "bb2b40f9d91e28aa20411b16629855dd07223d6d1961c952cd0d40fbd9962787"),
    Knee(PoseMovement.SeatedKneeExt, "pose-cdc-seated-knee.webm", "f5355729eefb252fed79078fc86a8cf40cbc43702181e4bd3cb0fe0e668e3a20"),
}

internal suspend fun loadExerciseSample(
    context: Context, sample: ExerciseSample, api: MobileApi?, onProgress: (Int) -> Unit,
): ExerciseClip = withContext(Dispatchers.IO) {
    if (sample == ExerciseSample.Chair) return@withContext ExerciseClip.PublicSample
    val cached = File(context.cacheDir, "${sample.sha256}.webm")
    val coroutine = currentCoroutineContext()
    if (cached.isFile && cached.length() in 1..MAX_SAMPLE_BYTES &&
        cached.inputStream().use { fingerprint(it) { coroutine.ensureActive() } } == sample.sha256
    ) return@withContext ExerciseClip.cached(cached, sample)

    if (api == null) throw MobileFailure(MobileFailureKind.Offline)
    val temporary = File.createTempFile("mashq-namuna-", ".tmp", context.cacheDir)
    try {
        api.downloadSample(sample, temporary, onProgress)
        if (temporary.inputStream().use { fingerprint(it) { coroutine.ensureActive() } } != sample.sha256) {
            throw MobileFailure(MobileFailureKind.Rejected)
        }
        if (!temporary.renameTo(cached)) throw IOException()
        ExerciseClip.cached(cached, sample)
    } finally {
        temporary.delete()
    }
}

internal const val MAX_SAMPLE_BYTES = 8L * 1024 * 1024
internal const val MAX_SHARED_VIDEO_BYTES = 20L * 1024 * 1024

internal fun canShareVideo(durationMs: Long, size: Long, mime: String): Boolean =
    durationMs in 1..60_000 && size in 1..MAX_SHARED_VIDEO_BYTES && mime in setOf("video/mp4", "video/webm")

internal data class FlaggedCycle(val index: Int, val cycle: ExerciseCycle, val codes: List<String>)
internal data class KeyframeObservation(val summary: String, val uncertainty: String)

internal fun flaggedCycles(cycles: List<ExerciseCycle>): List<FlaggedCycle> =
    cycles.mapIndexedNotNull { index, cycle ->
        val codes = buildList {
            if (!cycle.reachesTarget) add("shallow_range")
            addAll(cycle.postureCodes)
            val duration = cycle.toMs - cycle.fromMs
            if (duration < 1_200) add("too_fast")
            if (duration > 6_500) add("too_slow")
        }
        if (codes.isEmpty()) null else FlaggedCycle(index, cycle, codes)
    }

internal fun keyframeTimestamps(from: Long, to: Long): List<Long> =
    if (from < 0 || to - from < 3) emptyList() else List(4) { from + (to - from) * it / 3 }

@OptIn(UnstableApi::class)
internal suspend fun extractKeyframeReview(
    context: Context, result: ExerciseVideoResult, flagged: FlaggedCycle, attemptId: String?,
): JSONObject? = withContext(Dispatchers.IO) {
    val cycle = flagged.cycle
    val frames = JSONArray()
    val usedTimes = mutableSetOf<Long>()
    FrameExtractor.Builder(context, MediaItem.fromUri(result.clip.uri))
        .setEffects(listOf(Presentation.createForWidthAndHeight(320, 320, Presentation.LAYOUT_SCALE_TO_FIT)))
        .build().use { extractor ->
            for (time in keyframeTimestamps(cycle.fromMs, cycle.toMs)) {
                ensureActive()
                val frame = runInterruptible { extractor.getFrame(time).get(10, TimeUnit.SECONDS) }
                try {
                    val timestamp = frame.presentationTimeMs
                    if (timestamp !in cycle.fromMs..cycle.toMs || !usedTimes.add(timestamp)) continue
                    val bytes = ByteArrayOutputStream()
                    if (!frame.bitmap.compress(Bitmap.CompressFormat.JPEG, 70, bytes) || bytes.size() !in 1..131_072) continue
                    frames.put(JSONObject().put("timestampMs", timestamp).put("mimeType", "image/jpeg")
                        .put("dataBase64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)))
                } finally {
                    frame.bitmap.recycle()
                }
            }
        }
    if (frames.length() < 3) return@withContext null
    JSONObject().put("attemptId", attemptId).put("movement", result.movement.apiKey)
        .put("cycleIndex", flagged.index).put("fromMs", cycle.fromMs).put("toMs", cycle.toMs)
        .put("severity", "yellow").put("peakAngleDeg", cycle.peakAngle ?: JSONObject.NULL)
        .put("targetAngle", result.targetAngle).put("errorCodes", JSONArray(flagged.codes)).put("keyframes", frames)
}
