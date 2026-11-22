package uz.shifohalqa.android

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark

internal class ExerciseMotionTracker(plan: ExercisePlan, private val live: Boolean) {
    private val chair = if (plan.movement == PoseMovement.ChairStand) ChairStandTracker(plan.targetAngle, live) else null
    private val pose = PoseTracker(plan.movement, plan.targetAngle, plan.targetReps, plan.maxShallow, liveCamera = live)
    private var angle: Double? = null
    private var previousSide: Int? = null

    fun update(points: List<NormalizedLandmark>?, width: Int, height: Int, timestamp: Long) {
        angle = pose.update(points.orEmpty().map {
            PoseLandmarkPoint(it.x(), it.y(), it.visibility().orElse(0f))
        }, width, height, timestamp)?.angle
        if (chair != null) {
            val knee = points?.let { pickKnee(it, width, height, previousSide, live) }
            chair.update(timestamp, knee?.angle, knee?.visibility ?: 0.0, knee?.side)
            previousSide = knee?.side
        }
    }

    fun cameraFrame() = ExerciseCameraFrame(chair?.ready ?: pose.isReady(),
        if (chair != null) chair.angle else angle, result())

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
