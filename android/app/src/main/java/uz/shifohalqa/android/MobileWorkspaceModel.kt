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

internal class MobileWorkspaceModel(application: Application) : AndroidViewModel(application) {
    private val connections = DemoConnectionStore(application)
    private val repository = ExerciseRepository(application)
    private var session: DemoConnection? = null
    private var expiration: Job? = null
    private var exerciseObserver: Job? = null
    var state by mutableStateOf(MobileWorkspaceState(restoring = true))
        private set
    var exercise by mutableStateOf(ExerciseUi())
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
            if (session === current) state = state.copy(day = day, refreshing = false)
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
        expiration?.cancel()
        expiration = null
        exerciseObserver?.cancel()
        exerciseObserver = null
        exercise = ExerciseUi()
        connections.clear()
    }
}

private fun MobileFailureKind.explanation(): String = when (this) {
    MobileFailureKind.InvalidAddress -> "Veb-panelning HTTPS manzilini kiriting."
    MobileFailureKind.InvalidCode -> "Kod ishlatilgan, noto‘g‘ri yoki muddati o‘tgan. Veb-paneldan yangi kod oling."
    MobileFailureKind.Expired -> "Ulanish muddati tugadi. Veb-paneldan yangi kod oling."
    MobileFailureKind.Offline -> "Serverga ulanib bo‘lmadi. Internet va veb-panel manzilini tekshiring."
    MobileFailureKind.NotFound -> "Sahifa yoki vazifa topilmadi. Veb-panel manzilini va rejani tekshiring."
    MobileFailureKind.Rejected -> "Server qaydni qabul qilmadi. Qaydni tekshirib, qayta urinib ko‘ring."
    MobileFailureKind.Service -> "Veb-panel vaqtincha javob bermayapti. Qayta urinib ko‘ring."
}
