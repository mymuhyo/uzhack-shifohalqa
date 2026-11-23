package uz.shifohalqa.android

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import java.util.Optional
import org.junit.Assert.assertEquals
import org.junit.Test

class CameraLandmarkRotationTest {
    @Test fun mapsInputLandmarksToTheUprightCameraFrame() {
        val point = NormalizedLandmark.create(0.2f, 0.7f, -0.1f, Optional.of(.9f), Optional.of(.8f))
        val expected = mapOf(0 to (0.2f to 0.7f), 90 to (0.3f to 0.2f),
            180 to (0.8f to 0.3f), 270 to (0.7f to 0.8f))
        expected.forEach { (rotation, position) ->
            val actual = rotateCameraLandmarks(listOf(point), rotation).single()
            assertEquals("x at $rotation", position.first, actual.x(), 0.0001f)
            assertEquals("y at $rotation", position.second, actual.y(), 0.0001f)
            assertEquals(point.z(), actual.z(), 0f)
            assertEquals(point.visibility(), actual.visibility())
            assertEquals(point.presence(), actual.presence())
        }
    }
}
