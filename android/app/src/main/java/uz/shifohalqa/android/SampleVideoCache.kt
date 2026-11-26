package uz.shifohalqa.android

import android.content.Context
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal data class SampleClipSpec(
    val movement: PoseMovement,
    val titleUz: String,
    val bundledAssetName: String?,
    val serverPath: String,
    val cacheFileName: String,
    val sha256: String,
    val sourceUrl: String,
)

internal object SampleVideoCatalog {
    val ChairStand = SampleClipSpec(
        movement = PoseMovement.ChairStand,
        titleUz = "CDC o‘tirib-turish namunasi",
        bundledAssetName = "pose-cdc-sample.webm",
        serverPath = "/demo/pose-cdc-sample.webm",
        cacheFileName = "pose-cdc-sample.webm",
        sha256 = "04caa87ae78f78607d0628a3837001b027a964952597ca99925dad681b5ef65c",
        sourceUrl = "https://commons.wikimedia.org/wiki/File:30-Second_Chair_Stand_Test.webm",
    )

    val ElbowBend = SampleClipSpec(
        movement = PoseMovement.ElbowBend,
        titleUz = "CDC tirsak bukish namunasi",
        bundledAssetName = null,
        serverPath = "/demo/pose-cdc-elbow.webm",
        cacheFileName = "pose-cdc-elbow.webm",
        sha256 = "bb2b40f9d91e28aa20411b16629855dd07223d6d1961c952cd0d40fbd9962787",
        sourceUrl = "https://commons.wikimedia.org/wiki/File:Muscle_Strengthening_at_Home_-_Bicep_Curls.webm",
    )

    val SeatedKneeExt = SampleClipSpec(
        movement = PoseMovement.SeatedKneeExt,
        titleUz = "Fitness in 5 oyoq tekislash namunasi",
        bundledAssetName = null,
        serverPath = "/demo/pose-cdc-seated-knee.webm",
        cacheFileName = "pose-cdc-seated-knee.webm",
        sha256 = "f5355729eefb252fed79078fc86a8cf40cbc43702181e4bd3cb0fe0e668e3a20",
        sourceUrl = "https://archive.org/details/jccva-Fitness_in_5_Episode_1_-_Chair_Exercises",
    )

    val GrandFinalMovements: List<PoseMovement> = listOf(
        PoseMovement.ChairStand,
        PoseMovement.ElbowBend,
        PoseMovement.SeatedKneeExt,
    )

    fun specFor(movement: PoseMovement): SampleClipSpec = when (movement) {
        PoseMovement.ChairStand -> ChairStand
        PoseMovement.ElbowBend -> ElbowBend
        PoseMovement.SeatedKneeExt -> SeatedKneeExt
        else -> ChairStand
    }
}

internal class SampleVideoCache(context: Context) {
    private val cacheDir = File(context.cacheDir, "exercise-samples")

    fun cachedFileIfValid(spec: SampleClipSpec): File? {
        val file = File(cacheDir, spec.cacheFileName)
        if (!file.exists() || file.length() <= 0L) return null
        return if (sha256Hex(file).equals(spec.sha256, ignoreCase = true)) file else null
    }

    suspend fun resolveClip(
        spec: SampleClipSpec,
        api: MobileApi?,
        onProgress: (Int) -> Unit,
    ): ExerciseClip {
        if (spec.bundledAssetName != null) {
            return ExerciseClip.PublicSample
        }
        val existing = withContext(Dispatchers.IO) { cachedFileIfValid(spec) }
        if (existing != null) {
            return ExerciseClip.fromCachedSample(existing, spec.movement)
        }
        if (api == null) {
            throw MobileFailure(MobileFailureKind.Offline)
        }
        val target = File(cacheDir, spec.cacheFileName)
        val downloaded = api.downloadVerifiedSample(spec.serverPath, target, spec.sha256, onProgress)
        return ExerciseClip.fromCachedSample(downloaded, spec.movement)
    }

    private fun sha256Hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(32 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                digest.update(buf, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
