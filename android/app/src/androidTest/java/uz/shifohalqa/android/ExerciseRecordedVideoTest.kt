package uz.shifohalqa.android

import android.content.ContentValues
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class ExerciseRecordedVideoTest {
    @Test
    @SdkSuppress(minSdkVersion = 29)
    fun heavyCountsTwoCyclesFromASelectedVideoWithoutAProvider() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val resolver = context.contentResolver
        val content = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, "shifo-test-${UUID.randomUUID()}.webm")
            put(MediaStore.Video.Media.MIME_TYPE, "video/webm")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/")
        }
        val uri = requireNotNull(resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, content))
        try {
            requireNotNull(resolver.openOutputStream(uri)).use { output ->
                context.assets.open("pose-cdc-sample.webm").use { it.copyTo(output) }
            }
            val started = System.nanoTime()
            val result = analyzeExerciseVideo(context, ExerciseClip.fromPicker(uri), 100)
            println("Heavy recorded clip: ${(System.nanoTime() - started) / 1_000_000} ms, ${result.measurement}")
            assertTrue("Heavy clip gives a usable measurement", result.measurement.savable)
            assertEquals(2, result.measurement.validReps)
            assertEquals(0, result.measurement.shallowReps)
            assertEquals(2, result.cycles.size)
            assertEquals("04caa87ae78f78607d0628a3837001b027a964952597ca99925dad681b5ef65c", result.sha256)
            assertFalse(result.isPublic)
        } finally {
            resolver.delete(uri, null, null)
        }
    }
}
