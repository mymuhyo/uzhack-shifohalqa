package uz.shifohalqa.android

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URISyntaxException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

private const val MAX_RESPONSE_BYTES = 524_288
internal const val LOCAL_DEMO_ORIGIN = "http://127.0.0.1:3000"

internal data class MobileStepSummary(
    val count: Int,
    val goal: Int,
    val achieved: Boolean,
    val source: String?,
    val updatedAt: String?,
)

internal data class MobileStepSyncResult(
    val status: String,
    val count: Int,
    val goal: Int,
    val achieved: Boolean,
    val source: String,
)

internal data class MobileDay(
    val patientName: String,
    val date: String,
    val tasks: List<MobileTask>,
    val replies: List<MobileReply>,
    val steps: MobileStepSummary? = null,
)

internal data class MobileTask(
    val id: String,
    val title: String,
    val time: String,
    val record: MobileRecord?,
    val boxAvailable: Boolean = false,
    val boxDone: Boolean = false,
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
    data object Saved : DorimosOutcome
    data object AlreadySaved : DorimosOutcome
    data object Expired : DorimosOutcome
    data object Rejected : DorimosOutcome
}

internal data class MobileRecord(val id: String, val reason: MissedReason?, val reply: MobileReview?)
internal data class MobileReview(val body: String, val needsRetake: Boolean, val reviewedAt: String)
internal data class MobileReply(val recordId: String, val taskTitle: String, val date: String, val review: MobileReview)
internal data class MobileCredentials(val token: String, val expiresAt: Instant, val workspaceId: String)

internal enum class MobileFailureKind {
    InvalidAddress, InvalidCode, Expired, Offline, NotFound, Rejected, Service,
}

internal class MobileFailure(val kind: MobileFailureKind) : Exception()

internal class MobileApi private constructor(private val origin: URI) {
    val address: String get() = origin.toASCIIString()
    suspend fun pair(code: String): MobileCredentials = request("pair", body = JSONObject().put("code", code)) {
        val token = getString("token").takeIf { it.matches(Regex("[0-9a-f]{64}")) }
            ?: throw MobileFailure(MobileFailureKind.Service)
        val expiresAt = try {
            Instant.parse(getString("expiresAt"))
        } catch (_: DateTimeParseException) {
            throw MobileFailure(MobileFailureKind.Service)
        }
        val workspaceId = getString("workspaceId")
        if (!workspaceId.matches(Regex("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))) {
            throw MobileFailure(MobileFailureKind.Service)
        }
        MobileCredentials(token, expiresAt, workspaceId)
    }

    suspend fun today(token: String): MobileDay = request("today", token = token) {
        MobileDay(
            patientName = getString("patientName"),
            date = getString("date"),
            tasks = getJSONArray("tasks").objects { task ->
                MobileTask(
                    id = task.getString("id"),
                    title = task.getString("title"),
                    time = task.getString("time"),
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
            },
            replies = getJSONArray("replies").objects {
                MobileReply(it.getString("recordId"), it.getString("taskTitle"), it.getString("date"), it.review())
            },
            steps = optJSONObject("steps")?.let { s ->
                MobileStepSummary(
                    count = s.getInt("count"),
                    goal = s.getInt("goal"),
                    achieved = s.getBoolean("achieved"),
                    source = s.optString("source").takeIf { it.isNotEmpty() && it != "null" },
                    updatedAt = s.optString("updatedAt").takeIf { it.isNotEmpty() && it != "null" },
                )
            },
        )
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
                    HttpURLConnection.HTTP_NOT_FOUND -> throw MobileFailure(MobileFailureKind.NotFound)
                    HttpURLConnection.HTTP_BAD_REQUEST -> throw MobileFailure(MobileFailureKind.Rejected)
                    else -> throw MobileFailure(MobileFailureKind.Service)
                }
                val response = connection.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
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
    ): T = withContext(Dispatchers.IO) {
        val connection = origin.resolve("/api/mobile/v1/$endpoint").toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 7_000
            connection.readTimeout = when (endpoint) {
                "exercise/sample-ai" -> 30_000
                "exercise-coach" -> 20_000
                else -> 10_000
            }
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
                422 -> if (endpoint == "dorimos") Unit else throw MobileFailure(MobileFailureKind.Rejected)
                HttpURLConnection.HTTP_UNAUTHORIZED -> throw MobileFailure(
                    if (endpoint == "pair") MobileFailureKind.InvalidCode else MobileFailureKind.Expired,
                )
                HttpURLConnection.HTTP_NOT_FOUND -> throw MobileFailure(MobileFailureKind.NotFound)
                HttpURLConnection.HTTP_BAD_REQUEST, HttpURLConnection.HTTP_CONFLICT ->
                    throw MobileFailure(MobileFailureKind.Rejected)
                else -> throw MobileFailure(MobileFailureKind.Service)
            }
            val response = connection.inputStream.use { stream ->
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
            JSONObject(response).decode()
        } catch (_: IOException) {
            throw MobileFailure(MobileFailureKind.Offline)
        } catch (_: JSONException) {
            throw MobileFailure(MobileFailureKind.Service)
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        fun forAddress(value: String): MobileApi {
            val origin = try {
                URI(value.trim())
            } catch (_: URISyntaxException) {
                throw MobileFailure(MobileFailureKind.InvalidAddress)
            }
            val validOrigin = !origin.host.isNullOrBlank() && origin.port in -1..65535 && origin.port != 0 &&
                origin.rawUserInfo == null && origin.rawQuery == null && origin.rawFragment == null &&
                (origin.rawPath.isNullOrEmpty() || origin.rawPath == "/")
            val debugLoopback = BuildConfig.DEBUG && origin.scheme == "http" && origin.host == "127.0.0.1"
            if (!validOrigin || (origin.scheme?.lowercase() != "https" && !debugLoopback)) {
                throw MobileFailure(MobileFailureKind.InvalidAddress)
            }
            val scheme = origin.scheme.lowercase()
            val port = if (scheme == "https" && origin.port == 443) -1 else origin.port
            return MobileApi(URI(scheme, null, origin.host.lowercase(), port, null, null, null))
        }
    }
}

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
    "saved" -> DorimosOutcome.Saved
    "already_saved" -> DorimosOutcome.AlreadySaved
    "expired" -> DorimosOutcome.Expired
    else -> DorimosOutcome.Rejected
}

private inline fun <T> JSONArray.objects(decode: (JSONObject) -> T): List<T> =
    List(length()) { decode(getJSONObject(it)) }
