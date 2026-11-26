package uz.shifohalqa.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class MobileApiParsingTest {
    @Test
    fun enforcesHttpsOutsideDebugLoopback() {
        val httpsApi = MobileApi.forAddress("https://shifohalqa.vercel.app")
        assertEquals("https://shifohalqa.vercel.app", httpsApi.address)

        try {
            MobileApi.forAddress("http://shifohalqa.vercel.app")
            fail("Expected plain HTTP remote host to be rejected")
        } catch (expected: MobileFailure) {
            assertEquals(MobileFailureKind.InvalidAddress, expected.kind)
        }

        if (BuildConfig.DEBUG) {
            assertEquals("http://127.0.0.1:3000", MobileApi.forAddress("http://127.0.0.1:3000").address)
            assertEquals("http://10.0.2.2:3000", MobileApi.forAddress("http://10.0.2.2:3000").address)
        }
    }

    @Test
    fun selectsFlaggedCyclesFromPoseResultAndDiagnostics() {
        val pose = PoseTrackerResult(
            movement = PoseMovement.SeatedKneeExt,
            targetAngle = 155,
            targetReps = 1,
            maxShallow = 0,
            validReps = 1,
            shallowReps = 1,
            minAngle = 160.0,
            confidence = 0.92,
            motionSignature = List(20) { 130.0 },
            analyzedFrames = 45,
            avgCycleSeconds = 2.4,
            interruptedCycles = 0,
            incompleteCycles = 0,
            ready = true,
            cycles = listOf(
                PoseCycleResult(fromMs = 1000L, toMs = 3200L, minAngle = 160.0, reachesTarget = true),
                PoseCycleResult(fromMs = 3600L, toMs = 5900L, minAngle = 138.0, reachesTarget = false),
            ),
            biomechanics = PoseBiomechanics(null, null, null, 0, 0.1, null),
        )
        val diag = analyzePoseDiagnostics(pose)
        val flagged = selectFlaggedCycles(pose, diag)
        assertEquals(1, flagged.size)
        assertEquals(1, flagged[0].cycleIndex)
        assertEquals(3600L, flagged[0].fromMs)
        assertEquals(5900L, flagged[0].toMs)
        assertTrue("shallow_range" in flagged[0].errorCodes)
    }

    @Test
    fun sampleCatalogContainsThreeGrandFinalMovementsWithSha256() {
        assertEquals(
            listOf(PoseMovement.ChairStand, PoseMovement.ElbowBend, PoseMovement.SeatedKneeExt),
            SampleVideoCatalog.GrandFinalMovements,
        )
        SampleVideoCatalog.GrandFinalMovements.forEach { movement ->
            val spec = SampleVideoCatalog.specFor(movement)
            assertTrue(spec.sha256.matches(Regex("[0-9a-f]{64}")))
            assertTrue(spec.serverPath.startsWith("/demo/"))
        }
        assertNotNull(SampleVideoCatalog.ChairStand.bundledAssetName)
        assertFalse(SampleVideoCatalog.ElbowBend.bundledAssetName != null)
        assertFalse(SampleVideoCatalog.SeatedKneeExt.bundledAssetName != null)
    }
}
