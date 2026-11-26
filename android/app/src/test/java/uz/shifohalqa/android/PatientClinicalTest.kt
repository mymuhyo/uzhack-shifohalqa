package uz.shifohalqa.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PatientClinicalTest {
    @Test fun manualPressureRequiresBothValuesInRangeAndSystolicAboveDiastolic() {
        assertTrue(validPressure(120, 80))
        assertFalse(validPressure(89, 90))
        assertFalse(validPressure(261, 85))
        assertFalse(validPressure(100, null))
        assertFalse(validPressure(95, 29))
    }

    @Test fun bloodPressureZonesFollowConfiguredThresholdsAndNeverAssumeTargets() {
        val targets = BpTargets(140, 90, 160, 100, 90, 60)
        assertEquals(BpZone.High, targets.zone(140, 80))
        assertEquals(BpZone.High, targets.zone(85, 100))
        assertEquals(BpZone.Low, targets.zone(89, 79))
        assertEquals(BpZone.InRange, targets.zone(90, 60))
        assertNull(targets.zone(null, null))
    }
}
