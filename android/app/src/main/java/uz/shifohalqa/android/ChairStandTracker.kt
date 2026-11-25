package uz.shifohalqa.android

internal data class ExerciseMeasurement(
    val validReps: Int,
    val shallowReps: Int,
    val minAngle: Double?,
    val confidence: Double?,
    val analyzedFrames: Int,
    val motionSignature: List<Double>?,
    val pose: PoseTrackerResult? = null,
) {
    val savable get() = validReps + shallowReps > 0 && analyzedFrames in 5..20_000 &&
        minAngle != null && confidence != null && confidence >= .75
}

internal data class ExerciseCycle(
    val fromMs: Long, val toMs: Long, val peakAngle: Double? = null, val reachesTarget: Boolean = true,
    val postureCodes: Set<String> = emptySet(),
)

internal class ChairStandTracker(private val targetAngle: Int, private val live: Boolean = true) {
    private data class Sample(val time: Long, val angle: Double)
    private class Cycle(first: Sample, second: Sample) {
        val samples = mutableListOf(first, second)
        var minimum = second.angle
        var bottomFrames = 0
        var reachedBottom = false
        var rising = false
    }

    private val recent = ArrayDeque<Sample>()
    private var cycle: Cycle? = null
    private var standing: Sample? = null
    private var side: Int? = null
    private var lastTime: Long? = null
    private var measuring = !live
    private var attempted = 0
    private var trailingMisses = 0
    private var analyzed = 0
    private var visibilitySum = 0.0
    private var minimum: Double? = null
    private var valid = 0
    private var shallow = 0
    private var signature: List<Double>? = null
    private val cycles = mutableListOf<ExerciseCycle>()
    fun completedCycles(): List<ExerciseCycle> = cycles.toList()
    var angle: Double? = null
        private set
    val ready get() = standing != null

    fun update(time: Long, measuredAngle: Double?, visibility: Double, measuredSide: Int?) {
        lastTime?.let {
            if (time <= it) return
            if (time - it > if (live) 400 else 750) resetSegment()
        }
        lastTime = time
        if (measuredAngle == null || visibility < if (measuring) .4 else .75) {
            attempted++
            trailingMisses++
            resetSegment()
            return
        }
        if (side != null && side != measuredSide) resetSegment()
        side = measuredSide
        attempted++
        trailingMisses = 0
        analyzed++
        visibilitySum += visibility
        if (recent.size == 5) recent.removeFirst()
        recent.addLast(Sample(time, measuredAngle))
        if (recent.size < 5) return

        measuring = true
        val smoothed = recent.filter { !live || time - it.time <= 400 }.map(Sample::angle).average()
        angle = smoothed
        minimum = minOf(minimum ?: smoothed, smoothed)
        advance(Sample(time, smoothed), measuredAngle)
    }

    private fun resetSegment() {
        recent.clear()
        standing = null
        side = null
        cycle = null
        angle = null
        if (!measuring) {
            attempted = 0
            analyzed = 0
            visibilitySum = 0.0
        }
    }

    private fun advance(sample: Sample, raw: Double) {
        val active = cycle
        if (active == null) {
            if (sample.angle >= 160) standing = sample
            else if (sample.angle <= 150) standing?.let { cycle = Cycle(it, sample) }
            return
        }

        val duration = sample.time - active.samples.first().time
        if (duration > 15_000) {
            resetSegment()
            return
        }
        active.samples += sample
        active.minimum = minOf(active.minimum, sample.angle)
        if (raw <= 140) active.bottomFrames++
        if (sample.angle <= 140 && active.bottomFrames >= 2) active.reachedBottom = true
        if (active.reachedBottom) {
            if (sample.angle >= active.minimum + 6) active.rising = true
            else if (sample.angle <= active.minimum + 3) active.rising = false
        }
        if (sample.angle < 160) return
        if (active.rising && duration >= 350) {
            val reachesTarget = active.minimum <= targetAngle + 1e-9
            if (reachesTarget) valid++ else shallow++
            if (signature == null) signature = makeSignature(active.samples, duration)
            if (!live) cycles += ExerciseCycle(active.samples.first().time, sample.time, active.minimum, reachesTarget)
        }
        standing = sample
        cycle = null
    }

    private fun makeSignature(samples: List<Sample>, duration: Long): List<Double> {
        val first = samples.first()
        var next = 1
        return List(20) { index ->
            val target = first.time + duration * index / 19.0
            while (next < samples.lastIndex && samples[next].time < target) next++
            val before = samples[next - 1]
            val after = samples[next]
            val ratio = (target - before.time) / (after.time - before.time)
            before.angle + ratio * (after.angle - before.angle)
        }
    }

    fun result(): ExerciseMeasurement {
        val frames = if (live && valid + shallow > 0) attempted - trailingMisses else attempted
        return ExerciseMeasurement(valid, shallow, minimum, if (minimum != null && frames > 0) visibilitySum / frames else null,
            analyzed, signature)
    }
}
