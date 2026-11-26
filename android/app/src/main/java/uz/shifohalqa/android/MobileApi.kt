package uz.shifohalqa.android

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest
import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

private const val MAX_RESPONSE_BYTES = 1_048_576
internal const val LOCAL_DEMO_ORIGIN = "http://127.0.0.1:3000"
internal const val EMULATOR_DEMO_ORIGIN = "http://10.0.2.2:3000"

internal data class MobileStepReading(
    val count: Int,
    val source: String,
    val updatedAt: String?,
)

internal data class MobileStepsBySource(
    val deviceSensor: MobileStepReading? = null,
    val selfReport: MobileStepReading? = null,
    val demoSim: MobileStepReading? = null,
)

internal data class MobileStepTrendPoint(
    val date: String,
    val effectiveCount: Int?,
    val effectiveSource: String?,
    val deviceSensor: MobileStepReading?,
    val selfReport: MobileStepReading?,
    val demoSim: MobileStepReading?,
)

internal data class MobileStepSummary(
    val count: Int,
    val goal: Int,
    val achieved: Boolean,
    val source: String?,
    val updatedAt: String?,
    val bySource: MobileStepsBySource = MobileStepsBySource(),
    val trend: List<MobileStepTrendPoint> = emptyList(),
)

internal data class MobileStepSyncResult(
    val status: String,
    val count: Int,
    val goal: Int,
    val achieved: Boolean,
    val source: String,
)

internal data class MedicationScheduleSummary(
    val name: String,
    val strength: Double?,
    val strengthUnit: String,
    val times: List<String>,
)

internal data class MedicationAdherenceCounts(
    val scheduled: Int,
    val taken: Int,
    val missed: Int,
    val unanswered: Int,
)

internal data class MedicationAdherenceSummary(
    val medicationName: String,
    val strength: Double?,
    val strengthUnit: String,
    val times: List<String>,
    val today: MedicationAdherenceCounts,
    val week: MedicationAdherenceCounts,
)

internal data class MobileVitalsRecord(
    val id: String,
    val systolic: Int?,
    val diastolic: Int?,
    val chestPain: Boolean,
    val level: Int,
    val reply: MobileReview?,
)

internal data class MobileVitalsTask(
    val id: String,
    val title: String,
    val time: String,
    val status: String,
    val record: MobileVitalsRecord?,
)

internal data class MobileBpHistoryPoint(
    val id: String,
    val date: String,
    val systolic: Int?,
    val diastolic: Int?,
    val chestPain: Boolean,
    val level: Int,
    val reviewed: Boolean,
)

internal data class MobileDay(
    val patientName: String,
    val date: String,
    val isDemo: Boolean = true,
    val tasks: List<MobileTask>,
    val replies: List<MobileReply>,
    val steps: MobileStepSummary? = null,
    val medications: List<MedicationScheduleSummary> = emptyList(),
    val medicationAdherence: List<MedicationAdherenceSummary> = emptyList(),
    val bpTargets: BpTargets? = null,
    val vitalsTask: MobileVitalsTask? = null,
    val bpHistory: List<MobileBpHistoryPoint> = emptyList(),
    val rawJson: String? = null,
)

internal data class MobileTask(
    val id: String,
    val planItemId: String? = null,
    val title: String,
    val time: String,
    val strength: Double? = null,
    val strengthUnit: String = "mg",
    val record: MobileRecord?,
    val boxAvailable: Boolean = false,
    val boxDone: Boolean = false,
)

internal data class PatientClinicalBrief(
    val id: String,
    val briefDate: String,
    val approvedReplyUz: String,
    val approvedAt: String,
    val rawJson: String? = null,
)

internal data class KeyframeReviewReport(
    val sourceMode: String,
    val provider: String,
    val model: String,
    val cycleNumber: Int,
    val timeRangeLabel: String,
    val visibility: String,
    val summaryUz: String,
    val observationUz: String,
    val uncertaintyNoteUz: String,
    val possibleCausesUz: List<String>,
    val persisted: Boolean,
)

internal data class SignedVideoUploadSpec(
    val attemptId: String,
    val path: String,
    val signedUrl: String,
    val mimeType: String,
)

internal data class FinalizedVideoUpload(
    val attemptId: String,
    val path: String,
    val uploadedAt: String,
    val expiresAt: String,
    val durationSec: Int,
)

internal sealed interface DorimosOutcome {
    data class NeedsConfirmation(
        val drugName: String,
        val strengthLabel: String,
        val model: String,
        val decisionModel: String,
        val confidence: Double,
        val token: String,
    ) : DorimosOutcome
    data object Retake : DorimosOutcome
    data object ManualFallback : DorimosOutcome
    data object Deferred : DorimosOutcome
    data object Saved : DorimosOutcome
    data object AlreadySaved : DorimosOutcome
    data object Expired : DorimosOutcome
    data object Rejected : DorimosOutcome
}

internal data class MobileRecord(val id: String, val reason: MissedReason?, val reply: MobileReview?)
internal data class MobileReview(val body: String, val needsRetake: Boolean, val reviewedAt: String)
internal data class MobileReply(val recordId: String, val taskTitle: String, val date: String, val review: MobileReview)
internal data class MobileCredentials(
    val token: String,
    val expiresAt: Instant,
    val workspaceId: String,
    val isDemo: Boolean = true,
    val patientName: String? = null,
)

internal enum class MobileFailureKind {
    InvalidAddress,
    InvalidCode,
    InvalidCredentials,
    ForbiddenRole,
    Expired,
    Offline,
    NotFound,
    Rejected,
    QuotaExceeded,
    AlreadyUploaded,
    VideoExpired,
    Service,
}

internal class MobileFailure(val kind: MobileFailureKind) : Exception()

internal class MobileApi private constructor(private val origin: URI) {
    val address: String get() = origin.toASCIIString()

    fun resolveOriginUrl(relativePath: String): String =
        origin.resolve(relativePath).toASCIIString()

    suspend fun pair(code: String): MobileCredentials = request("pair", body = JSONObject().put("code", code)) {
        val token = getString("token").takeIf { it.matches(Regex("[0-9a-f]{64}")) }
            ?: throw MobileFailure(MobileFailureKind.Service)
        val expiresAt = parseInstantOrService(getString("expiresAt"))
        val workspaceId = parseUuidOrService(getString("workspaceId"))
        MobileCredentials(token, expiresAt, workspaceId, isDemo = true)
    }

    suspend fun login(email: String, password: String): MobileCredentials =
        request(
            endpoint = "login",
            body = JSONObject().put("email", email.trim()).put("password", password),
        ) {
            val token = getString("token").trim().takeIf { it.isNotEmpty() }
                ?: throw MobileFailure(MobileFailureKind.Service)
            val expiresAt = parseInstantOrService(getString("expiresAt"))
            val workspaceId = parseUuidOrService(getString("workspaceId"))
            val patientName = optString("patientName").takeIf { it.isNotBlank() && it != "null" }
            MobileCredentials(
                token = token,
                expiresAt = expiresAt,
                workspaceId = workspaceId,
                isDemo = optBoolean("isDemo", false),
                patientName = patientName,
            )
        }

    suspend fun today(token: String): MobileDay = request("today", token = token) {
        parseMobileDay(this)
    }

    suspend fun clinicalBrief(token: String): PatientClinicalBrief? =
        requestPath("/api/clinical/brief", token = token, timeoutMs = 10_000) {
            parsePatientClinicalBrief(this)
        }

    suspend fun saveSteps(token: String, count: Int, source: String): MobileStepSyncResult =
        request("steps", token, JSONObject().put("count", count).put("source", source)) {
            MobileStepSyncResult(
                status = getString("status"),
                count = getInt("count"),
                goal = getInt("goal"),
                achieved = getBoolean("achieved"),
                source = getString("source"),
            )
        }

    suspend fun record(token: String, taskId: String, reason: MissedReason?) {
        val payload = JSONObject()
            .put("taskId", taskId)
            .put("medicationStatus", if (reason == null) "taken" else "missed")
        if (reason != null) payload.put("reason", reason.apiValue)
        request("evidence", token, payload) {
            when (getString("result")) {
                "saved", "already_saved" -> Unit
                else -> throw MobileFailure(MobileFailureKind.Service)
            }
        }
    }

    suspend fun recordVitals(
        token: String,
        taskId: String,
        systolic: Int?,
        diastolic: Int?,
        chestPain: Boolean,
    ) {
        val payload = JSONObject()
            .put("taskId", taskId)
            .put("systolic", systolic ?: JSONObject.NULL)
            .put("diastolic", diastolic ?: JSONObject.NULL)
            .put("chestPain", chestPain)
        request("evidence", token, payload) {
            when (getString("result")) {
                "saved", "already_saved" -> Unit
                else -> throw MobileFailure(MobileFailureKind.Service)
            }
        }
    }

    suspend fun exercise(token: String): ExerciseView = request("exercise", token) {
        ExerciseView.parse(this)
    }

    suspend fun sendExercise(token: String, payload: JSONObject) = request("exercise", token, payload) {
        if (getString("status") != "saved") throw MobileFailure(MobileFailureKind.Service)
        getString("id")
    }

    suspend fun publicExerciseCoach(token: String): PublicExerciseAdvice =
        request("exercise-coach", token, JSONObject().put("sample", PoseMovement.ChairStand.apiKey)) {
            PublicExerciseAdvice(getString("source"), getString("patientAdviceUz"), getString("focusCueUz"), optString("model"))
        }

    suspend fun requestExerciseCoach(token: String, payload: JSONObject): PublicExerciseAdvice =
        request("exercise-coach", token, payload) {
            PublicExerciseAdvice(getString("source"), getString("patientAdviceUz"), getString("focusCueUz"), optString("model"))
        }

    suspend fun reviewExerciseKeyframes(token: String, payload: JSONObject): KeyframeReviewReport =
        requestPath("/api/clinical/exercise/keyframe-review", token = token, body = payload, timeoutMs = 20_000) {
            parseKeyframeReviewReport(this)
        }

    suspend fun requestVideoUpload(
        token: String,
        attemptId: String,
        durationSec: Int,
        sizeBytes: Long,
        mimeType: String,
    ): SignedVideoUploadSpec = request(
        endpoint = "exercise/video-upload",
        token = token,
        body = JSONObject()
            .put("action", "request")
            .put("attemptId", attemptId)
            .put("consent", true)
            .put("durationSec", durationSec)
            .put("sizeBytes", sizeBytes)
            .put("mimeType", mimeType),
    ) {
        SignedVideoUploadSpec(
            attemptId = getString("attemptId"),
            path = getString("path"),
            signedUrl = getString("signedUrl"),
            mimeType = getString("mimeType"),
        )
    }

    suspend fun finalizeVideoUpload(
        token: String,
        attemptId: String,
        durationSec: Int,
        sizeBytes: Long,
        mimeType: String,
        path: String,
    ): FinalizedVideoUpload = request(
        endpoint = "exercise/video-upload",
        token = token,
        body = JSONObject()
            .put("action", "finalize")
            .put("attemptId", attemptId)
            .put("consent", true)
            .put("durationSec", durationSec)
            .put("sizeBytes", sizeBytes)
            .put("mimeType", mimeType)
            .put("path", path),
    ) {
        FinalizedVideoUpload(
            attemptId = getString("attemptId"),
            path = getString("path"),
            uploadedAt = getString("uploadedAt"),
            expiresAt = getString("expiresAt"),
            durationSec = getInt("durationSec"),
        )
    }

    suspend fun uploadVideoToSignedUrl(
        signedUrl: String,
        mimeType: String,
        sizeBytes: Long,
        openStream: () -> InputStream,
        onProgress: (Int) -> Unit,
    ) = withContext(Dispatchers.IO) {
        val urlUri = try {
            URI(signedUrl)
        } catch (_: URISyntaxException) {
            throw MobileFailure(MobileFailureKind.Service)
        }
        val scheme = urlUri.scheme?.lowercase(Locale.US)
        val debugLoopback = BuildConfig.DEBUG && scheme == "http" &&
            (urlUri.host == "127.0.0.1" || urlUri.host == "10.0.2.2")
        if (scheme != "https" && !debugLoopback) {
            throw MobileFailure(MobileFailureKind.Service)
        }
        val connection = urlUri.toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "PUT"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10_000
            connection.readTimeout = 60_000
            connection.useCaches = false
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", mimeType)
            connection.setRequestProperty("x-upsert", "false")
            connection.setFixedLengthStreamingMode(sizeBytes)
            openStream().use { input ->
                connection.outputStream.use { output ->
                    val buffer = ByteArray(16 * 1024)
                    var sent = 0L
                    var lastPct = -1
                    while (true) {
                        coroutineContext.ensureActive()
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        sent += read
                        val pct = ((sent * 100L) / sizeBytes.coerceAtLeast(1L)).toInt().coerceIn(0, 100)
                        if (pct != lastPct) {
                            lastPct = pct
                            withContext(Dispatchers.Main.immediate) { onProgress(pct) }
                        }
                    }
                    output.flush()
                }
            }
            when (connection.responseCode) {
                in 200..299 -> Unit
                409 -> throw MobileFailure(MobileFailureKind.AlreadyUploaded)
                413, 400 -> throw MobileFailure(MobileFailureKind.Rejected)
                else -> throw MobileFailure(MobileFailureKind.Service)
            }
        } catch (failure: MobileFailure) {
            throw failure
        } catch (_: IOException) {
            throw MobileFailure(MobileFailureKind.Offline)
        } finally {
            connection.disconnect()
        }
    }

    suspend fun downloadVerifiedSample(
        relativePath: String,
        destFile: File,
        expectedSha256: String,
        onProgress: (Int) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val url = origin.resolve(relativePath).toURL()
        val connection = url.openConnection() as HttpURLConnection
        val tempFile = File(destFile.parentFile, "${destFile.name}.tmp")
        try {
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10_000
            connection.readTimeout = 30_000
            connection.useCaches = false
            if (connection.responseCode !in 200..299) {
                throw MobileFailure(MobileFailureKind.Service)
            }
            val total = connection.contentLengthLong
            destFile.parentFile?.mkdirs()
            val digest = MessageDigest.getInstance("SHA-256")
            connection.inputStream.use { input ->
                FileOutputStream(tempFile).use { output ->
                    val buf = ByteArray(16 * 1024)
                    var loaded = 0L
                    var lastPct = -1
                    while (true) {
                        coroutineContext.ensureActive()
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        digest.update(buf, 0, n)
                        loaded += n
                        if (total > 0) {
                            val pct = ((loaded * 100L) / total).toInt().coerceIn(0, 100)
                            if (pct != lastPct) {
                                lastPct = pct
                                withContext(Dispatchers.Main.immediate) { onProgress(pct) }
                            }
                        }
                    }
                    output.flush()
                }
            }
            val actualSha = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actualSha.equals(expectedSha256, ignoreCase = true)) {
                tempFile.delete()
                throw MobileFailure(MobileFailureKind.Service)
            }
            if (destFile.exists()) destFile.delete()
            if (!tempFile.renameTo(destFile)) {
                tempFile.copyTo(destFile, overwrite = true)
                tempFile.delete()
            }
            destFile
        } catch (failure: MobileFailure) {
            tempFile.delete()
            throw failure
        } catch (_: IOException) {
            tempFile.delete()
            throw MobileFailure(MobileFailureKind.Offline)
        } finally {
            connection.disconnect()
        }
    }

    suspend fun dorimosScanSample(token: String, taskId: String, sampleId: String): DorimosOutcome =
        request("dorimos", token, JSONObject().put("action", "scan").put("taskId", taskId).put("sampleId", sampleId)) {
            decodeDorimosOutcome()
        }

    suspend fun dorimosConfirm(token: String, taskId: String, confirmToken: String): DorimosOutcome =
        request("dorimos", token, JSONObject().put("action", "confirm").put("taskId", taskId).put("token", confirmToken)) {
            decodeDorimosOutcome()
        }

    suspend fun dorimosManual(token: String, taskId: String): DorimosOutcome =
        request("dorimos", token, JSONObject().put("action", "manual").put("taskId", taskId)) {
            decodeDorimosOutcome()
        }

    suspend fun dorimosDefer(token: String, taskId: String): DorimosOutcome =
        request("dorimos", token, JSONObject().put("action", "defer").put("taskId", taskId)) {
            decodeDorimosOutcome()
        }

    suspend fun dorimosScanPhoto(token: String, taskId: String, jpegBytes: ByteArray): DorimosOutcome =
        withContext(Dispatchers.IO) {
            val boundary = "----ShifoDorimos${System.nanoTime()}"
            val connection = origin.resolve("/api/mobile/v1/dorimos").toURL().openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "POST"
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 7_000
                connection.readTimeout = 25_000
                connection.useCaches = false
                connection.doOutput = true
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("Cache-Control", "no-store")
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")

                val header1 = "--$boundary\r\nContent-Disposition: form-data; name=\"taskId\"\r\n\r\n$taskId\r\n"
                    .toByteArray(Charsets.UTF_8)
                val header2 = "--$boundary\r\nContent-Disposition: form-data; name=\"image\"; filename=\"box.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"
                    .toByteArray(Charsets.UTF_8)
                val footer = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)
                val totalLength = header1.size + header2.size + jpegBytes.size + footer.size
                connection.setFixedLengthStreamingMode(totalLength)
                connection.outputStream.use { out ->
                    out.write(header1)
                    out.write(header2)
                    out.write(jpegBytes)
                    out.write(footer)
                }

                when (connection.responseCode) {
                    in 200..299, 422 -> Unit
                    HttpURLConnection.HTTP_UNAUTHORIZED -> throw MobileFailure(MobileFailureKind.Expired)
                    HttpURLConnection.HTTP_FORBIDDEN -> throw MobileFailure(MobileFailureKind.ForbiddenRole)
                    HttpURLConnection.HTTP_NOT_FOUND -> throw MobileFailure(MobileFailureKind.NotFound)
                    HttpURLConnection.HTTP_BAD_REQUEST -> throw MobileFailure(MobileFailureKind.Rejected)
                    429 -> throw MobileFailure(MobileFailureKind.QuotaExceeded)
                    else -> throw MobileFailure(MobileFailureKind.Service)
                }
                val response = readBoundedBody(connection)
                JSONObject(response).decodeDorimosOutcome()
            } catch (failure: MobileFailure) {
                throw failure
            } catch (_: IOException) {
                throw MobileFailure(MobileFailureKind.Offline)
            } catch (_: JSONException) {
                throw MobileFailure(MobileFailureKind.Service)
            } finally {
                connection.disconnect()
            }
        }

    suspend fun sampleAi(token: String, provider: SampleAiProvider, comparison: String): SampleAiReport {
        val payload = JSONObject().put("provider", provider.value)
        if (provider == SampleAiProvider.Baidu) payload.put("comparison", comparison)
        return request("exercise/sample-ai", token, payload) {
            when (getString("status")) {
                "observed" -> {
                    val observation = getJSONObject("observation")
                    val seated = observation.getJSONArray("seatedAtSeconds")
                    SampleAiReport.Observation(getString("model"), observation.getString("view"),
                        List(seated.length()) { seated.getDouble(it) }, usesSampleFrames = optString("input") == "frames")
                }
                "explained" -> SampleAiReport.Explanation(getString("model"), getString("summary"))
                else -> throw MobileFailure(MobileFailureKind.Service)
            }
        }
    }

    private suspend fun <T> request(
        endpoint: String,
        token: String? = null,
        body: JSONObject? = null,
        decode: JSONObject.() -> T,
    ): T {
        val timeout = when (endpoint) {
            "exercise/sample-ai" -> 30_000
            "exercise-coach" -> 20_000
            else -> 12_000
        }
        return requestPath("/api/mobile/v1/$endpoint", token, body, timeout, endpoint, decode)
    }

    private suspend fun <T> requestPath(
        path: String,
        token: String? = null,
        body: JSONObject? = null,
        timeoutMs: Int = 12_000,
        endpointTag: String = path,
        decode: JSONObject.() -> T,
    ): T = withContext(Dispatchers.IO) {
        val connection = origin.resolve(path).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 7_000
            connection.readTimeout = timeoutMs
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                val bytes = body.toString().toByteArray(Charsets.UTF_8)
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            when (connection.responseCode) {
                in 200..299 -> Unit
                422 -> if (endpointTag == "dorimos") Unit else throw MobileFailure(MobileFailureKind.Rejected)
                HttpURLConnection.HTTP_UNAUTHORIZED -> throw MobileFailure(
                    when (endpointTag) {
                        "pair" -> MobileFailureKind.InvalidCode
                        "login" -> MobileFailureKind.InvalidCredentials
                        else -> MobileFailureKind.Expired
                    },
                )
                HttpURLConnection.HTTP_FORBIDDEN -> throw MobileFailure(MobileFailureKind.ForbiddenRole)
                HttpURLConnection.HTTP_NOT_FOUND -> throw MobileFailure(MobileFailureKind.NotFound)
                HttpURLConnection.HTTP_CONFLICT -> {
                    val err = runCatching { JSONObject(readErrorBody(connection)).optString("error") }.getOrNull()
                    if (err == "already_uploaded") throw MobileFailure(MobileFailureKind.AlreadyUploaded)
                    throw MobileFailure(MobileFailureKind.Rejected)
                }
                HttpURLConnection.HTTP_BAD_REQUEST -> throw MobileFailure(MobileFailureKind.Rejected)
                410 -> throw MobileFailure(MobileFailureKind.VideoExpired)
                429 -> throw MobileFailure(MobileFailureKind.QuotaExceeded)
                else -> throw MobileFailure(MobileFailureKind.Service)
            }
            val response = readBoundedBody(connection)
            JSONObject(response).decode()
        } catch (failure: MobileFailure) {
            throw failure
        } catch (_: IOException) {
            throw MobileFailure(MobileFailureKind.Offline)
        } catch (_: JSONException) {
            throw MobileFailure(MobileFailureKind.Service)
        } finally {
            connection.disconnect()
        }
    }

    private fun readBoundedBody(connection: HttpURLConnection): String =
        connection.inputStream.use { stream ->
            val bytes = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val length = stream.read(buffer)
                if (length == -1) break
                if (bytes.size() + length > MAX_RESPONSE_BYTES) throw MobileFailure(MobileFailureKind.Service)
                bytes.write(buffer, 0, length)
            }
            bytes.toString(Charsets.UTF_8.name())
        }

    private fun readErrorBody(connection: HttpURLConnection): String =
        connection.errorStream?.use { stream ->
            stream.readBytes().toString(Charsets.UTF_8)
        }.orEmpty()

    companion object {
        fun forAddress(value: String): MobileApi {
            val origin = try {
                URI(value.trim())
            } catch (_: URISyntaxException) {
                throw MobileFailure(MobileFailureKind.InvalidAddress)
            }
            val host = origin.host?.lowercase(Locale.US)
            val scheme = origin.scheme?.lowercase(Locale.US)
            val validOrigin = !host.isNullOrBlank() && origin.port in -1..65535 && origin.port != 0 &&
                origin.rawUserInfo == null && origin.rawQuery == null && origin.rawFragment == null &&
                (origin.rawPath.isNullOrEmpty() || origin.rawPath == "/")
            val debugLoopback = BuildConfig.DEBUG && scheme == "http" && (host == "127.0.0.1" || host == "10.0.2.2")
            if (!validOrigin || (scheme != "https" && !debugLoopback)) {
                throw MobileFailure(MobileFailureKind.InvalidAddress)
            }
            val port = if (scheme == "https" && origin.port == 443) -1 else origin.port
            return MobileApi(URI(scheme, null, host, port, null, null, null))
        }
    }
}

private fun parseInstantOrService(raw: String): Instant = try {
    Instant.parse(raw)
} catch (_: DateTimeParseException) {
    throw MobileFailure(MobileFailureKind.Service)
}

private fun parseUuidOrService(raw: String): String {
    if (!raw.matches(Regex("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))) {
        throw MobileFailure(MobileFailureKind.Service)
    }
    return raw.lowercase(Locale.US)
}

internal fun parseMobileDay(json: JSONObject): MobileDay = with(json) {
    val tasks = getJSONArray("tasks").objects { task ->
        MobileTask(
            id = task.getString("id"),
            planItemId = task.optString("planItemId").takeIf { it.isNotBlank() && it != "null" },
            title = task.getString("title"),
            time = task.getString("time"),
            strength = if (task.has("strength") && !task.isNull("strength")) task.getDouble("strength") else null,
            strengthUnit = task.optString("strengthUnit", "mg").takeIf { it.isNotBlank() && it != "null" } ?: "mg",
            record = task.optJSONObject("record")?.let { record ->
                val reason = when (record.getString("status")) {
                    "taken" -> null
                    "missed" -> MissedReason.entries.find { it.apiValue == record.getString("reason") }
                        ?: throw MobileFailure(MobileFailureKind.Service)
                    else -> throw MobileFailure(MobileFailureKind.Service)
                }
                MobileRecord(record.getString("id"), reason, record.optJSONObject("reply")?.review())
            },
            boxAvailable = task.optBoolean("boxAvailable", false),
            boxDone = task.optBoolean("boxDone", false),
        )
    }

    val replies = getJSONArray("replies").objects {
        MobileReply(it.getString("recordId"), it.getString("taskTitle"), it.getString("date"), it.review())
    }

    val steps = optJSONObject("steps")?.let { s ->
        val bySourceObj = s.optJSONObject("bySource")
        val bySource = if (bySourceObj != null) {
            MobileStepsBySource(
                deviceSensor = bySourceObj.optJSONObject("deviceSensor")?.toStepReading(),
                selfReport = bySourceObj.optJSONObject("selfReport")?.toStepReading(),
                demoSim = bySourceObj.optJSONObject("demoSim")?.toStepReading(),
            )
        } else {
            MobileStepsBySource()
        }
        val trend = s.optJSONArray("trend")?.objects { point ->
            MobileStepTrendPoint(
                date = point.getString("date"),
                effectiveCount = if (point.has("effectiveCount") && !point.isNull("effectiveCount")) point.getInt("effectiveCount") else null,
                effectiveSource = point.optString("effectiveSource").takeIf { it.isNotBlank() && it != "null" },
                deviceSensor = point.optJSONObject("deviceSensor")?.toStepReading(),
                selfReport = point.optJSONObject("selfReport")?.toStepReading(),
                demoSim = point.optJSONObject("demoSim")?.toStepReading(),
            )
        } ?: emptyList()
        MobileStepSummary(
            count = s.getInt("count"),
            goal = s.getInt("goal"),
            achieved = s.getBoolean("achieved"),
            source = s.optString("source").takeIf { it.isNotEmpty() && it != "null" },
            updatedAt = s.optString("updatedAt").takeIf { it.isNotEmpty() && it != "null" },
            bySource = bySource,
            trend = trend,
        )
    }

    val medications = optJSONArray("medications")?.objects { med ->
        val timesArr = med.optJSONArray("times")
        val times = if (timesArr != null) List(timesArr.length()) { timesArr.getString(it) } else emptyList()
        MedicationScheduleSummary(
            name = med.getString("name"),
            strength = if (med.has("strength") && !med.isNull("strength")) med.getDouble("strength") else null,
            strengthUnit = med.optString("strengthUnit", "mg"),
            times = times,
        )
    } ?: emptyList()

    val adherence = optJSONArray("medicationAdherence")?.objects { item ->
        val timesArr = item.optJSONArray("times")
        val times = if (timesArr != null) List(timesArr.length()) { timesArr.getString(it) } else emptyList()
        MedicationAdherenceSummary(
            medicationName = item.getString("medicationName"),
            strength = if (item.has("strength") && !item.isNull("strength")) item.getDouble("strength") else null,
            strengthUnit = item.optString("strengthUnit", "mg"),
            times = times,
            today = item.getJSONObject("today").toAdherenceCounts(),
            week = item.getJSONObject("week").toAdherenceCounts(),
        )
    } ?: emptyList()

    val bpTargets = optJSONObject("bpTargets")?.let { t ->
        BpTargets(
            maxSystolic = t.getInt("maxSystolic"),
            maxDiastolic = t.getInt("maxDiastolic"),
            warnSystolic = t.getInt("warnSystolic"),
            warnDiastolic = t.getInt("warnDiastolic"),
            minSystolic = if (t.has("minSystolic") && !t.isNull("minSystolic")) t.getInt("minSystolic") else null,
            minDiastolic = if (t.has("minDiastolic") && !t.isNull("minDiastolic")) t.getInt("minDiastolic") else null,
        )
    }

    val vitalsTask = optJSONObject("vitalsTask")?.let { vt ->
        val rec = vt.optJSONObject("record")?.let { r ->
            MobileVitalsRecord(
                id = r.getString("id"),
                systolic = if (r.has("systolic") && !r.isNull("systolic")) r.getInt("systolic") else null,
                diastolic = if (r.has("diastolic") && !r.isNull("diastolic")) r.getInt("diastolic") else null,
                chestPain = r.optBoolean("chestPain", false),
                level = r.optInt("level", 0),
                reply = r.optJSONObject("reply")?.review(),
            )
        }
        MobileVitalsTask(
            id = vt.getString("id"),
            title = vt.getString("title"),
            time = vt.getString("time"),
            status = vt.optString("status", "pending"),
            record = rec,
        )
    }

    val bpHistory = optJSONArray("bpHistory")?.objects { bp ->
        MobileBpHistoryPoint(
            id = bp.getString("id"),
            date = bp.getString("date"),
            systolic = if (bp.has("systolic") && !bp.isNull("systolic")) bp.getInt("systolic") else null,
            diastolic = if (bp.has("diastolic") && !bp.isNull("diastolic")) bp.getInt("diastolic") else null,
            chestPain = bp.optBoolean("chestPain", false),
            level = bp.optInt("level", 0),
            reviewed = bp.optBoolean("reviewed", false),
        )
    } ?: emptyList()

    MobileDay(
        patientName = getString("patientName"),
        date = getString("date"),
        isDemo = optBoolean("isDemo", true),
        tasks = tasks,
        replies = replies,
        steps = steps,
        medications = medications,
        medicationAdherence = adherence,
        bpTargets = bpTargets,
        vitalsTask = vitalsTask,
        bpHistory = bpHistory,
        rawJson = toString(),
    )
}

internal fun parsePatientClinicalBrief(json: JSONObject): PatientClinicalBrief? {
    val brief = json.optJSONObject("brief") ?: return null
    val reply = brief.optString("approvedReplyUz").takeIf { it.isNotBlank() && it != "null" } ?: return null
    return PatientClinicalBrief(
        id = brief.getString("id"),
        briefDate = brief.getString("briefDate"),
        approvedReplyUz = reply,
        approvedAt = brief.getString("approvedAt"),
        rawJson = json.toString(),
    )
}

internal fun parseKeyframeReviewReport(json: JSONObject): KeyframeReviewReport {
    val causes = json.optJSONArray("possibleCausesUz")
    return KeyframeReviewReport(
        sourceMode = json.getString("sourceMode"),
        provider = json.getString("provider"),
        model = json.getString("model"),
        cycleNumber = json.getInt("cycleNumber"),
        timeRangeLabel = json.getString("timeRangeLabel"),
        visibility = json.getString("visibility"),
        summaryUz = json.getString("summaryUz"),
        observationUz = json.getString("observationUz"),
        uncertaintyNoteUz = json.getString("uncertaintyNoteUz"),
        possibleCausesUz = if (causes != null) List(causes.length()) { causes.getString(it) } else emptyList(),
        persisted = json.optBoolean("persisted", false),
    )
}

private fun JSONObject.toStepReading(): MobileStepReading = MobileStepReading(
    count = getInt("count"),
    source = getString("source"),
    updatedAt = optString("updatedAt").takeIf { it.isNotBlank() && it != "null" },
)

private fun JSONObject.toAdherenceCounts(): MedicationAdherenceCounts = MedicationAdherenceCounts(
    scheduled = getInt("scheduled"),
    taken = getInt("taken"),
    missed = getInt("missed"),
    unanswered = getInt("unanswered"),
)

private fun JSONObject.review() = MobileReview(
    body = getString("body"),
    needsRetake = when (getString("decision")) {
        "approved" -> false
        "retake" -> true
        else -> throw MobileFailure(MobileFailureKind.Service)
    },
    reviewedAt = getString("reviewedAt"),
)

private fun JSONObject.decodeDorimosOutcome(): DorimosOutcome = when (getString("status")) {
    "needs_confirmation" -> {
        val reading = getJSONObject("reading")
        val label = reading.getJSONObject("label")
        val unitLabel = when (val u = label.getString("unit")) {
            "mcg" -> "mkg"
            "iu" -> "IU"
            else -> u
        }
        val strengthNum = label.getDouble("strength")
        val strengthText = if (strengthNum % 1.0 == 0.0) strengthNum.toInt().toString() else strengthNum.toString()
        DorimosOutcome.NeedsConfirmation(
            drugName = label.getString("drugName"),
            strengthLabel = "$strengthText $unitLabel",
            model = reading.getString("model"),
            decisionModel = reading.getString("decisionModel"),
            confidence = reading.getDouble("confidence"),
            token = getString("token"),
        )
    }
    "retake" -> DorimosOutcome.Retake
    "manual" -> DorimosOutcome.ManualFallback
    "deferred" -> DorimosOutcome.Deferred
    "saved" -> DorimosOutcome.Saved
    "already_saved" -> DorimosOutcome.AlreadySaved
    "expired" -> DorimosOutcome.Expired
    else -> DorimosOutcome.Rejected
}

private inline fun <T> JSONArray.objects(decode: (JSONObject) -> T): List<T> =
    List(length()) { decode(getJSONObject(it)) }
