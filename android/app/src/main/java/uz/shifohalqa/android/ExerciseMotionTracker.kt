package uz.shifohalqa.android

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark

// MediaPipe returns coordinates in the original image, even when inference uses rotation.
internal fun rotateCameraLandmarks(points: List<NormalizedLandmark>, rotation: Int): List<NormalizedLandmark> {
    require(rotation in setOf(0, 90, 180, 270))
    return points.map { point ->
        val (x, y) = when (rotation) {
            90 -> 1f - point.y() to point.x()
            180 -> 1f - point.x() to 1f - point.y()
            270 -> point.y() to 1f - point.x()
            else -> point.x() to point.y()
        }
        NormalizedLandmark.create(x, y, point.z(), point.visibility(), point.presence())
    }
}

internal class ExerciseMotionTracker(plan: ExercisePlan, private val live: Boolean) {
    private val chair = if (plan.movement == PoseMovement.ChairStand) ChairStandTracker(plan.targetAngle, live) else null
    private val pose = PoseTracker(plan.movement, plan.targetAngle, plan.targetReps, plan.maxShallow, liveCamera = live)
    private var angle: Double? = null
    private var previousSide: Int? = null
    private var lastFrame: PoseFrameUpdate? = null
    private var lastWidth: Int = 0
    private var lastHeight: Int = 0

    fun update(points: List<NormalizedLandmark>?, width: Int, height: Int, timestamp: Long) {
        lastWidth = width
        lastHeight = height
        val update = pose.update(points.orEmpty().map {
            PoseLandmarkPoint(it.x(), it.y(), it.visibility().orElse(0f))
        }, width, height, timestamp)
        lastFrame = update
        angle = update?.angle
        if (chair != null) {
            val knee = points?.let { pickKnee(it, width, height, previousSide, live) }
            chair.update(timestamp, knee?.angle, knee?.visibility ?: 0.0, knee?.side)
            previousSide = if (knee != null && chair.ready) knee.side else null
        }
    }

    fun cameraFrame(mirrored: Boolean = false) = ExerciseCameraFrame(
        ready = chair?.ready ?: pose.isReady(),
        angle = if (chair != null) chair.angle else angle,
        result = result(),
        joints = lastFrame?.joints.orEmpty(),
        torsoJoints = lastFrame?.torsoJoints,
        formWarning = lastFrame?.formWarning,
        frameWidth = lastWidth,
        frameHeight = lastHeight,
        mirrored = mirrored,
    )

    fun result(): ExerciseMeasurement {
        val result = pose.result()
        return chair?.result()?.copy(pose = result.takeIf { it.hasUsableMeasurement }) ?: ExerciseMeasurement(
            result.validReps, result.shallowReps, result.minAngle, result.confidence, result.analyzedFrames,
            result.motionSignature, result,
        )
    }

    fun completedCycles(): List<ExerciseCycle> = chair?.completedCycles()
        ?: pose.result().cycles.map { ExerciseCycle(it.fromMs, it.toMs) }
}
