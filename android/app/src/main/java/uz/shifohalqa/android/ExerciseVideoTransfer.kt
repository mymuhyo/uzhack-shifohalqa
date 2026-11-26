package uz.shifohalqa.android

import android.content.Context
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

internal data class ShareableExerciseVideo(val file: File, val durationSec: Int, val mime: String) {
    fun requestBody(attemptId: String, action: String): JSONObject =
        JSONObject().put("action", action).put("attemptId", attemptId).put("consent", true)
            .put("durationSec", durationSec).put("sizeBytes", file.length()).put("mimeType", mime)
}

internal data class VideoUploadTicket(val url: String, val path: String)
internal class VideoNotShareable : Exception()

// Copy only after consent. Hash the exact bytes that will be sent, and delete the copy after the transfer.
internal suspend fun <T> withShareableVideo(
    context: Context, result: ExerciseVideoResult, block: suspend (ShareableExerciseVideo) -> T,
): T = withContext(Dispatchers.IO) {
    if (result.isPublic || result.durationMs !in 1..60_000) throw VideoNotShareable()
    val resolver = context.contentResolver
    val mime = resolver.getType(result.clip.uri)?.substringBefore(';')?.trim()?.lowercase().orEmpty()
    if (mime !in setOf("video/mp4", "video/webm")) throw VideoNotShareable()
    val file = File.createTempFile("mashq-yuklash-", ".tmp", context.cacheDir)
    val digest = MessageDigest.getInstance("SHA-256")
    try {
        val stream = resolver.openInputStream(result.clip.uri) ?: throw VideoNotShareable()
        stream.use { input ->
            file.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                var size = 0L
                while (true) {
                    ensureActive()
                    val length = input.read(buffer)
                    if (length < 0) break
                    size += length
                    if (size > MAX_SHARED_VIDEO_BYTES) throw VideoNotShareable()
                    digest.update(buffer, 0, length)
                    output.write(buffer, 0, length)
                }
            }
        }
        val hash = digest.digest().joinToString("") { "%02x".format(it) }
        if (!canShareVideo(result.durationMs, file.length(), mime) || hash != result.sha256) throw VideoNotShareable()
        block(ShareableExerciseVideo(file, ((result.durationMs + 999) / 1_000).toInt(), mime))
    } finally {
        file.delete()
    }
}

internal suspend fun putExerciseVideo(
    ticket: VideoUploadTicket, video: ShareableExerciseVideo, onProgress: (Int) -> Unit,
) = withContext(Dispatchers.IO) {
    val url = runCatching { URI(ticket.url) }.getOrNull()
    if (url == null || url.scheme != "https" || url.host.isNullOrBlank() || url.rawUserInfo != null || url.rawFragment != null) {
        throw MobileFailure(MobileFailureKind.Service)
    }
    val connection = url.toURL().openConnection() as HttpURLConnection
    coroutineScope {
        val interrupter = launch(start = CoroutineStart.UNDISPATCHED) {
            try { awaitCancellation() } finally { connection.disconnect() }
        }
        try {
            connection.requestMethod = "PUT"
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.connectTimeout = 8_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", video.mime)
            val total = video.file.length()
            connection.setFixedLengthStreamingMode(total)
            video.file.inputStream().use { input ->
                connection.outputStream.use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var sent = 0L
                    var previous = -1
                    while (true) {
                        ensureActive()
                        val length = input.read(buffer)
                        if (length < 0) break
                        output.write(buffer, 0, length)
                        sent += length
                        val progress = (sent * 100 / total).toInt()
                        if (progress != previous) {
                            previous = progress
                            withContext(Dispatchers.Main.immediate) { onProgress(progress) }
                        }
                    }
                }
            }
            if (connection.responseCode !in 200..299) throw MobileFailure(MobileFailureKind.Service)
        } catch (_: IOException) {
            currentCoroutineContext().ensureActive()
            throw MobileFailure(MobileFailureKind.Offline)
        } finally {
            interrupter.cancel()
            connection.disconnect()
        }
    }
}
