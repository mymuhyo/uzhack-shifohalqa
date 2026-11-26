package uz.shifohalqa.android

import org.junit.Assert.*
import org.junit.Test

class ExerciseMediaTest {
    @Test fun extractsFourTimestampsInsideEachFlaggedCycle() {
        assertEquals(listOf(1_100L, 1_400L, 1_700L, 2_000L), keyframeTimestamps(1_100, 2_000))
        assertTrue(keyframeTimestamps(100, 101).isEmpty())
    }

    @Test fun distinguishesShallowMotionFromNormalCycles() {
        val cycles = listOf(
            ExerciseCycle(100, 2_100, 88.0, true),
            ExerciseCycle(2_200, 4_200, 108.0, false),
            ExerciseCycle(4_300, 4_950, 92.0, true),
            ExerciseCycle(5_000, 12_000, 88.0, true, setOf("trunk_lean")),
        )
        assertEquals(listOf(1, 2, 3), flaggedCycles(cycles).map { it.index })
        assertEquals(listOf("shallow_range"), flaggedCycles(cycles)[0].codes)
        assertEquals(listOf("too_fast"), flaggedCycles(cycles)[1].codes)
        assertEquals(listOf("trunk_lean", "too_slow"), flaggedCycles(cycles)[2].codes)
    }

    @Test fun exactVideoSharingLimitsAreInclusive() {
        assertTrue(canShareVideo(60_000, 20L * 1024 * 1024, "video/mp4"))
        assertTrue(canShareVideo(1, 1, "video/webm"))
        assertFalse(canShareVideo(60_001, 20, "video/webm"))
        assertFalse(canShareVideo(10_000, 20L * 1024 * 1024 + 1, "video/mp4"))
        assertFalse(canShareVideo(10_000, 100, "video/quicktime"))
        assertFalse(canShareVideo(10_000, 0, "video/mp4"))
    }
}
