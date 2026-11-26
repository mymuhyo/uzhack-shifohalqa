package uz.shifohalqa.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ClinicalRulesTest {
    private val targets = BpTargets(
        maxSystolic = 140,
        maxDiastolic = 90,
        warnSystolic = 130,
        warnDiastolic = 85,
        minSystolic = 90,
        minDiastolic = 60,
    )

    @Test
    fun evaluatesChestPainAndHighLowWatchNormalBpZones() {
        val pain = evaluateBpZone(115, 75, chestPain = true, targets = targets)
        assertEquals(BpZoneTone.Urgent, pain?.tone)
        assertEquals("chest_pain", pain?.ruleKey)

        val high = evaluateBpZone(140, 82, chestPain = false, targets = targets)
        assertEquals(BpZoneTone.Urgent, high?.tone)
        assertEquals("bp_max", high?.ruleKey)

        val low = evaluateBpZone(88, 65, chestPain = false, targets = targets)
        assertEquals(BpZoneTone.Urgent, low?.tone)
        assertEquals("bp_low", low?.ruleKey)

        val lowDia = evaluateBpZone(95, 58, chestPain = false, targets = targets)
        assertEquals(BpZoneTone.Urgent, lowDia?.tone)
        assertEquals("bp_low", lowDia?.ruleKey)

        val watch = evaluateBpZone(132, 82, chestPain = false, targets = targets)
        assertEquals(BpZoneTone.Warn, watch?.tone)
        assertEquals("bp_warning", watch?.ruleKey)

        val normal = evaluateBpZone(118, 76, chestPain = false, targets = targets)
        assertEquals(BpZoneTone.Ok, normal?.tone)
        assertEquals("ok", normal?.ruleKey)
        assertFalse(normal?.invalid ?: true)
    }

    @Test
    fun rejectsPhysiologicallyInvalidReadings() {
        val inverted = evaluateBpZone(85, 95, chestPain = false, targets = targets)
        assertNotNull(inverted)
        assertTrue(inverted!!.invalid)

        val equal = evaluateBpZone(100, 100, chestPain = false, targets = targets)
        assertTrue(equal!!.invalid)

        val tooLowSys = evaluateBpZone(49, 35, chestPain = false, targets = targets)
        assertTrue(tooLowSys!!.invalid)

        val tooHighSys = evaluateBpZone(261, 90, chestPain = false, targets = targets)
        assertTrue(tooHighSys!!.invalid)

        val tooLowDia = evaluateBpZone(100, 29, chestPain = false, targets = targets)
        assertTrue(tooLowDia!!.invalid)

        val tooHighDia = evaluateBpZone(180, 161, chestPain = false, targets = targets)
        assertTrue(tooHighDia!!.invalid)
    }

    @Test
    fun formatsStrengthUnitsInUzbek() {
        assertEquals("5 mg", formatStrength(5.0, "mg"))
        assertEquals("50 mkg", formatStrength(50.0, "mcg"))
        assertEquals("2.5 mg", formatStrength(2.5, "mg"))
        assertEquals("1000 IU", formatStrength(1000.0, "iu"))
        assertEquals("", formatStrength(null, "mg"))
    }

    @Test
    fun validatesVideoUploadBoundsAndMimeTypes() {
        assertNull(validateVideoUploadSpec(45, 10L * 1024L * 1024L, "video/mp4"))
        assertNull(validateVideoUploadSpec(60, 20L * 1024L * 1024L, "video/webm; codecs=vp9"))
        assertNotNull(validateVideoUploadSpec(0, 1024L, "video/mp4"))
        assertNotNull(validateVideoUploadSpec(61, 1024L, "video/mp4"))
        assertNotNull(validateVideoUploadSpec(20, 20L * 1024L * 1024L + 1L, "video/mp4"))
        assertNotNull(validateVideoUploadSpec(20, 1024L, "video/quicktime"))
    }
}
