package uz.shifohalqa.android

import org.junit.Assert.assertEquals
import org.junit.Test

class SampleAiComparisonTest {
    private val cycles = listOf(ExerciseCycle(1200, 4200), ExerciseCycle(5300, 8500))

    @Test fun comparesPublicObservationToMeasuredCycleIntervals() {
        fun observation(vararg times: Double) = SampleAiReport.Observation("fixture", "side_visible", times.toList())
        assertEquals("pose_only", compareSampleObservations(cycles, null))
        assertEquals("match", compareSampleObservations(cycles, observation(2.0, 6.0)))
        assertEquals("time_differs", compareSampleObservations(cycles, observation(2.0, 3.0)))
        assertEquals("count_differs", compareSampleObservations(cycles, observation(2.0)))
        assertEquals("video_unclear", compareSampleObservations(cycles,
            SampleAiReport.Observation("fixture", "unclear", emptyList())))
    }
}
