package uz.shifohalqa.android

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import kotlin.math.max
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

internal data class MobileWorkspaceState(
    val connected: Boolean = false,
    val isDemo: Boolean = true,
    val serverOrigin: String? = null,
    val restoring: Boolean = false,
    val pairing: Boolean = false,
    val refreshing: Boolean = false,
    val saving: Boolean = false,
    val vitalsSaving: Boolean = false,
    val manualStepsSaving: Boolean = false,
    val day: MobileDay? = null,
    val brief: PatientClinicalBrief? = null,
    val briefLoading: Boolean = false,
    val message: String? = null,
)

internal data class ExerciseUi(
    val planLoaded: Boolean = false,
    val plan: ExercisePlan? = null,
    val attempts: List<ExerciseAttempt> = emptyList(),
    val outbox: List<ExerciseOutbox> = emptyList(),
    val loading: Boolean = false,
    val saving: Boolean = false,
    val message: String? = null,
)

internal data class VideoUploadUiState(
    val uploading: Boolean = false,
    val progress: Int = 0,
    val completedAttemptId: String? = null,
    val expiresAt: String? = null,
    val error: String? = null,
)

internal data class StepUi(
    val count: Int = 0,
    val goal: Int = 3000,
    val achieved: Boolean = false,
    val source: String = "device_sensor",
    val sensorAvailable: Boolean = false,
    val permissionGranted: Boolean = false,
    val syncing: Boolean = false,
    val synced: Boolean = false,
    val syncError: String? = null,
)

internal class MobileWorkspaceModel(application: Application) : AndroidViewModel(application) {
    private val appPrefs = AppPreferences(application)
    private val connections = DemoConnectionStore(application)
    private val repository = ExerciseRepository(application)
    private val sampleCache = SampleVideoCache(application)
    private val stepStore = StepTrackerStore(application)
    private val stepSensor = StepSensorController(application, ::onSensorReading)
    private var session: DemoConnection? = null
    private var expiration: Job? = null
    private var exerciseObserver: Job? = null
    private var stepSyncJob: Job? = null
    private var videoUploadJob: Job? = null

    var themeMode by mutableStateOf(appPrefs.themeMode)
        private set
    var largeText by mutableStateOf(appPrefs.largeText)
        private set
    var poseModelMode by mutableStateOf(appPrefs.poseModelMode)
        private set
    var preferredOrigin by mutableStateOf(appPrefs.lastOrigin)
        private set

    var state by mutableStateOf(MobileWorkspaceState(restoring = true))
        private set
    var exercise by mutableStateOf(ExerciseUi())
        private set
    var steps by mutableStateOf(initialStepUi(application, stepStore.snapshot()))
        private set
    var videoUpload by mutableStateOf(VideoUploadUiState())
        private set

    init {
        viewModelScope.launch {
            val restored = withContext(Dispatchers.IO) { connections.read() }
            when {
                restored == null -> state = MobileWorkspaceState()
                restored.expired -> expire()
                else -> activate(restored)
            }
        }
    }

    override fun onCleared() {
        stepSensor.stop()
        super.onCleared()
    }

    fun updateThemeMode(mode: ThemeMode) {
        themeMode = mode
        appPrefs.themeMode = mode
    }

    fun updateLargeText(enabled: Boolean) {
        largeText = enabled
        appPrefs.largeText = enabled
    }

    fun updatePoseModelMode(mode: PoseModelMode) {
        poseModelMode = mode
        appPrefs.poseModelMode = mode
    }

    fun refreshStepPermission() {
        val ctx = getApplication<Application>()
        val granted = hasStepPermission(ctx)
        val sensorAvail = hasStepSensor(ctx)
        if (granted && sensorAvail && session != null) stepSensor.start()
        steps = steps.copy(sensorAvailable = sensorAvail, permissionGranted = granted)
    }

    fun simulateSteps(delta: Int = 500) {
        val current = session ?: return
        if (!current.isDemo) return
        val snap = stepStore.addSimulated(delta)
        val goal = state.day?.steps?.goal ?: steps.goal
        steps = steps.copy(
            count = snap.count,
            goal = goal,
            achieved = snap.count >= goal,
            source = snap.source,
            synced = !snap.needsSync,
            syncError = null,
        )
        scheduleStepSync(350L)
    }

    private fun onSensorReading(rawValue: Float) {
        val snap = stepStore.onSensorCounter(rawValue)
        val goal = state.day?.steps?.goal ?: steps.goal
        viewModelScope.launch {
            steps = steps.copy(
                count = snap.count,
                goal = goal,
                achieved = snap.count >= goal,
                source = snap.source,
                synced = !snap.needsSync,
                syncError = null,
            )
            if (snap.needsSync) scheduleStepSync(1_200L)
        }
    }

    private fun scheduleStepSync(delayMs: Long) {
        val current = session ?: return
        stepSyncJob?.cancel()
        stepSyncJob = viewModelScope.launch {
            delay(delayMs)
            syncStepsNow(current)
        }
    }

    private suspend fun syncStepsNow(current: DemoConnection) {
        val snap = stepStore.snapshot()
        if (!snap.needsSync || session !== current) return
        if (snap.source == "demo_sim" && !current.isDemo) return
        steps = steps.copy(syncing = true, syncError = null)
        try {
            val res = current.api.saveSteps(current.token, snap.count, snap.source)
            if (session !== current) return
            val updated = stepStore.markSynced(snap.date, res.count, res.source)
            steps = steps.copy(
                count = updated.count,
                goal = res.goal,
                achieved = res.achieved,
                source = res.source,
                syncing = false,
                synced = !updated.needsSync,
                syncError = null,
            )
        } catch (failure: MobileFailure) {
            if (session !== current) return
            if (failure.kind == MobileFailureKind.Expired) {
                expire()
            } else {
                steps = steps.copy(syncing = false, synced = false, syncError = "Oflayn saqlandi — internetda sinxronlanadi")
            }
        }
    }

    suspend fun saveManualSteps(count: Int): String? {
        val current = session ?: return MobileFailureKind.Expired.explanation()
        if (count !in 0..999_999) return "Qadam soni 0 dan 999 999 gacha bo‘lishi kerak."
        state = state.copy(manualStepsSaving = true, message = null)
        return try {
            current.api.saveSteps(current.token, count, "self_report")
            refresh(current)
            null
        } catch (failure: MobileFailure) {
            if (failure.kind == MobileFailureKind.Expired) expire()
            failure.kind.explanation()
        } finally {
            if (session === current) state = state.copy(manualStepsSaving = false)
        }
    }

    private fun activate(current: DemoConnection) {
        session = current
        preferredOrigin = current.api.address
        appPrefs.lastOrigin = current.api.address

        val cachedDay = appPrefs.readCachedToday(current.scope)?.let { raw ->
            runCatching { parseMobileDay(JSONObject(raw)) }.getOrNull()
        }
        val cachedBrief = appPrefs.readCachedBrief(current.scope)?.let { raw ->
            runCatching { parsePatientClinicalBrief(JSONObject(raw)) }.getOrNull()
        }

        state = MobileWorkspaceState(
            connected = true,
            isDemo = current.isDemo,
            serverOrigin = current.api.address,
            refreshing = true,
            day = cachedDay,
            brief = cachedBrief,
        )

        expiration = viewModelScope.launch {
            val remaining = Duration.between(Instant.now(), current.credentials.expiresAt).toMillis()
            delay(remaining.coerceAtLeast(1))
            if (session === current) expire()
        }
        exerciseObserver = viewModelScope.launch {
            repository.dao.snapshot(current.scope).combine(repository.dao.outbox(current.scope)) { cached, outbox ->
                val view = cached?.let { ExerciseView.parse(JSONObject(it)) }
                view to outbox
            }.collect { (view, outbox) ->
                exercise = exercise.copy(
                    planLoaded = view != null,
                    plan = view?.plan,
                    attempts = view?.attempts.orEmpty(),
                    outbox = outbox,
                )
            }
        }
        viewModelScope.launch { repository.resume(current) }
        refreshStepPermission()
        viewModelScope.launch { refresh(current) }
    }

    suspend fun analyzePublicSample(provider: SampleAiProvider, comparison: String): SampleAiReport {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val report = current.api.sampleAi(current.token, provider, comparison)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        return report
    }

    suspend fun publicExerciseCoach(): PublicExerciseAdvice {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val advice = current.api.publicExerciseCoach(current.token)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        return advice
    }

    suspend fun requestExerciseCoach(payload: JSONObject): PublicExerciseAdvice {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val advice = current.api.requestExerciseCoach(current.token, payload)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        return advice
    }

    suspend fun reviewExerciseKeyframes(payload: JSONObject): KeyframeReviewReport {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val report = current.api.reviewExerciseKeyframes(current.token, payload)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        return report
    }

    suspend fun resolveSampleClip(movement: PoseMovement, onProgress: (Int) -> Unit): ExerciseClip {
        val spec = SampleVideoCatalog.specFor(movement)
        return sampleCache.resolveClip(spec, session?.api, onProgress)
    }

    fun isSampleCached(movement: PoseMovement): Boolean {
        val spec = SampleVideoCatalog.specFor(movement)
        return spec.bundledAssetName != null || sampleCache.cachedFileIfValid(spec) != null
    }

    suspend fun dorimosScanSample(taskId: String, sampleId: String): DorimosOutcome {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        if (!current.isDemo) throw MobileFailure(MobileFailureKind.ForbiddenRole)
        val outcome = current.api.dorimosScanSample(current.token, taskId, sampleId)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        return outcome
    }

    suspend fun dorimosScanPhoto(taskId: String, jpegBytes: ByteArray): DorimosOutcome {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val outcome = current.api.dorimosScanPhoto(current.token, taskId, jpegBytes)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        return outcome
    }

    suspend fun dorimosConfirm(taskId: String, confirmToken: String): DorimosOutcome {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val outcome = current.api.dorimosConfirm(current.token, taskId, confirmToken)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        if (outcome == DorimosOutcome.Saved || outcome == DorimosOutcome.AlreadySaved) refresh(current)
        return outcome
    }

    suspend fun dorimosManual(taskId: String): DorimosOutcome {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val outcome = current.api.dorimosManual(current.token, taskId)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        if (outcome == DorimosOutcome.Saved || outcome == DorimosOutcome.AlreadySaved) refresh(current)
        return outcome
    }

    suspend fun dorimosDefer(taskId: String): DorimosOutcome {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val outcome = current.api.dorimosDefer(current.token, taskId)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        if (outcome == DorimosOutcome.Deferred || outcome == DorimosOutcome.AlreadySaved) refresh(current)
        return outcome
    }

    fun refreshExercise() {
        val current = session ?: return
        if (exercise.loading) return
        exercise = exercise.copy(loading = true, message = null)
        viewModelScope.launch {
            try {
                repository.resume(current)
                repository.refresh(current)
            } catch (failure: MobileFailure) {
                if (session !== current) return@launch
                if (failure.kind == MobileFailureKind.Expired) expire()
                else exercise = exercise.copy(message = "Mashq rejasini yangilab bo‘lmadi. Ulanishni tekshirib qayta urinib ko‘ring.")
            } finally {
                if (session === current) exercise = exercise.copy(loading = false)
            }
        }
    }

    fun queueExercise(evidence: JSONObject, label: String, date: LocalDate, onSaved: () -> Unit) {
        val current = session ?: return
        val plan = exercise.plan ?: return
        if (exercise.saving) return
        exercise = exercise.copy(saving = true, message = null)
        viewModelScope.launch {
            try {
                repository.queue(current, plan, evidence, label, date)
                if (session === current) onSaved()
            } catch (_: IllegalStateException) {
                if (session === current) exercise = exercise.copy(message = "Qayd holatini tekshiring va qayta urinib ko‘ring.")
            } catch (_: android.database.sqlite.SQLiteException) {
                if (session === current) exercise = exercise.copy(message = "Qayd telefonga saqlanmadi. Qayta urinib ko‘ring.")
            } finally {
                if (session === current) exercise = exercise.copy(saving = false)
            }
        }
    }

    suspend fun submitExerciseAttempt(
        evidence: JSONObject,
        label: String,
        date: LocalDate,
    ): Pair<Boolean, String?> {
        val current = session ?: return false to null
        val plan = exercise.plan ?: return false to null
        if (exercise.saving) return false to null
        exercise = exercise.copy(saving = true, message = null)
        return try {
            val serverId = repository.submitOnlineOrQueue(current, plan, evidence, label, date)
            true to serverId
        } catch (failure: MobileFailure) {
            if (failure.kind == MobileFailureKind.Expired) expire()
            else exercise = exercise.copy(message = failure.kind.explanation())
            false to null
        } catch (_: IllegalStateException) {
            exercise = exercise.copy(message = "Qayd holatini tekshiring va qayta urinib ko‘ring.")
            false to null
        } catch (_: android.database.sqlite.SQLiteException) {
            exercise = exercise.copy(message = "Qayd telefonga saqlanmadi. Qayta urinib ko‘ring.")
            false to null
        } finally {
            if (session === current) exercise = exercise.copy(saving = false)
        }
    }

    fun startConsentedVideoUpload(
        attemptId: String,
        clip: ExerciseClip,
        durationMs: Long,
        sizeBytes: Long,
        mimeType: String?,
    ) {
        val current = session ?: return
        val durationSec = max(1, (durationMs / 1000L).toInt())
        val normalizedMime = normalizeVideoMimeType(mimeType)
        val validationError = validateVideoUploadSpec(durationSec, sizeBytes, normalizedMime)
        if (validationError != null) {
            videoUpload = VideoUploadUiState(error = validationError)
            return
        }
        val mime = normalizedMime!!
        videoUploadJob?.cancel()
        videoUpload = VideoUploadUiState(uploading = true, progress = 0)
        videoUploadJob = viewModelScope.launch {
            try {
                val spec = current.api.requestVideoUpload(current.token, attemptId, durationSec, sizeBytes, mime)
                val app = getApplication<Application>()
                current.api.uploadVideoToSignedUrl(
                    signedUrl = spec.signedUrl,
                    mimeType = mime,
                    sizeBytes = sizeBytes,
                    openStream = { openClipStream(app, clip) },
                    onProgress = { pct ->
                        if (session === current) videoUpload = videoUpload.copy(progress = pct)
                    },
                )
                val finalized = current.api.finalizeVideoUpload(
                    token = current.token,
                    attemptId = attemptId,
                    durationSec = durationSec,
                    sizeBytes = sizeBytes,
                    mimeType = mime,
                    path = spec.path,
                )
                if (session !== current) return@launch
                videoUpload = VideoUploadUiState(
                    uploading = false,
                    progress = 100,
                    completedAttemptId = finalized.attemptId,
                    expiresAt = finalized.expiresAt,
                )
                runCatching { repository.refresh(current) }
            } catch (_: CancellationException) {
                if (session === current) {
                    videoUpload = VideoUploadUiState(error = "Video yuklash bekor qilindi. O‘lchov natijasi saqlanib qoldi.")
                }
            } catch (failure: MobileFailure) {
                if (session !== current) return@launch
                if (failure.kind == MobileFailureKind.Expired) {
                    expire()
                } else {
                    val msg = when (failure.kind) {
                        MobileFailureKind.QuotaExceeded -> "Kunlik video yuklash limiti tugagan. O‘lchov natijangiz shifokor panelida saqlanib qoldi."
                        MobileFailureKind.AlreadyUploaded -> "Ushbu urinish uchun video allaqachon yuborilgan."
                        MobileFailureKind.Offline -> "Internet ulanmadi — video yuborilmadi, lekin o‘lchov natijasi saqlanib qoldi."
                        else -> "Videoni yuklab bo‘lmadi. O‘lchov natijangiz saqlanib qoldi."
                    }
                    videoUpload = VideoUploadUiState(error = msg)
                }
            } catch (_: Exception) {
                if (session === current) {
                    videoUpload = VideoUploadUiState(error = "Videoni yuklab bo‘lmadi. O‘lchov natijangiz saqlanib qoldi.")
                }
            }
        }
    }

    fun cancelConsentedVideoUpload() {
        videoUploadJob?.cancel()
        videoUploadJob = null
    }

    fun resetVideoUploadState() {
        videoUploadJob?.cancel()
        videoUploadJob = null
        videoUpload = VideoUploadUiState()
    }

    fun discardExercise(id: String) {
        val current = session ?: return
        viewModelScope.launch { repository.dao.discard(id, current.scope) }
    }

    fun pair(address: String, code: String) {
        if (state.restoring || state.pairing || state.connected) return
        val normalizedCode = code.trim().lowercase()
        if (!normalizedCode.matches(Regex("[0-9a-f]{32}"))) {
            state = state.copy(message = "Veb-paneldagi 32 belgili ulash kodini kiriting.")
            return
        }
        val api = try {
            MobileApi.forAddress(address)
        } catch (failure: MobileFailure) {
            state = state.copy(message = failure.kind.explanation())
            return
        }
        state = state.copy(pairing = true, message = null)
        viewModelScope.launch {
            try {
                val current = DemoConnection(api, api.pair(normalizedCode))
                val saved = withContext(Dispatchers.IO) { connections.save(current) }
                if (!saved) {
                    state = MobileWorkspaceState(message = "Ulanishni telefonda saqlab bo‘lmadi. Yangi kod bilan qayta urinib ko‘ring.")
                    return@launch
                }
                activate(current)
            } catch (failure: MobileFailure) {
                state = MobileWorkspaceState(message = failure.kind.explanation())
            }
        }
    }

    fun loginClinic(address: String, email: String, password: String) {
        if (state.restoring || state.pairing || state.connected) return
        val cleanEmail = email.trim()
        if (!cleanEmail.contains("@") || password.isEmpty()) {
            state = state.copy(message = "Email va parolni kiriting.")
            return
        }
        val api = try {
            MobileApi.forAddress(address)
        } catch (failure: MobileFailure) {
            state = state.copy(message = failure.kind.explanation())
            return
        }
        state = state.copy(pairing = true, message = null)
        viewModelScope.launch {
            try {
                val current = DemoConnection(api, api.login(cleanEmail, password))
                val saved = withContext(Dispatchers.IO) { connections.save(current) }
                if (!saved) {
                    state = MobileWorkspaceState(message = "Sessiyani telefonda saqlab bo‘lmadi. Qayta urinib ko‘ring.")
                    return@launch
                }
                activate(current)
            } catch (failure: MobileFailure) {
                state = MobileWorkspaceState(message = failure.kind.explanation())
            }
        }
    }

    fun refresh() {
        val current = session ?: return
        if (state.refreshing || state.saving) return
        state = state.copy(refreshing = true, message = null)
        viewModelScope.launch { refresh(current) }
    }

    fun disconnect() {
        if (state.pairing || state.refreshing || state.saving) return
        clearSession()
        state = MobileWorkspaceState()
    }

    suspend fun record(taskId: String, reason: MissedReason?): String? {
        val current = session ?: return MobileFailureKind.Expired.explanation()
        if (state.refreshing || state.saving) return "Oldingi so‘rov tugashini kuting."
        val task = state.day?.tasks?.firstOrNull { it.id == taskId }
            ?: return MobileFailureKind.NotFound.explanation()
        if (task.record != null) return null

        state = state.copy(saving = true, message = null)
        return viewModelScope.async {
            try {
                val failure = try {
                    current.api.record(current.token, taskId, reason)
                    null
                } catch (failure: MobileFailure) {
                    failure.kind
                }
                if (session !== current) return@async MobileFailureKind.Expired.explanation()
                if (failure == MobileFailureKind.Expired) {
                    expire()
                    return@async failure.explanation()
                }
                val day = try {
                    current.api.today(current.token)
                } catch (error: MobileFailure) {
                    if (session !== current) return@async MobileFailureKind.Expired.explanation()
                    if (error.kind == MobileFailureKind.Expired) {
                        expire()
                        return@async error.kind.explanation()
                    }
                    if (failure == null) {
                        state = state.copy(day = null, message = "Qayd qabul qilindi. Rejani qayta yuklang.")
                        return@async null
                    }
                    return@async "Qayd holatini tekshirib bo‘lmadi. Ulanishni tekshirib, qayta urinib ko‘ring."
                }
                if (session !== current) return@async MobileFailureKind.Expired.explanation()
                day.rawJson?.let { appPrefs.saveCachedToday(current.scope, it) }
                state = state.copy(day = day)
                if (failure == null || day.tasks.any { it.id == taskId && it.record != null }) null
                else failure.explanation()
            } finally {
                if (session === current) state = state.copy(saving = false)
            }
        }.await()
    }

    suspend fun recordVitals(
        taskId: String,
        systolic: Int?,
        diastolic: Int?,
        chestPain: Boolean,
    ): String? {
        val current = session ?: return MobileFailureKind.Expired.explanation()
        if (state.vitalsSaving) return "Oldingi qayd saqlanmoqda."
        state = state.copy(vitalsSaving = true, message = null)
        return try {
            current.api.recordVitals(current.token, taskId, systolic, diastolic, chestPain)
            refresh(current)
            null
        } catch (failure: MobileFailure) {
            if (failure.kind == MobileFailureKind.Expired) expire()
            failure.kind.explanation()
        } finally {
            if (session === current) state = state.copy(vitalsSaving = false)
        }
    }

    private suspend fun refresh(current: DemoConnection) {
        try {
            val day = current.api.today(current.token)
            if (session !== current) return
            day.rawJson?.let { appPrefs.saveCachedToday(current.scope, it) }
            val brief = runCatching { current.api.clinicalBrief(current.token) }.getOrElse { state.brief }
            if (session !== current) return
            if (brief?.rawJson != null) appPrefs.saveCachedBrief(current.scope, brief.rawJson)
            else if (brief == null) appPrefs.clearCachedBrief(current.scope)

            state = state.copy(
                day = day,
                brief = brief,
                isDemo = day.isDemo,
                refreshing = false,
            )
            val serverSteps = day.steps
            val sensorSteps = serverSteps?.bySource?.deviceSensor
            val merged = if (sensorSteps != null) {
                stepStore.mergeServerSteps(day.date, sensorSteps.count, sensorSteps.source)
            } else if (serverSteps != null && day.isDemo && serverSteps.source == "demo_sim") {
                stepStore.mergeServerSteps(day.date, serverSteps.count, serverSteps.source)
            } else {
                stepStore.snapshot()
            }
            val goal = serverSteps?.goal ?: steps.goal
            steps = steps.copy(
                count = merged.count,
                goal = goal,
                achieved = (serverSteps?.count ?: merged.count) >= goal,
                source = merged.source,
                synced = !merged.needsSync,
            )
            if (merged.needsSync) syncStepsNow(current)
        } catch (failure: MobileFailure) {
            if (session !== current) return
            if (failure.kind == MobileFailureKind.Expired) expire()
            else state = state.copy(refreshing = false, message = failure.kind.explanation())
        }
    }

    private fun expire() {
        clearSession()
        state = MobileWorkspaceState(message = MobileFailureKind.Expired.explanation())
    }

    private fun clearSession() {
        session = null
        stepSyncJob?.cancel()
        stepSyncJob = null
        videoUploadJob?.cancel()
        videoUploadJob = null
        stepSensor.stop()
        expiration?.cancel()
        expiration = null
        exerciseObserver?.cancel()
        exerciseObserver = null
        exercise = ExerciseUi()
        videoUpload = VideoUploadUiState()
        connections.clear()
    }
}

private fun initialStepUi(application: Application, snap: StepSnapshot) = StepUi(
    count = snap.count,
    source = snap.source,
    sensorAvailable = hasStepSensor(application),
    permissionGranted = hasStepPermission(application),
    synced = !snap.needsSync,
)

private fun MobileFailureKind.explanation(): String = when (this) {
    MobileFailureKind.InvalidAddress -> "Veb-panelning HTTPS manzilini kiriting."
    MobileFailureKind.InvalidCode -> "Kod ishlatilgan, noto‘g‘ri yoki muddati o‘tgan. Veb-paneldan yangi kod oling."
    MobileFailureKind.InvalidCredentials -> "Email yoki parol noto‘g‘ri. Qaytadan tekshiring."
    MobileFailureKind.ForbiddenRole -> "Bu bo‘limga faqat bemor hisobi bilan kirish mumkin."
    MobileFailureKind.Expired -> "Sessiya muddati tugadi. Qaytadan ulaning."
    MobileFailureKind.Offline -> "Serverga ulanib bo‘lmadi. Internet va veb-panel manzilini tekshiring."
    MobileFailureKind.NotFound -> "Sahifa yoki vazifa topilmadi. Veb-panel manzilini va rejani tekshiring."
    MobileFailureKind.Rejected -> "Server qaydni qabul qilmadi. Qiymatlarni tekshirib, qayta urinib ko‘ring."
    MobileFailureKind.QuotaExceeded -> "Kunlik limit tugagan. Keyinroq qayta urinib ko‘ring."
    MobileFailureKind.AlreadyUploaded -> "Ushbu urinish videosi allaqachon yuborilgan."
    MobileFailureKind.VideoExpired -> "Video saqlash muddati tugagan."
    MobileFailureKind.Service -> "Veb-panel vaqtincha javob bermayapti. Qayta urinib ko‘ring."
}
