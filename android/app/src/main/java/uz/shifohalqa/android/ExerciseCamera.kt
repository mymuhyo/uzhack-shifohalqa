package uz.shifohalqa.android

import android.graphics.Paint
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size as ComposeSize
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
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
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal data class ExerciseCameraFrame(
    val ready: Boolean,
    val angle: Double?,
    val result: ExerciseMeasurement,
    val joints: List<PoseLandmarkPoint> = emptyList(),
    val torsoJoints: List<PoseLandmarkPoint>? = null,
    val formWarning: PoseFormWarning? = null,
    val frameWidth: Int = 0,
    val frameHeight: Int = 0,
    val mirrored: Boolean = false,
)
internal data class Knee(val side: Int, val angle: Double, val visibility: Double)

@Composable
internal fun ExerciseCamera(
    modifier: Modifier,
    plan: ExercisePlan,
    onFrame: (ExerciseCameraFrame) -> Unit,
    onError: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val latestFrame = rememberUpdatedState(onFrame)
    val latestError = rememberUpdatedState(onError)
    var latestOverlay by remember { mutableStateOf<ExerciseCameraFrame?>(null) }
    val mirroredFront = remember { AtomicBoolean(true) }
    val view = remember(context) {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FIT_CENTER
            contentDescription = "Mashq kamerasining ko‘rinishi"
        }
    }
    Box(modifier = modifier) {
        AndroidView(factory = { view }, modifier = Modifier.fillMaxSize())
        PoseSkeletonOverlay(latestOverlay, plan, Modifier.fillMaxSize())
    }

    DisposableEffect(view, lifecycle, plan) {
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
        val tracker = ExerciseMotionTracker(plan, live = true)
        var lastTime = Long.MIN_VALUE

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
                        .setBaseOptions(BaseOptions.builder().setModelAssetPath("pose_landmarker_full.task").build())
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
                tracker.update(points, width, height, time)
                val frame = tracker.cameraFrame(mirrored = mirroredFront.get())
                main.execute {
                    if (active.get()) {
                        latestOverlay = frame
                        latestFrame.value(frame)
                    }
                }
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
                    val hasFront = available.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)
                    mirroredFront.set(hasFront)
                    val selector = if (hasFront) {
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

@Composable
private fun PoseSkeletonOverlay(
    frame: ExerciseCameraFrame?,
    plan: ExercisePlan,
    modifier: Modifier = Modifier,
) {
    val labelPaint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 36f
            isFakeBoldText = true
        }
    }
    Canvas(modifier = modifier) {
        val current = frame ?: return@Canvas
        if (current.joints.size != 3 || current.frameWidth <= 0 || current.frameHeight <= 0) return@Canvas
        val scale = min(size.width / current.frameWidth.toFloat(), size.height / current.frameHeight.toFloat())
        val contentW = current.frameWidth * scale
        val contentH = current.frameHeight * scale
        val offsetX = (size.width - contentW) / 2f
        val offsetY = (size.height - contentH) / 2f

        fun mapPoint(point: PoseLandmarkPoint): Offset {
            val nx = if (current.mirrored) 1f - point.x else point.x
            return Offset(offsetX + nx * contentW, offsetY + point.y * contentH)
        }

        val radius = max(7f, min(contentW, contentH) * 0.015f)
        val torso = current.torsoJoints
        if (torso != null && torso.size == 2) {
            val shoulder = mapPoint(torso[0])
            val hip = mapPoint(torso[1])
            drawLine(
                color = Color(0x73DBFFEE),
                start = hip,
                end = Offset(hip.x, shoulder.y),
                strokeWidth = max(2f, radius * 0.4f),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f)),
            )
            drawLine(
                color = if (current.formWarning == PoseFormWarning.TrunkLean) Color(0xFFFF7A70) else Color(0xBF83F4C2),
                start = shoulder,
                end = hip,
                strokeWidth = radius * 0.65f,
                cap = StrokeCap.Round,
            )
        }

        val reached = current.angle != null && if (plan.movement.direction == PoseDirection.Extend) {
            current.angle >= plan.targetAngle
        } else {
            current.angle <= plan.targetAngle
        }
        val lineColor = when {
            current.formWarning != null -> Color(0xFFFF7A70)
            reached -> Color(0xFF4CF2A3)
            else -> Color(0xFF83F4C2)
        }
        val pts = current.joints.map(::mapPoint)
        val limbPath = androidx.compose.ui.graphics.Path().apply {
            moveTo(pts[0].x, pts[0].y)
            lineTo(pts[1].x, pts[1].y)
            lineTo(pts[2].x, pts[2].y)
        }
        drawPath(
            limbPath,
            color = Color(0xFF08231E),
            style = Stroke(width = radius * 1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        drawPath(
            limbPath,
            color = lineColor,
            style = Stroke(width = radius * 0.8f, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        val dotColor = if (current.formWarning != null) Color(0xFFFFD6D1) else Color(0xFFDBFFEE)
        pts.forEach { drawCircle(dotColor, radius = radius, center = it) }

        current.angle?.let { angle ->
            val label = "${angle.roundToInt()}°"
            labelPaint.color = lineColor.toArgb()
            val textW = labelPaint.measureText(label)
            val padX = 14f
            val padY = 10f
            val boxW = textW + padX * 2
            val boxH = 44f + padY
            val boxX = min(size.width - boxW - 8f, max(8f, pts[1].x + radius * 1.8f))
            val boxY = max(8f, min(size.height - boxH - 8f, pts[1].y - boxH / 2f))
            drawRoundRect(
                color = Color(0xD108231E),
                topLeft = Offset(boxX, boxY),
                size = ComposeSize(boxW, boxH),
                cornerRadius = CornerRadius(10f, 10f),
            )
            drawContext.canvas.nativeCanvas.drawText(label, boxX + padX, boxY + 38f, labelPaint)
        }
    }
}

internal fun pickKnee(points: List<NormalizedLandmark>, width: Int, height: Int, previous: Int?, live: Boolean = true): Knee? {
    val left = measureKnee(points, width, height, 0)
    val right = measureKnee(points, width, height, 1)
    if (left == null || right == null) return left ?: right
    val tracked = if (previous == 0) left else if (previous == 1) right else null
    if (tracked != null && ((live && tracked.visibility >= .75) || abs(left.visibility - right.visibility) < .05)) return tracked
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
