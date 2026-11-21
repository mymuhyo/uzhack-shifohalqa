package uz.shifohalqa.android

import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.acos
import kotlin.math.abs
import kotlin.math.hypot

internal data class ExerciseCameraFrame(val ready: Boolean, val angle: Double?, val result: ChairStandResult)
private data class Knee(val side: Int, val angle: Double, val visibility: Double)

@Composable
internal fun ExerciseCamera(
    modifier: Modifier,
    targetAngle: Int,
    onFrame: (ExerciseCameraFrame) -> Unit,
    onError: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val latestFrame = rememberUpdatedState(onFrame)
    val latestError = rememberUpdatedState(onError)
    val view = remember(context) {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FIT_CENTER
            contentDescription = "Mashq kamerasining ko‘rinishi"
        }
    }
    AndroidView(factory = { view }, modifier = modifier)

    DisposableEffect(view, lifecycle, targetAngle) {
        val active = AtomicBoolean(true)
        val main = ContextCompat.getMainExecutor(context)
        val executor = Executors.newSingleThreadExecutor()
        val camera = ProcessCameraProvider.getInstance(context)
        val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
        val analysis = ImageAnalysis.Builder()
            .setResolutionSelector(ResolutionSelector.Builder().setResolutionStrategy(
                ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER),
            ).build())
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
        var provider: ProcessCameraProvider? = null
        var detector: PoseLandmarker? = null
        val tracker = ChairStandTracker(targetAngle)
        var lastTime = Long.MIN_VALUE
        var previousSide: Int? = null

        fun reportError() = main.execute { if (active.get()) latestError.value() }

        analysis.setAnalyzer(executor) { proxy ->
            try {
                if (!active.get()) return@setAnalyzer
                val time = proxy.imageInfo.timestamp / 1_000_000
                if (time <= lastTime) return@setAnalyzer
                lastTime = time
                val landmarker = detector ?: PoseLandmarker.createFromOptions(
                    context.applicationContext,
                    PoseLandmarker.PoseLandmarkerOptions.builder()
                        .setBaseOptions(BaseOptions.builder().setModelAssetPath("pose_landmarker_lite.task").build())
                        .setRunningMode(RunningMode.VIDEO)
                        .setNumPoses(1)
                        .build(),
                ).also { detector = it }
                val bitmap = proxy.toBitmap()
                val image = BitmapImageBuilder(bitmap).build()
                val rotation = proxy.imageInfo.rotationDegrees
                val processing = ImageProcessingOptions.builder().setRotationDegrees(rotation).build()
                val points = try {
                    landmarker.detectForVideo(image, processing, time).landmarks().firstOrNull()
                } finally {
                    image.close()
                    bitmap.recycle()
                }
                val sideways = rotation == 90 || rotation == 270
                val width = if (sideways) proxy.height else proxy.width
                val height = if (sideways) proxy.width else proxy.height
                val knee = points?.let { pickKnee(it, width, height, previousSide) }
                tracker.update(time, knee?.angle, knee?.visibility ?: 0.0, knee?.side)
                previousSide = knee?.side
                val frame = ExerciseCameraFrame(tracker.ready, tracker.angle, tracker.result())
                main.execute { if (active.get()) latestFrame.value(frame) }
            } catch (_: Exception) {
                reportError()
            } finally {
                proxy.close()
            }
        }
        camera.addListener({
            if (active.get()) {
                try {
                    val available = camera.get()
                    provider = available
                    val selector = if (available.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) {
                        CameraSelector.DEFAULT_FRONT_CAMERA
                    } else CameraSelector.DEFAULT_BACK_CAMERA
                    available.bindToLifecycle(lifecycle, selector, preview, analysis)
                } catch (_: Exception) {
                    reportError()
                }
            }
        }, main)

        onDispose {
            active.set(false)
            analysis.clearAnalyzer()
            provider?.unbind(preview, analysis)
            executor.execute { detector?.close() }
            executor.shutdown()
        }
    }
}

private fun pickKnee(points: List<NormalizedLandmark>, width: Int, height: Int, previous: Int?): Knee? {
    val left = measureKnee(points, width, height, 0)
    val right = measureKnee(points, width, height, 1)
    if (left == null || right == null) return left ?: right
    val tracked = if (previous == 0) left else if (previous == 1) right else null
    if (tracked != null && (tracked.visibility >= .75 || abs(left.visibility - right.visibility) < .05)) return tracked
    return if (left.visibility >= right.visibility) left else right
}

private fun measureKnee(points: List<NormalizedLandmark>, width: Int, height: Int, side: Int): Knee? {
    val hip = points.getOrNull(23 + side) ?: return null
    val knee = points.getOrNull(25 + side) ?: return null
    val ankle = points.getOrNull(27 + side) ?: return null
    val landmarks = listOf(hip, knee, ankle)
    if (landmarks.any { it.x() !in 0f..1f || it.y() !in 0f..1f }) return null
    val visibility = landmarks.minOf { it.visibility().orElse(0f) }.toDouble()
    if (visibility !in .4..1.0) return null

    val ax = (hip.x() - knee.x()).toDouble() * width
    val ay = (hip.y() - knee.y()).toDouble() * height
    val bx = (ankle.x() - knee.x()).toDouble() * width
    val by = (ankle.y() - knee.y()).toDouble() * height
    val product = hypot(ax, ay) * hypot(bx, by)
    if (product < 1e-6) return null
    return Knee(side, Math.toDegrees(acos(((ax * bx + ay * by) / product).coerceIn(-1.0, 1.0))), visibility)
}
