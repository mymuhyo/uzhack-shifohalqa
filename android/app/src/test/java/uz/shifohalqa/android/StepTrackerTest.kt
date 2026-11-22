package uz.shifohalqa.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StepTrackerTest {
    @Test
    fun sensorCounterUsesFirstReadingAsDailyBaselineAndHandlesReboot() {
        var day = "2026-11-22"
        val tracker = StepDayAccumulator(todayProvider = { day })

        val first = tracker.onSensorCounter(10_000f)
        assertEquals(0, first.count)
        assertFalse(first.needsSync)

        val walked = tracker.onSensorCounter(10_450f)
        assertEquals(450, walked.count)
        assertEquals("device_sensor", walked.source)
        assertTrue(walked.needsSync)

        tracker.markSynced(day, 450, "device_sensor")
        assertFalse(tracker.snapshot().needsSync)

        // Device reboot resets counter below baseline
        val afterReboot = tracker.onSensorCounter(120f)
        assertEquals(450, afterReboot.count)
        val moreWalking = tracker.onSensorCounter(220f)
        assertEquals(550, moreWalking.count)
        assertTrue(moreWalking.needsSync)
    }

    @Test
    fun simulationAddsStepsAndRollsOverOnNewDate() {
        var day = "2026-11-22"
        val tracker = StepDayAccumulator(todayProvider = { day })

        val sim = tracker.addSimulated(500)
        assertEquals(500, sim.count)
        assertEquals("demo_sim", sim.source)
        assertTrue(sim.needsSync)

        tracker.mergeServerSteps(day, 1200, "self_report")
        assertEquals(1200, tracker.snapshot().count)

        day = "2026-11-23"
        val nextDay = tracker.snapshot()
        assertEquals(0, nextDay.count)
        assertFalse(nextDay.needsSync)
    }
}
