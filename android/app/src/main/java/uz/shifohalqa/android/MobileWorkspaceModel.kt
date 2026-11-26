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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal data class MobileWorkspaceState(
    val connected: Boolean = false,
    val isDemo: Boolean = false,
    val patientName: String? = null,
    val brief: MobileBrief? = null,
    val briefError: Boolean = false,
    val restoring: Boolean = false,
    val pairing: Boolean = false,
    val refreshing: Boolean = false,
    val saving: Boolean = false,
    val day: MobileDay? = null,
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

internal data class StepUi(
    val count: Int = 0,
    val goal: Int = 3000,
    val sensorAvailable: Boolean = false,
    val permissionGranted: Boolean = false,
    val syncing: Boolean = false,
    val syncError: String? = null,
)

internal class MobileWorkspaceModel(application: Application) : AndroidViewModel(application) {
    private val connections = DemoConnectionStore(application)
    private val repository = ExerciseRepository(application)
    private var stepStore: StepTrackerStore? = null
    private var simulatedStepStore: StepTrackerStore? = null
    private val stepSensor = StepSensorController(application, ::onSensorReading)
    private var session: DemoConnection? = null
    private var expiration: Job? = null
    private var exerciseObserver: Job? = null
    private val stepSyncJobs = mutableMapOf<String, Job>()
    var state by mutableStateOf(MobileWorkspaceState(restoring = true))
        private set
    var exercise by mutableStateOf(ExerciseUi())
        private set
    var steps by mutableStateOf(initialStepUi(application))
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

    fun refreshStepPermission() {
        val ctx = getApplication<Application>()
        val granted = hasStepPermission(ctx)
        val sensorAvail = hasStepSensor(ctx)
        if (granted && sensorAvail && session != null) stepSensor.start()
        steps = steps.copy(sensorAvailable = sensorAvail, permissionGranted = granted)
    }

    fun simulateSteps(delta: Int = 500) {
        val current = session?.takeIf { it.credentials.isDemo } ?: return
        val store = simulatedStepStore ?: return
        store.addSimulated(delta)
        scheduleStepSync(current, store, "demo_sim", 350L)
    }

    private fun onSensorReading(rawValue: Float) {
        val current = session ?: return
        val store = stepStore ?: return
        val snap = store.onSensorCounter(rawValue)
        val goal = state.day?.steps?.goal ?: steps.goal
        steps = steps.copy(count = snap.count, goal = goal, syncError = null)
        if (snap.needsSync) scheduleStepSync(current, store, "device_sensor", 1_200L)
    }

    private fun scheduleStepSync(current: DemoConnection, store: StepTrackerStore, source: String, delayMs: Long) {
        if (stepSyncJobs[source]?.isActive == true) return
        stepSyncJobs[source] = viewModelScope.launch {
            delay(delayMs)
            do {
                val snap = store.snapshot()
                if (!snap.needsSync || session !== current) break
                steps = steps.copy(syncing = true, syncError = null)
                try {
                    val result = current.api.saveSteps(current.token, snap.count, source)
                    if (session !== current) break
                    store.markSynced(snap.date, result.count, source)
                    updateStepSource(source, result.count, result.goal)
                } catch (failure: MobileFailure) {
                    if (session !== current) break
                    if (failure.kind == MobileFailureKind.Expired) expire()
                    else steps = steps.copy(syncError = "Qadamlar telefonda saqlandi. Ulanish tiklangach yangilang.")
                    break
                }
            } while (store.snapshot().needsSync)
            if (session === current) steps = steps.copy(syncing = false)
        }
    }

    private fun updateStepSource(source: String, count: Int, goal: Int) {
        val day = state.day ?: return
        val previous = day.steps ?: return
        val updated = when (source) {
            "device_sensor" -> previous.copy(deviceSensor = count)
            "self_report" -> previous.copy(selfReport = count)
            else -> previous.copy(demoSim = count)
        }
        val preferred = updated.deviceSensor ?: updated.selfReport ?: updated.demoSim
        state = state.copy(day = day.copy(steps = updated.copy(
            count = preferred ?: 0, goal = goal, achieved = (preferred ?: 0) >= goal,
            trend = updated.trend.map { if (it.date == day.date) it.copy(count = preferred) else it },
        )))
    }

    suspend fun saveManualSteps(count: Int): String? = submit { current ->
        val result = current.api.saveSteps(current.token, count, "self_report")
        if (session === current) updateStepSource("self_report", result.count, result.goal)
    }

    private fun activate(current: DemoConnection) {
        session = current
        stepStore = StepTrackerStore(getApplication(), current.scope)
        simulatedStepStore = if (current.credentials.isDemo) StepTrackerStore(getApplication(), "${current.scope}/simulation") else null
        steps = initialStepUi(getApplication())
        state = MobileWorkspaceState(connected = true, refreshing = true, isDemo = current.credentials.isDemo,
            patientName = current.credentials.patientName)
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
                exercise = exercise.copy(planLoaded = view != null, plan = view?.plan, attempts = view?.attempts.orEmpty(), outbox = outbox)
            }
        }
        viewModelScope.launch { repository.resume(current) }
        refreshStepPermission()
        viewModelScope.launch { refresh(current) }
    }

    fun sampleApi(): MobileApi? = session?.api

    suspend fun reviewKeyframes(body: JSONObject): KeyframeObservation {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        val observation = current.api.reviewKeyframes(current.token, body)
        if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
        return observation
    }

    suspend fun shareExerciseVideo(
        result: ExerciseVideoResult, attemptId: String, uploadedPath: String?,
        onProgress: (Int) -> Unit, onUploaded: (String) -> Unit,
    ) {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        try {
            withShareableVideo(getApplication(), result) { video ->
                val path = uploadedPath ?: run {
                    val ticket = current.api.requestVideoUpload(current.token, attemptId, video)
                    if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
                    putExerciseVideo(ticket, video, onProgress)
                    withContext(Dispatchers.Main.immediate) { onUploaded(ticket.path) }
                    ticket.path
                }
                if (session !== current) throw MobileFailure(MobileFailureKind.Expired)
                current.api.finalizeVideoUpload(current.token, attemptId, video, path)
            }
        } catch (failure: MobileFailure) {
            if (failure.kind != MobileFailureKind.AlreadyUploaded) throw failure
        }
        if (session === current) refreshExercise()
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

    suspend fun dorimosScanSample(taskId: String, sampleId: String): DorimosOutcome {
        val current = session ?: throw MobileFailure(MobileFailureKind.Expired)
        if (!current.credentials.isDemo) throw MobileFailure(MobileFailureKind.Forbidden)
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

    fun queueExercise(evidence: JSONObject, label: String, date: LocalDate, onSaved: (String) -> Unit) {
        val current = session ?: return
        val plan = exercise.plan ?: return
        if (exercise.saving) return
        exercise = exercise.copy(saving = true, message = null)
        viewModelScope.launch {
            try {
                val id = repository.queue(current, plan, evidence, label, date)
                if (session === current) onSaved(id)
            } catch (_: IllegalStateException) {
                if (session === current) exercise = exercise.copy(message = "Qayd holatini tekshiring va qayta urinib ko‘ring.")
            } catch (_: android.database.sqlite.SQLiteException) {
                if (session === current) exercise = exercise.copy(message = "Qayd telefonga saqlanmadi. Qayta urinib ko‘ring.")
            } finally {
                if (session === current) exercise = exercise.copy(saving = false)
            }
        }
    }

    fun discardExercise(id: String) {
        val current = session ?: return
        viewModelScope.launch { repository.dao.discard(id, current.scope) }
    }

    fun pair(address: String, code: String) {
        val normalized = code.trim().lowercase()
        if (!normalized.matches(Regex("[0-9a-f]{32}"))) {
            state = state.copy(message = "Veb-paneldagi 32 belgili ulash kodini kiriting.")
            return
        }
        connect(address) { it.pair(normalized) }
    }

    fun login(address: String, email: String, password: String) =
        connect(address) { it.login(email.trim(), password) }

    private fun connect(address: String, authenticate: suspend (MobileApi) -> MobileCredentials) {
        if (state.restoring || state.pairing || state.connected) return
        val api = try { MobileApi.forAddress(address) }
        catch (failure: MobileFailure) {
            state = state.copy(message = failure.kind.explanation())
            return
        }
        state = state.copy(pairing = true, message = null)
        viewModelScope.launch {
            try {
                val current = DemoConnection(api, authenticate(api))
                if (!withContext(Dispatchers.IO) { connections.save(current) }) {
                    state = MobileWorkspaceState(message = "Ulanishni telefonda saqlab bo‘lmadi. Qayta urinib ko‘ring.")
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
        val task = state.day?.tasks?.firstOrNull { it.id == taskId }
            ?: return MobileFailureKind.NotFound.explanation()
        if (task.record != null) return null
        return submit { current ->
            current.api.record(current.token, taskId, reason)
            refresh(current)
        }
    }

    suspend fun recordPressure(task: MobileVitals, systolic: Int?, diastolic: Int?, pain: Boolean): String? =
        submit { current ->
            current.api.savePressure(current.token, task.id, systolic, diastolic, pain, task.record?.id)
            refresh(current)
        }

    private suspend fun submit(action: suspend (DemoConnection) -> Unit): String? {
        val current = session ?: return MobileFailureKind.Expired.explanation()
        if (state.refreshing || state.saving) return "Oldingi so‘rov tugashini kuting."
        state = state.copy(saving = true, message = null)
        return viewModelScope.async {
            try {
                action(current)
                null
            } catch (failure: MobileFailure) {
                if (session === current && failure.kind == MobileFailureKind.Expired) expire()
                failure.kind.explanation()
            } finally {
                if (session === current) state = state.copy(saving = false)
            }
        }.await()
    }

    private suspend fun refresh(current: DemoConnection) {
        try {
            val day = current.api.today(current.token)
            if (session !== current) return
            state = state.copy(day = day, refreshing = false)
            val sources = day.steps
            stepStore?.let { store ->
                val local = store.snapshot()
                val remoteCount = sources?.deviceSensor ?: sources?.count?.takeIf { sources.source == "device_sensor" }
                if (remoteCount != null) store.mergeServerSteps(day.date, remoteCount, "device_sensor")
                val merged = store.snapshot()
                steps = steps.copy(count = merged.count, goal = sources?.goal ?: steps.goal)
                if (local.needsSync && merged.needsSync) scheduleStepSync(current, store, "device_sensor", 0)
            }
            simulatedStepStore?.let { store ->
                sources?.demoSim?.let { store.mergeServerSteps(day.date, it, "demo_sim") }
                if (store.snapshot().needsSync) scheduleStepSync(current, store, "demo_sim", 0)
            }
            refreshBrief(current)
        } catch (failure: MobileFailure) {
            if (session !== current) return
            if (failure.kind == MobileFailureKind.Expired) expire()
            else state = state.copy(refreshing = false, message = failure.kind.explanation())
        }
    }

    private suspend fun refreshBrief(current: DemoConnection) {
        try {
            val brief = current.api.brief(current.token)
            if (session === current) state = state.copy(brief = brief, briefError = false)
        } catch (failure: MobileFailure) {
            if (session !== current) return
            if (failure.kind == MobileFailureKind.Expired) expire()
            else state = state.copy(briefError = true)
        }
    }

    private fun expire() {
        clearSession()
        state = MobileWorkspaceState(message = MobileFailureKind.Expired.explanation())
    }

    private fun clearSession() {
        session = null
        stepSyncJobs.values.forEach { it.cancel() }
        stepSyncJobs.clear()
        stepSensor.stop()
        stepStore = null
        simulatedStepStore = null
        steps = initialStepUi(getApplication())
        expiration?.cancel()
        expiration = null
        exerciseObserver?.cancel()
        exerciseObserver = null
        exercise = ExerciseUi()
        connections.clear()
    }
}

private fun initialStepUi(application: Application) = StepUi(
    sensorAvailable = hasStepSensor(application),
    permissionGranted = hasStepPermission(application),
)

private fun MobileFailureKind.explanation(): String = when (this) {
    MobileFailureKind.InvalidAddress -> "Veb-panelning HTTPS manzilini kiriting."
    MobileFailureKind.InvalidCode -> "Kod ishlatilgan, noto‘g‘ri yoki muddati o‘tgan. Veb-paneldan yangi kod oling."
    MobileFailureKind.InvalidCredentials -> "Elektron pochta yoki parol noto‘g‘ri."
    MobileFailureKind.Forbidden -> "Bu amal hisobingiz uchun mavjud emas."
    MobileFailureKind.Expired -> "Ulanish muddati tugadi. Hisobingizga qayta kiring yoki yangi demo kod oling."
    MobileFailureKind.AlreadyUploaded -> "Video avval yuborilgan."
    MobileFailureKind.Quota -> "So‘rovlar soni chegaraga yetdi. Birozdan keyin qayta urinib ko‘ring."
    MobileFailureKind.Offline -> "Serverga ulanib bo‘lmadi. Internet va veb-panel manzilini tekshiring."
    MobileFailureKind.NotFound -> "Sahifa yoki vazifa topilmadi. Veb-panel manzilini va rejani tekshiring."
    MobileFailureKind.Rejected -> "Server qaydni qabul qilmadi. Qaydni tekshirib, qayta urinib ko‘ring."
    MobileFailureKind.Service -> "Veb-panel vaqtincha javob bermayapti. Qayta urinib ko‘ring."
}
