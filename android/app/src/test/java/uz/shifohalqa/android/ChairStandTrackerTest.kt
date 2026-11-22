package uz.shifohalqa.android

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChairStandTrackerTest {
    @Test fun liveCountsMatchBrowserTraces() {
        val fixture = File(requireNotNull(System.getProperty("shifo.chairStandFixtures")))
        val cases = fixture.readLines().drop(1)
        assertEquals(5, cases.size)
        cases.forEach { row ->
            val fields = row.split('\t')
            val (name, step, gapAt, gap, visibility) = fields
            val valid = fields[5].toInt()
            val shallow = fields[6].toInt()
            val tracker = ChairStandTracker(100)
            fields[7].split(" ").forEachIndexed { index, angle ->
                val time = step.toLong() * index + if (gapAt.toInt() >= 0 && index >= gapAt.toInt()) gap.toLong() else 0L
                tracker.update(time, angle.toDouble(), visibility.toDouble(), 0)
            }
            val result = tracker.result()
            assertEquals(name, valid, result.validReps)
            assertEquals(name, shallow, result.shallowReps)
            if (valid + shallow > 0) {
                assertTrue(name, result.savable)
                assertEquals(name, 20, result.motionSignature?.size)
            } else {
                assertFalse(name, result.savable)
            }
        }
    }
}
