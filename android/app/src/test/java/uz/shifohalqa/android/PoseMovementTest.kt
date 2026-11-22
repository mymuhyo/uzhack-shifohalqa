package uz.shifohalqa.android

import kotlin.math.cos
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Test

class PoseMovementTest {
    @Test fun eachMovementCountsOneCycleFromItsOwnJointTriad() {
        for (movement in PoseMovement.entries) {
            val tracker = PoseTracker(movement, liveCamera = false)
            val (rest, middle, peak) = when (movement) {
                PoseMovement.ShoulderRaise -> Triple(25, 70, 105)
                PoseMovement.SeatedKneeExt -> Triple(100, 135, 168)
                else -> Triple(174, 140, 75)
            }
            val sequence = List(6) { rest } + listOf(middle, middle) + List(7) { peak } +
                listOf(middle, middle) + List(7) { rest }
            val (a, b, c) = movement.leftJoints
            for ((index, angle) in sequence.withIndex()) {
                val rad = Math.toRadians(angle.toDouble())
                val points = MutableList(33) { PoseLandmarkPoint(0f, 0f, 0f) }
                points[a] = PoseLandmarkPoint(.5f, .3f, .96f)
                points[b] = PoseLandmarkPoint(.5f, .5f, .96f)
                points[c] = PoseLandmarkPoint((.5 + .2 * sin(rad)).toFloat(), (.5 - .2 * cos(rad)).toFloat(), .96f)
                tracker.update(points, 640, 640, index * 60L)
            }
            assertEquals(movement.apiKey, 1, tracker.result().validReps)
        }
    }
}
