package uz.shifohalqa.android

import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONObject

internal enum class PoseDirection { Flex, Extend }

internal enum class PoseMovement(
    val apiKey: String,
    val titleUz: String,
    val shortTitleUz: String,
    val jointLabelUz: String,
    val pointsLabelUz: String,
    val startCueUz: String,
    val cycleCueUz: String,
    val direction: PoseDirection,
    val leftJoints: Triple<Int, Int, Int>,
    val rightJoints: Triple<Int, Int, Int>,
    val restThreshold: Double,
    val bendingThreshold: Double,
    val peakThreshold: Double,
    val defaultTargetAngle: Int,
    val defaultTargetReps: Int = 5,
    val defaultMaxShallow: Int = 1,
) {
    ChairStand(
        apiKey = "chair_stand",
        titleUz = "O‘tirib-turish mashqi",
        shortTitleUz = "O‘tirib-turish",
        jointLabelUz = "Tizza",
        pointsLabelUz = "Son, tizza va to‘piq",
        startCueUz = "tik turing",
        cycleCueUz = "O‘tirib yana tik turing.",
        direction = PoseDirection.Flex,
        leftJoints = Triple(23, 25, 27),
        rightJoints = Triple(24, 26, 28),
        restThreshold = 160.0,
        bendingThreshold = 150.0,
        peakThreshold = 140.0,
        defaultTargetAngle = 100,
    ),
    ElbowBend(
        apiKey = "elbow_bend",
        titleUz = "Tirsakni bukib-yozish mashqi",
        shortTitleUz = "Tirsak bukish",
        jointLabelUz = "Tirsak",
        pointsLabelUz = "Yelka, tirsak va bilak",
        startCueUz = "qo‘lingizni yozing",
        cycleCueUz = "Tirsakni bukib, qo‘lingizni yana yozing.",
        direction = PoseDirection.Flex,
        leftJoints = Triple(11, 13, 15),
        rightJoints = Triple(12, 14, 16),
        restThreshold = 155.0,
        bendingThreshold = 145.0,
        peakThreshold = 125.0,
        defaultTargetAngle = 95,
    ),
    KneeLift(
        apiKey = "knee_lift",
        titleUz = "Tik turib tizzani ko‘tarish",
        shortTitleUz = "Tizza ko‘tarish",
        jointLabelUz = "Son-chanaq",
        pointsLabelUz = "Yelka, son va tizza",
        startCueUz = "tik turing",
        cycleCueUz = "Tizzani ko‘tarib, yana tushiring.",
        direction = PoseDirection.Flex,
        leftJoints = Triple(11, 23, 25),
        rightJoints = Triple(12, 24, 26),
        restThreshold = 162.0,
        bendingThreshold = 150.0,
        peakThreshold = 135.0,
        defaultTargetAngle = 110,
    ),
    ShoulderRaise(
        apiKey = "shoulder_raise",
        titleUz = "Qo‘lni yelkadan ko‘tarish",
        shortTitleUz = "Qo‘l ko‘tarish",
        jointLabelUz = "Yelka",
        pointsLabelUz = "Son, yelka va tirsak",
        startCueUz = "qo‘lingizni pastga tushiring",
        cycleCueUz = "Qo‘lni yuqoriga ko‘tarib, yana pastga tushiring.",
        direction = PoseDirection.Extend,
        leftJoints = Triple(23, 11, 13),
        rightJoints = Triple(24, 12, 14),
        restThreshold = 40.0,
        bendingThreshold = 50.0,
        peakThreshold = 70.0,
        defaultTargetAngle = 90,
    ),
    SeatedKneeExt(
        apiKey = "seated_knee_ext",
        titleUz = "O‘tirib oyoqni tekislash",
        shortTitleUz = "Oyoq tekislash",
        jointLabelUz = "Tizza",
        pointsLabelUz = "Son, tizza va to‘piq",
        startCueUz = "stulda tizzani bukib o‘tiring",
        cycleCueUz = "Tizzani oldinga tekislab, yana tushiring.",
        direction = PoseDirection.Extend,
        leftJoints = Triple(23, 25, 27),
        rightJoints = Triple(24, 26, 28),
        restThreshold = 115.0,
        bendingThreshold = 125.0,
        peakThreshold = 140.0,
        defaultTargetAngle = 155,
    );

    companion object {
        fun fromApiKey(value: String?): PoseMovement =
            entries.firstOrNull { it.apiKey == value } ?: ChairStand
    }
}

internal enum class PoseFormWarning(val labelUz: String, val code: String) {
    TrunkLean("Gavdani tik tuting", "trunk_lean"),
    ElbowDrift("Tirsakni tanaga yaqin tuting", "elbow_drift"),
    ShoulderAsymmetry("Yelkani tekis tuting", "shoulder_asymmetry"),
}

internal data class PoseLandmarkPoint(val x: Float, val y: Float, val visibility: Float)

internal data class PoseCycleResult(
    val fromMs: Long,
    val toMs: Long,
    val minAngle: Double,
    val reachesTarget: Boolean,
    val postureCodes: Set<String> = emptySet(),
)

internal data class PoseFrameUpdate(
    val angle: Double,
    val joints: List<PoseLandmarkPoint>,
    val torsoJoints: List<PoseLandmarkPoint>?,
    val formWarning: PoseFormWarning?,
)

internal data class PoseBiomechanics(
    val trunkLeanMaxDeg: Double?,
    val elbowDriftMaxDeg: Double?,
    val shoulderTiltMaxDeg: Double?,
    val compensationCycles: Int,
    val tempoSpreadSeconds: Double?,
    val currentFormWarning: PoseFormWarning?,
)

internal data class PoseTrackerResult(
    val movement: PoseMovement,
    val targetAngle: Int,
    val targetReps: Int,
    val maxShallow: Int,
    val validReps: Int,
    val shallowReps: Int,
    val minAngle: Double?,
    val confidence: Double?,
    val motionSignature: List<Double>?,
    val analyzedFrames: Int,
    val avgCycleSeconds: Double?,
    val interruptedCycles: Int,
    val incompleteCycles: Int,
    val ready: Boolean,
    val cycles: List<PoseCycleResult>,
    val biomechanics: PoseBiomechanics,
) {
    val hasUsableMeasurement: Boolean
        get() = analyzedFrames >= 5 && minAngle != null && (confidence ?: 0.0) >= 0.75

    fun toExerciseApiPayload(): JSONObject = JSONObject().apply {
        put("movement", movement.apiKey)
        put("source", "live_camera")
        put("fileSha256", JSONObject.NULL)
        put("patientConfirmed", true)
        put("validReps", validReps)
        put("shallowReps", shallowReps)
        put("minAngle", minAngle ?: JSONObject.NULL)
        put("confidence", confidence ?: JSONObject.NULL)
        put("analyzedFrames", analyzedFrames)
        put("interruptedCycles", interruptedCycles)
        put("incompleteCycles", incompleteCycles)
        avgCycleSeconds?.let { put("avgCycleSeconds", it) } ?: put("avgCycleSeconds", JSONObject.NULL)
        if (motionSignature != null && motionSignature.size == 20) {
            put("motionSignature", JSONArray(motionSignature))
        } else {
            put("motionSignature", JSONObject.NULL)
        }
        put(
            "formMetrics",
            JSONObject().apply {
                biomechanics.trunkLeanMaxDeg?.let { put("trunkLeanMaxDeg", it) }
                biomechanics.elbowDriftMaxDeg?.let { put("elbowDriftMaxDeg", it) }
                biomechanics.shoulderTiltMaxDeg?.let { put("shoulderTiltMaxDeg", it) }
                put("compensationCycles", biomechanics.compensationCycles)
                biomechanics.tempoSpreadSeconds?.let { put("tempoSpreadSeconds", it) }
            },
        )
    }


}

internal data class ExerciseDiagnosticsSummary(
    val errorCodes: List<String>,
    val severity: String,
    val needsDoctorReview: Boolean,
    val formScore: Int,
    val focusCueUz: String,
    val patientCoachingUz: String,
    val doctorSummaryUz: String,
)

internal class PoseTracker(
    private val movement: PoseMovement,
    private val targetAngle: Int = movement.defaultTargetAngle,
    private val targetReps: Int = movement.defaultTargetReps,
    private val maxShallow: Int = movement.defaultMaxShallow,
    private val liveCamera: Boolean = true,
) {
    private enum class Side { Left, Right }
    private enum class Phase { Waiting, Standing, Descending, Bottom, Ascending }
    private data class AngleSample(val angle: Double, val timeMs: Long)
    private data class SideMeasurement(val side: Side, val angle: Double, val visibility: Double)
    private class ActiveCycle(
        initial: AngleSample,
    ) {
        val samples = mutableListOf(initial)
        var minimum = initial.angle
        var maximum = initial.angle
        var bottomFrames = 0
        val postureCodes = mutableSetOf<String>()
    }

    private val angleWindow = 5
    private val liveAngleWindowMs = 400L
    private val maxFrameGapMs = 750L
    private val minVisibility = 0.4f
    private val framingVisibility = 0.75
    private val minCycleMs = 350L
    private val maxCycleMs = 15_000L

    private val recentAngles = ArrayDeque<AngleSample>()
    private var measuring = !liveCamera
    private var phase = Phase.Waiting
    private var trackedSide: Side? = null
    private var standingSample: AngleSample? = null
    private var cycle: ActiveCycle? = null
    private var lastFrameTime = Long.MIN_VALUE
    private var attemptedFrames = 0
    private var trailingMissedFrames = 0
    private var analyzedFrames = 0
    private var visibilitySum = 0.0
    private var extremalAngle: Double? = null
    private var validReps = 0
    private var shallowReps = 0
    private var interruptedCycles = 0
    private var incompleteCycles = 0
    private var compensationCycles = 0
    private var trunkLeanMaxDeg: Double? = null
    private var elbowDriftMaxDeg: Double? = null
    private var shoulderTiltMaxDeg: Double? = null
    private var currentFormWarning: PoseFormWarning? = null
    private var motionSignature: List<Double>? = null
    private val completed = mutableListOf<PoseCycleResult>()

    fun isTracking(): Boolean = recentAngles.size == angleWindow
    fun isReady(): Boolean = standingSample != null

    fun update(landmarks: List<PoseLandmarkPoint>, width: Int, height: Int, timestampMs: Long): PoseFrameUpdate? {
        if (timestampMs <= lastFrameTime) return null
        if (lastFrameTime != Long.MIN_VALUE && timestampMs - lastFrameTime > (if (liveCamera) liveAngleWindowMs else maxFrameGapMs)) {
            resetSegment()
        }
        lastFrameTime = timestampMs

        val measurement = measureFrame(landmarks, width, height)
        if (measurement == null || (!measuring && measurement.visibility < framingVisibility)) {
            attemptedFrames += 1
            trailingMissedFrames += 1
            resetSegment()
            return null
        }
        if (trackedSide != null && measurement.side != trackedSide) resetSegment()
        trackedSide = measurement.side
        attemptedFrames += 1
        trailingMissedFrames = 0
        analyzedFrames += 1
        visibilitySum += measurement.visibility

        recentAngles.addLast(AngleSample(measurement.angle, timestampMs))
        if (recentAngles.size > angleWindow) recentAngles.removeFirst()
        if (recentAngles.size < angleWindow) return null

        val samples = if (liveCamera) {
            recentAngles.filter { timestampMs - it.timeMs <= liveAngleWindowMs }
        } else {
            recentAngles.toList()
        }
        if (samples.isEmpty()) return null

        measuring = true
        val angle = samples.sumOf { it.angle } / samples.size
        extremalAngle = when (val prev = extremalAngle) {
            null -> angle
            else -> if (movement.direction == PoseDirection.Flex) min(prev, angle) else max(prev, angle)
        }

        val posture = measurePosture(landmarks, width, height, measurement.side)
        posture.trunkLeanDeg?.let { deg ->
            val rounded = (deg * 10.0).roundToInt() / 10.0
            trunkLeanMaxDeg = max(trunkLeanMaxDeg ?: 0.0, rounded)
        }
        posture.elbowDriftDeg?.let { deg ->
            val rounded = (deg * 10.0).roundToInt() / 10.0
            elbowDriftMaxDeg = max(elbowDriftMaxDeg ?: 0.0, rounded)
        }
        posture.shoulderTiltDeg?.let { deg ->
            val rounded = (deg * 10.0).roundToInt() / 10.0
            shoulderTiltMaxDeg = max(shoulderTiltMaxDeg ?: 0.0, rounded)
        }
        currentFormWarning = posture.warning

        advance(AngleSample(angle, timestampMs), measurement.angle)

        val triad = if (measurement.side == Side.Left) movement.leftJoints else movement.rightJoints
        return PoseFrameUpdate(
            angle = angle,
            joints = listOf(landmarks[triad.first], landmarks[triad.second], landmarks[triad.third]),
            torsoJoints = posture.torsoJoints,
            formWarning = posture.warning,
        )
    }

    fun result(): PoseTrackerResult {
        val frames = if (liveCamera && (validReps > 0 || shallowReps > 0)) {
            max(1, attemptedFrames - trailingMissedFrames)
        } else {
            max(1, attemptedFrames)
        }
        val avgCycleSeconds = if (completed.isEmpty()) {
            null
        } else {
            completed.sumOf { max(0L, it.toMs - it.fromMs) }.toDouble() / completed.size / 1000.0
        }
        val tempoSpread = if (completed.size >= 2) {
            val durations = completed.map { max(0L, it.toMs - it.fromMs).toDouble() / 1000.0 }
            (((durations.max() - durations.min()) * 10.0).roundToInt() / 10.0)
        } else {
            null
        }
        return PoseTrackerResult(
            movement = movement,
            targetAngle = targetAngle,
            targetReps = targetReps,
            maxShallow = maxShallow,
            validReps = validReps,
            shallowReps = shallowReps,
            minAngle = extremalAngle,
            confidence = extremalAngle?.let { visibilitySum / frames },
            motionSignature = motionSignature,
            analyzedFrames = analyzedFrames,
            avgCycleSeconds = avgCycleSeconds,
            interruptedCycles = interruptedCycles,
            incompleteCycles = incompleteCycles + if (cycle != null) 1 else 0,
            ready = standingSample != null,
            cycles = completed.toList(),
            biomechanics = PoseBiomechanics(
                trunkLeanMaxDeg = trunkLeanMaxDeg,
                elbowDriftMaxDeg = elbowDriftMaxDeg,
                shoulderTiltMaxDeg = shoulderTiltMaxDeg,
                compensationCycles = compensationCycles,
                tempoSpreadSeconds = tempoSpread,
                currentFormWarning = currentFormWarning,
            ),
        )
    }

    private fun resetSegment() {
        recentAngles.clear()
        phase = Phase.Waiting
        trackedSide = null
        standingSample = null
        currentFormWarning = null
        if (cycle != null) interruptedCycles += 1
        cycle = null
        if (!measuring) {
            attemptedFrames = 0
            analyzedFrames = 0
            visibilitySum = 0.0
        }
    }

    private fun advance(sample: AngleSample, rawAngle: Double) {
        val active = cycle
        if (movement.direction == PoseDirection.Flex) {
            if (sample.angle >= movement.restThreshold && active == null) {
                phase = Phase.Standing
                standingSample = sample
                return
            }
            if (phase == Phase.Waiting) return
            if (active == null) {
                val start = standingSample ?: return
                if (sample.angle <= movement.bendingThreshold) {
                    phase = Phase.Descending
                    cycle = ActiveCycle(start).apply {
                        samples.add(sample)
                        minimum = min(minimum, sample.angle)
                        currentFormWarning?.let { postureCodes.add(it.code) }
                    }
                }
                return
            }
            val duration = sample.timeMs - active.samples.first().timeMs
            if (duration > maxCycleMs) {
                incompleteCycles += 1
                cycle = null
                resetSegment()
                return
            }
            active.samples.add(sample)
            active.minimum = min(active.minimum, sample.angle)
            currentFormWarning?.let { active.postureCodes.add(it.code) }
            if (rawAngle <= movement.peakThreshold) active.bottomFrames += 1
            if (phase == Phase.Descending && sample.angle <= movement.peakThreshold && active.bottomFrames >= 2) {
                phase = Phase.Bottom
            }
            if (phase == Phase.Bottom && sample.angle >= active.minimum + 6.0) phase = Phase.Ascending
            if (phase == Phase.Ascending && sample.angle <= active.minimum + 3.0) phase = Phase.Bottom
            if (sample.angle < movement.restThreshold) return

            if (phase == Phase.Ascending && duration >= minCycleMs) {
                val reachesTarget = active.minimum <= targetAngle + 1e-9
                if (reachesTarget) validReps += 1 else shallowReps += 1
                if (active.postureCodes.isNotEmpty()) compensationCycles += 1
                completed.add(PoseCycleResult(active.samples.first().timeMs, sample.timeMs, active.minimum, reachesTarget, active.postureCodes.toSet()))
                if (completed.size > 40) completed.removeAt(0)
                if (motionSignature == null) motionSignature = sampleSignature(active.samples)
            } else {
                incompleteCycles += 1
            }
            phase = Phase.Standing
            standingSample = sample
            cycle = null
            return
        }

        // Extension movements (ShoulderRaise, SeatedKneeExt)
        if (sample.angle <= movement.restThreshold && active == null) {
            phase = Phase.Standing
            standingSample = sample
            return
        }
        if (phase == Phase.Waiting) return
        if (active == null) {
            val start = standingSample ?: return
            if (sample.angle >= movement.bendingThreshold) {
                phase = Phase.Descending
                cycle = ActiveCycle(start).apply {
                    samples.add(sample)
                    maximum = max(maximum, sample.angle)
                    currentFormWarning?.let { postureCodes.add(it.code) }
                }
            }
            return
        }
        val duration = sample.timeMs - active.samples.first().timeMs
        if (duration > maxCycleMs) {
            incompleteCycles += 1
            cycle = null
            resetSegment()
            return
        }
        active.samples.add(sample)
        active.maximum = max(active.maximum, sample.angle)
        currentFormWarning?.let { active.postureCodes.add(it.code) }
        if (rawAngle >= movement.peakThreshold) active.bottomFrames += 1
        if (phase == Phase.Descending && sample.angle >= movement.peakThreshold && active.bottomFrames >= 2) {
            phase = Phase.Bottom
        }
        if (phase == Phase.Bottom && sample.angle <= active.maximum - 6.0) phase = Phase.Ascending
        if (phase == Phase.Ascending && sample.angle >= active.maximum - 3.0) phase = Phase.Bottom
        if (sample.angle > movement.restThreshold) return

        if (phase == Phase.Ascending && duration >= minCycleMs) {
            val reachesTarget = active.maximum >= targetAngle - 1e-9
            if (reachesTarget) validReps += 1 else shallowReps += 1
            if (active.postureCodes.isNotEmpty()) compensationCycles += 1
            completed.add(PoseCycleResult(active.samples.first().timeMs, sample.timeMs, active.maximum, reachesTarget, active.postureCodes.toSet()))
            if (completed.size > 40) completed.removeAt(0)
            if (motionSignature == null) motionSignature = sampleSignature(active.samples)
        } else {
            incompleteCycles += 1
        }
        phase = Phase.Standing
        standingSample = sample
        cycle = null
    }

    private fun isVisible(point: PoseLandmarkPoint?): Boolean =
        point != null &&
            point.x in 0f..1f &&
            point.y in 0f..1f &&
            point.visibility in minVisibility..1f

    private fun measureTriadAngle(
        start: PoseLandmarkPoint,
        joint: PoseLandmarkPoint,
        end: PoseLandmarkPoint,
        width: Int,
        height: Int,
    ): Double? {
        val scale = max(width, height).toDouble()
        val xScale = width / scale
        val yScale = height / scale
        val sx = (start.x - joint.x) * xScale
        val sy = (start.y - joint.y) * yScale
        val ex = (end.x - joint.x) * xScale
        val ey = (end.y - joint.y) * yScale
        val len1 = hypot(sx, sy)
        val len2 = hypot(ex, ey)
        if (len1 < 1e-6 || len2 < 1e-6) return null
        val cos = ((sx * ex + sy * ey) / (len1 * len2)).coerceIn(-1.0, 1.0)
        return acos(cos) * 180.0 / Math.PI
    }

    private fun measureSide(
        landmarks: List<PoseLandmarkPoint>,
        width: Int,
        height: Int,
        side: Side,
    ): SideMeasurement? {
        val triad = if (side == Side.Left) movement.leftJoints else movement.rightJoints
        val start = landmarks.getOrNull(triad.first)
        val joint = landmarks.getOrNull(triad.second)
        val end = landmarks.getOrNull(triad.third)
        if (!isVisible(start) || !isVisible(joint) || !isVisible(end)) return null
        val angle = measureTriadAngle(start!!, joint!!, end!!, width, height) ?: return null
        val vis = minOf(start.visibility, joint.visibility, end.visibility).toDouble()
        return SideMeasurement(side, angle, vis)
    }

    private fun measureFrame(landmarks: List<PoseLandmarkPoint>, width: Int, height: Int): SideMeasurement? {
        if (width <= 0 || height <= 0) return null
        val left = measureSide(landmarks, width, height, Side.Left)
        val right = measureSide(landmarks, width, height, Side.Right)
        if (left == null || right == null) return left ?: right
        trackedSide?.let { side ->
            val current = if (side == Side.Left) left else right
            val startedSeatedKneeCycle = movement == PoseMovement.SeatedKneeExt && standingSample != null
            val keepVisibleSide = (liveCamera || startedSeatedKneeCycle) && current.visibility >= framingVisibility
            if (keepVisibleSide || abs(left.visibility - right.visibility) < 0.05) {
                return current
            }
        }
        return if (left.visibility >= right.visibility) left else right
    }

    private data class PostureMeasurement(
        val trunkLeanDeg: Double?,
        val elbowDriftDeg: Double?,
        val shoulderTiltDeg: Double?,
        val warning: PoseFormWarning?,
        val torsoJoints: List<PoseLandmarkPoint>?,
    )

    private fun measurePosture(
        landmarks: List<PoseLandmarkPoint>,
        width: Int,
        height: Int,
        side: Side,
    ): PostureMeasurement {
        val scale = max(width, height).toDouble()
        val xScale = width / scale
        val yScale = height / scale
        val shoulder = landmarks.getOrNull(if (side == Side.Left) 11 else 12)
        val hip = landmarks.getOrNull(if (side == Side.Left) 23 else 24)
        val elbow = landmarks.getOrNull(if (side == Side.Left) 13 else 14)

        var trunkLean: Double? = null
        var torsoJoints: List<PoseLandmarkPoint>? = null
        if (isVisible(shoulder) && isVisible(hip)) {
            val dx = (shoulder!!.x - hip!!.x) * xScale
            val dy = (hip.y - shoulder.y) * yScale
            if (hypot(dx, dy) >= 1e-5) {
                trunkLean = atan2(abs(dx), max(1e-5, abs(dy))) * 180.0 / Math.PI
                torsoJoints = listOf(shoulder, hip)
            }
        }

        var elbowDrift: Double? = null
        if (movement == PoseMovement.ElbowBend && isVisible(hip) && isVisible(shoulder) && isVisible(elbow)) {
            elbowDrift = measureTriadAngle(hip!!, shoulder!!, elbow!!, width, height)
        }

        var shoulderTilt: Double? = null
        if (movement == PoseMovement.ShoulderRaise) {
            val lShoulder = landmarks.getOrNull(11)
            val rShoulder = landmarks.getOrNull(12)
            if (isVisible(lShoulder) && isVisible(rShoulder)) {
                val dx = abs(lShoulder!!.x - rShoulder!!.x) * xScale
                val dy = abs(lShoulder.y - rShoulder.y) * yScale
                if (dx >= 1e-5) shoulderTilt = atan2(dy, dx) * 180.0 / Math.PI
            }
        }

        val warning = when {
            movement == PoseMovement.ChairStand && trunkLean != null && trunkLean > 35.0 -> PoseFormWarning.TrunkLean
            movement == PoseMovement.KneeLift && trunkLean != null && trunkLean > 25.0 -> PoseFormWarning.TrunkLean
            movement == PoseMovement.SeatedKneeExt && trunkLean != null && trunkLean > 28.0 -> PoseFormWarning.TrunkLean
            movement == PoseMovement.ElbowBend && elbowDrift != null && elbowDrift > 35.0 -> PoseFormWarning.ElbowDrift
            movement == PoseMovement.ShoulderRaise && shoulderTilt != null && shoulderTilt > 14.0 -> PoseFormWarning.ShoulderAsymmetry
            else -> null
        }

        return PostureMeasurement(trunkLean, elbowDrift, shoulderTilt, warning, torsoJoints)
    }

    private fun sampleSignature(samples: List<AngleSample>): List<Double> {
        val first = samples.first()
        val last = samples.last()
        var next = 1
        return List(20) { idx ->
            val target = first.timeMs + (last.timeMs - first.timeMs) * idx.toDouble() / 19.0
            while (next < samples.lastIndex && samples[next].timeMs < target) next += 1
            val before = samples[next - 1]
            val after = samples[next]
            val span = max(1L, after.timeMs - before.timeMs).toDouble()
            val weight = (target - before.timeMs) / span
            before.angle + (after.angle - before.angle) * weight
        }
    }
}

internal fun analyzePoseDiagnostics(result: PoseTrackerResult): ExerciseDiagnosticsSummary {
    val info = result.movement
    val errorCodes = mutableListOf<String>()
    val patientTips = mutableListOf<String>()
    val doctorNotes = mutableListOf<String>()
    val focusCues = mutableListOf<String>()
    var severity = "ok"
    var needsDoctorReview = false
    var score = 100

    val avgSec = result.avgCycleSeconds?.let { (it * 10.0).roundToInt() / 10.0 }
    val fm = result.biomechanics

    if (result.shallowReps > result.maxShallow || (result.validReps == 0 && result.shallowReps > 0)) {
        errorCodes.add("shallow_range")
        severity = "yellow"
        needsDoctorReview = true
        score -= min(35, result.shallowReps * 12)
        val angleText = result.minAngle?.let { "${it.roundToInt()}°" } ?: "aniqlanmadi"
        focusCues.add(
            if (info.direction == PoseDirection.Extend) {
                "${info.jointLabelUz} burchagini kamida ${result.targetAngle}° gacha yozib/ko‘tarib bajaring"
            } else {
                "${info.jointLabelUz} burchagini ${result.targetAngle}° gacha chuqurroq buking"
            },
        )
        patientTips.add("${result.shallowReps} ta harakatda ${info.jointLabelUz.lowercase()} burchagi maqsadga (${result.targetAngle}°) yetmadi (kuzatilgan burchak $angleText).")
        doctorNotes.add("${result.shallowReps} chala takror (kuzatilgan $angleText, maqsad ${result.targetAngle}°)")
    }

    val trunkLimit = when (info) {
        PoseMovement.ChairStand -> 35.0
        PoseMovement.KneeLift -> 25.0
        PoseMovement.SeatedKneeExt -> 28.0
        else -> 90.0
    }
    if (fm.trunkLeanMaxDeg != null && fm.trunkLeanMaxDeg > trunkLimit) {
        errorCodes.add("trunk_lean")
        severity = "yellow"
        needsDoctorReview = true
        score -= 18
        val deg = fm.trunkLeanMaxDeg.roundToInt()
        focusCues.add("Gavdani tik tutib, belni oldinga yoki orqaga og‘dirmang")
        patientTips.add("Harakat paytida gavda $deg° ga og‘di. Belni tik tutib, tayanchga suyangan holda bajaring.")
        doctorNotes.add("gavda og‘ishi $deg°")
    }

    if (info == PoseMovement.ElbowBend && fm.elbowDriftMaxDeg != null && fm.elbowDriftMaxDeg > 35.0) {
        errorCodes.add("elbow_drift")
        severity = "yellow"
        needsDoctorReview = true
        score -= 16
        val deg = fm.elbowDriftMaxDeg.roundToInt()
        focusCues.add("Yuqori qo‘l va tirsakni tanangiz yonida mahkam tuting")
        patientTips.add("Tirsak tanadan $deg° ga uzoqlashdi. Yelka va tirsakni qimirlatmasdan faqat bilakni buking.")
        doctorNotes.add("tirsak siljishi $deg°")
    }

    if (info == PoseMovement.ShoulderRaise && fm.shoulderTiltMaxDeg != null && fm.shoulderTiltMaxDeg > 14.0) {
        errorCodes.add("shoulder_asymmetry")
        severity = "yellow"
        needsDoctorReview = true
        score -= 16
        val deg = fm.shoulderTiltMaxDeg.roundToInt()
        focusCues.add("Ikkala yelkani bir tekisda tutib, yelkani qismang")
        patientTips.add("Yelka chizig‘ida $deg° og‘ish kuzatildi — bo‘yinni bo‘sh qo‘yib, gavdani bir tekisda tuting.")
        doctorNotes.add("yelka assimetriyasi $deg°")
    }

    if (avgSec != null && avgSec < 1.2) {
        errorCodes.add("too_fast")
        score -= 12
        focusCues.add("Har takrorni 2–3 soniyada ohista bajaring")
        patientTips.add("Harakat juda tez bajarildi (o‘rtacha $avgSec s/sikl). Bo‘g‘imga zarba tushmasligi uchun ohista bajaring.")
        doctorNotes.add("tez sur’at ($avgSec s/sikl)")
    } else if (avgSec != null && avgSec > 6.5) {
        errorCodes.add("too_slow")
        score -= 8
        focusCues.add("Charchoq sezilsa, qisqa dam olib davom eting")
        patientTips.add("Harakat juda sekin kechdi (o‘rtacha $avgSec s/sikl).")
        doctorNotes.add("sekin sur’at ($avgSec s/sikl)")
    }

    if (fm.tempoSpreadSeconds != null && fm.tempoSpreadSeconds > 2.5) {
        errorCodes.add("tempo_irregular")
        score -= 8
        focusCues.add("Barcha takrorlarni bir xil maromda bajaring")
        patientTips.add("Takrorlar orasidagi tezlik farqi katta (${fm.tempoSpreadSeconds} s).")
        doctorNotes.add("notekis marom (±${fm.tempoSpreadSeconds} s)")
    }

    val interrupted = result.interruptedCycles + result.incompleteCycles
    if (interrupted > 0) {
        errorCodes.add("interrupted_tracking")
        score -= min(15, interrupted * 5)
        focusCues.add("Kameraga yon tomondan to‘liq ko‘rinishda turing")
        patientTips.add("$interrupted ta harakat kadr uzilishi sababli tugallanmadi.")
        doctorNotes.add("$interrupted uzilgan harakat")
    }

    if (result.validReps < result.targetReps) {
        errorCodes.add("below_target_reps")
        val ratio = max(0, result.targetReps - result.validReps).toDouble() / max(1, result.targetReps)
        score -= (ratio * 20.0).roundToInt()
        patientTips.add("Rejadagi ${result.targetReps} takrordan ${result.validReps} tasi to‘liq bajarildi.")
        doctorNotes.add("${result.validReps}/${result.targetReps} to‘liq takror")
    }

    val formScore = score.coerceIn(15, 100)
    if (patientTips.isEmpty()) {
        val angleNote = result.minAngle?.let {
            " (${if (info.direction == PoseDirection.Extend) "eng katta" else "eng chuqur"} burchak ${it.roundToInt()}°)"
        }.orEmpty()
        return ExerciseDiagnosticsSummary(
            errorCodes = errorCodes,
            severity = "ok",
            needsDoctorReview = false,
            formScore = formScore,
            focusCueUz = "Shu bir xil marom va to‘g‘ri qomatni saqlang.",
            patientCoachingUz = "${info.shortTitleUz}: ${result.validReps} ta to‘liq harakat me’yorda bajarildi$angleNote. Texnika bahosi $formScore/100.",
            doctorSummaryUz = "${info.shortTitleUz}: ${result.validReps} to‘liq, ${result.shallowReps} chala$angleNote, texnika $formScore/100.",
        )
    }

    return ExerciseDiagnosticsSummary(
        errorCodes = errorCodes,
        severity = severity,
        needsDoctorReview = needsDoctorReview,
        formScore = formScore,
        focusCueUz = focusCues.firstOrNull() ?: "Harakatni ohista va to‘g‘ri qomat bilan bajaring.",
        patientCoachingUz = patientTips.joinToString(" "),
        doctorSummaryUz = "${info.shortTitleUz}: ${doctorNotes.joinToString("; ")} (texnika $formScore/100).",
    )
}
