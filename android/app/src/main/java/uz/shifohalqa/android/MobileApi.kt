package uz.shifohalqa.android

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URISyntaxException
import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
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
    val deviceSensor: Int? = null,
    val selfReport: Int? = null,
    val demoSim: Int? = null,
    val trend: List<StepPoint> = emptyList(),
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
    val vitals: MobileVitals? = null,
    val bpTargets: BpTargets? = null,
    val adherence: List<MobileAdherence> = emptyList(),
)

internal data class MobileTask(
    val id: String,
    val title: String,
    val time: String,
    val record: MobileRecord?,
    val boxAvailable: Boolean = false,
    val boxDone: Boolean = false,
    val strength: String? = null,
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
internal data class MobileCredentials(
    val token: String, val expiresAt: Instant, val workspaceId: String,
    val isDemo: Boolean = true, val patientName: String? = null,
) {
    val accountId: String? get() {
        if (isDemo) return null
        val body = Base64.getUrlDecoder().decode(token.split('.')[1])
        return java.util.UUID.fromString(JSONObject(body.toString(Charsets.UTF_8)).getString("sub")).toString()
    }
}

internal enum class MobileFailureKind {
    InvalidAddress, InvalidCode, InvalidCredentials, Forbidden, Expired, Offline, NotFound, Rejected, Quota, AlreadyUploaded, Service,
}

internal class MobileFailure(val kind: MobileFailureKind) : Exception()

internal class MobileApi private constructor(private val origin: URI, private val workspaceId: String? = null) {
    val address: String get() = origin.toASCIIString()
    fun forWorkspace(id: String) = MobileApi(origin, id)

    suspend fun pair(code: String): MobileCredentials = request("pair", body = JSONObject().put("code", code)) {
        credentials(isDemo = true)
    }

    suspend fun login(email: String, password: String): MobileCredentials =
        request("login", body = JSONObject().put("email", email).put("password", password)) {
            if (!has("isDemo") || getBoolean("isDemo")) throw MobileFailure(MobileFailureKind.Service)
            credentials(isDemo = false)
        }

    private fun JSONObject.credentials(isDemo: Boolean): MobileCredentials {
        val token = getString("token")
        val format = if (isDemo) "[0-9a-f]{64}" else "[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+"
        if (!token.matches(Regex(format))) throw MobileFailure(MobileFailureKind.Service)
        val expiry = try { Instant.parse(getString("expiresAt")) }
        catch (_: DateTimeParseException) { throw MobileFailure(MobileFailureKind.Service) }
        val workspace = getString("workspaceId")
        if (!workspace.matches(Regex("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))) {
            throw MobileFailure(MobileFailureKind.Service)
        }
        val value = MobileCredentials(token, expiry, workspace, isDemo, optString("patientName").takeIf { it.isNotBlank() })
        try { value.accountId } catch (_: IllegalArgumentException) { throw MobileFailure(MobileFailureKind.Service) }
        return value
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
                    strength = task.strengthLabel(),
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
                    deviceSensor = s.optJSONObject("bySource")?.optJSONObject("deviceSensor")?.getInt("count"),
                    selfReport = s.optJSONObject("bySource")?.optJSONObject("selfReport")?.getInt("count"),
                    demoSim = s.optJSONObject("bySource")?.optJSONObject("demoSim")?.getInt("count"),
                    trend = s.optJSONArray("trend")?.objects { point ->
                        StepPoint(point.getString("date"), point.intOrNull("effectiveCount"))
                    }.orEmpty(),
                )
            },
            vitals = optJSONObject("vitalsTask")?.let { task ->
                MobileVitals(
                    task.getString("id"), task.getString("time"),
                    task.optJSONObject("record")?.let { record ->
                        MobilePressure(
                            record.getString("id"), record.intOrNull("systolic"), record.intOrNull("diastolic"),
                            record.getBoolean("chestPain"), record.optJSONObject("reply")?.review(),
                        )
                    },
                )
            },
            bpTargets = optJSONObject("bpTargets")?.let {
                BpTargets(it.getInt("warnSystolic"), it.getInt("warnDiastolic"), it.getInt("maxSystolic"),
                    it.getInt("maxDiastolic"), it.intOrNull("minSystolic"), it.intOrNull("minDiastolic"))
            },
            adherence = optJSONArray("medicationAdherence")?.objects { item ->
                val week = item.getJSONObject("week")
                MobileAdherence(item.getString("medicationName"), item.strengthLabel(),
                    week.getInt("taken"), week.getInt("missed"), week.getInt("unanswered"))
            }.orEmpty(),
        )
    }

    suspend fun brief(token: String): MobileBrief? = request("/api/clinical/brief", token) {
        optJSONObject("brief")?.takeIf { it.optInt("level") == 4 }?.let {
            MobileBrief(it.getString("approvedReplyUz"), it.getString("approvedAt"))
        }
    }

    suspend fun savePressure(token: String, taskId: String, systolic: Int?, diastolic: Int?, pain: Boolean, repeatOf: String?) {
        val body = JSONObject().put("taskId", taskId).put("systolic", systolic).put("diastolic", diastolic)
            .put("chestPain", pain).put("repeatOfEvidenceId", repeatOf)
        saveEvidence(token, body)
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
        saveEvidence(token, payload)
    }

    private suspend fun saveEvidence(token: String, payload: JSONObject) {
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

    suspend fun reviewKeyframes(token: String, body: JSONObject): KeyframeObservation =
        request("/api/clinical/exercise/keyframe-review", token, body) {
            KeyframeObservation(getString("summaryUz"), getString("uncertaintyNoteUz"))
        }

    suspend fun requestVideoUpload(token: String, attemptId: String, video: ShareableExerciseVideo) =
        request("exercise/video-upload", token, video.requestBody(attemptId, "request")) {
            if (getString("mimeType") != video.mime) throw MobileFailure(MobileFailureKind.Service)
            VideoUploadTicket(getString("signedUrl"), getString("path"))
        }

    suspend fun finalizeVideoUpload(token: String, attemptId: String, video: ShareableExerciseVideo, path: String) {
        request("exercise/video-upload", token, video.requestBody(attemptId, "finalize").put("path", path)) {
            if (getString("status") != "finalized") throw MobileFailure(MobileFailureKind.Service)
        }
    }

    suspend fun downloadSample(sample: ExerciseSample, target: File, onProgress: (Int) -> Unit) =
        withContext(Dispatchers.IO) {
            val connection = origin.resolve("/demo/${sample.fileName}").toURL().openConnection() as HttpURLConnection
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 8_000
                connection.readTimeout = 12_000
                if (connection.responseCode != 200) throw MobileFailure(MobileFailureKind.NotFound)
                val total = connection.contentLengthLong
                if (total > MAX_SAMPLE_BYTES) throw MobileFailure(MobileFailureKind.Rejected)
                connection.inputStream.use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(32 * 1024)
                        var read = 0L
                        var previous = -1
                        while (true) {
                            ensureActive()
                            val count = input.read(buffer)
                            if (count < 0) break
                            read += count
                            if (read > MAX_SAMPLE_BYTES) throw MobileFailure(MobileFailureKind.Rejected)
                            output.write(buffer, 0, count)
                            val progress = if (total > 0) (100 * read / total).toInt().coerceAtMost(99) else 0
                            if (previous != progress) {
                                previous = progress
                                withContext(Dispatchers.Main.immediate) { onProgress(progress) }
                            }
                        }
                    }
                }
            } catch (_: IOException) {
                ensureActive()
                throw MobileFailure(MobileFailureKind.Offline)
            } finally {
                connection.disconnect()
            }
            withContext(Dispatchers.Main.immediate) { onProgress(100) }
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
                authorize(connection, token)
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
                val response = responseBody(connection)
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

    private fun authorize(connection: HttpURLConnection, token: String) {
        connection.setRequestProperty("Authorization", "Bearer $token")
        workspaceId?.let { connection.setRequestProperty("X-Workspace-Id", it) }
    }

    private suspend fun <T> request(
        endpoint: String,
        token: String? = null,
        body: JSONObject? = null,
        decode: JSONObject.() -> T,
    ): T = withContext(Dispatchers.IO) {
        val path = if (endpoint.startsWith("/")) endpoint else "/api/mobile/v1/$endpoint"
        val connection = origin.resolve(path).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 7_000
            connection.readTimeout = when (endpoint) {
                "exercise/sample-ai" -> 30_000
                "exercise-coach" -> 20_000
                "/api/clinical/exercise/keyframe-review" -> 45_000
                "exercise/video-upload" -> 20_000
                else -> 10_000
            }
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            if (token != null) authorize(connection, token)
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
                    when (endpoint) {
                        "pair" -> MobileFailureKind.InvalidCode
                        "login" -> MobileFailureKind.InvalidCredentials
                        else -> MobileFailureKind.Expired
                    },
                )
                HttpURLConnection.HTTP_NOT_FOUND -> throw MobileFailure(MobileFailureKind.NotFound)
                HttpURLConnection.HTTP_FORBIDDEN -> throw MobileFailure(MobileFailureKind.Forbidden)
                429 -> throw MobileFailure(MobileFailureKind.Quota)
                HttpURLConnection.HTTP_CONFLICT -> {
                    if (endpoint == "exercise/video-upload" &&
                        JSONObject(responseBody(connection)).optString("error") == "already_uploaded"
                    ) {
                        throw MobileFailure(MobileFailureKind.AlreadyUploaded)
                    }
                    throw MobileFailure(MobileFailureKind.Rejected)
                }
                HttpURLConnection.HTTP_BAD_REQUEST -> throw MobileFailure(MobileFailureKind.Rejected)
                else -> throw MobileFailure(MobileFailureKind.Service)
            }
            JSONObject(responseBody(connection)).decode()
        } catch (_: IOException) {
            throw MobileFailure(MobileFailureKind.Offline)
        } catch (_: JSONException) {
            throw MobileFailure(MobileFailureKind.Service)
        } finally {
            connection.disconnect()
        }
    }

    private fun responseBody(connection: HttpURLConnection): String {
        val input = if (connection.responseCode >= 400) connection.errorStream else connection.inputStream
        if (input == null) throw MobileFailure(MobileFailureKind.Service)
        return input.use { stream ->
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
            val debugLoopback = BuildConfig.DEBUG && origin.scheme == "http" && origin.host in setOf("127.0.0.1", "10.0.2.2")
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

internal inline fun <T> JSONArray.objects(decode: (JSONObject) -> T): List<T> =
    List(length()) { decode(getJSONObject(it)) }

private fun JSONObject.intOrNull(name: String): Int? = if (isNull(name)) null else getInt(name)

private fun JSONObject.strengthLabel(): String? {
    if (isNull("strength")) return null
    val strength = getDouble("strength").toBigDecimal().stripTrailingZeros().toPlainString()
    val unit = when (val value = optString("strengthUnit", "mg")) {
        "mcg" -> "mkg"
        "iu" -> "IU"
        else -> value
    }
    return "$strength $unit"
}
