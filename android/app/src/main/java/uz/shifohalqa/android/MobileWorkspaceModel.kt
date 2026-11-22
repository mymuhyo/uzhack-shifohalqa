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
    val achieved: Boolean = false,
    val source: String = "device_sensor",
    val sensorAvailable: Boolean = false,
    val permissionGranted: Boolean = false,
    val syncing: Boolean = false,
    val synced: Boolean = false,
    val syncError: String? = null,
)

internal class MobileWorkspaceModel(application: Application) : AndroidViewModel(application) {
    private val connections = DemoConnectionStore(application)
    private val repository = ExerciseRepository(application)
    private val stepStore = StepTrackerStore(application)
    private val stepSensor = StepSensorController(application, ::onSensorReading)
    private var session: DemoConnection? = null
    private var expiration: Job? = null
    private var exerciseObserver: Job? = null
    private var stepSyncJob: Job? = null
    var state by mutableStateOf(MobileWorkspaceState(restoring = true))
        private set
    var exercise by mutableStateOf(ExerciseUi())
        private set
    var steps by mutableStateOf(initialStepUi(application, stepStore.snapshot()))
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

    private fun activate(current: DemoConnection) {
        session = current
        state = MobileWorkspaceState(connected = true, refreshing = true)
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
                state = state.copy(day = day)
                if (failure == null || day.tasks.any { it.id == taskId && it.record != null }) null
                else failure.explanation()
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
            val serverSteps = day.steps
            val merged = if (serverSteps != null) {
                stepStore.mergeServerSteps(day.date, serverSteps.count, serverSteps.source)
            } else {
                stepStore.snapshot()
            }
            val goal = serverSteps?.goal ?: steps.goal
            steps = steps.copy(
                count = merged.count,
                goal = goal,
                achieved = merged.count >= goal,
                source = serverSteps?.source ?: merged.source,
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
        stepSensor.stop()
        expiration?.cancel()
        expiration = null
        exerciseObserver?.cancel()
        exerciseObserver = null
        exercise = ExerciseUi()
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
    MobileFailureKind.Expired -> "Ulanish muddati tugadi. Veb-paneldan yangi kod oling."
    MobileFailureKind.Offline -> "Serverga ulanib bo‘lmadi. Internet va veb-panel manzilini tekshiring."
    MobileFailureKind.NotFound -> "Sahifa yoki vazifa topilmadi. Veb-panel manzilini va rejani tekshiring."
    MobileFailureKind.Rejected -> "Server qaydni qabul qilmadi. Qaydni tekshirib, qayta urinib ko‘ring."
    MobileFailureKind.Service -> "Veb-panel vaqtincha javob bermayapti. Qayta urinib ko‘ring."
}
