package uz.shifohalqa.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal data class MobileWorkspaceState(
    val connected: Boolean = false,
    val pairing: Boolean = false,
    val refreshing: Boolean = false,
    val saving: Boolean = false,
    val day: MobileDay? = null,
    val message: String? = null,
)

internal class MobileWorkspaceModel : ViewModel() {
    private data class WorkspaceSession(val api: MobileApi, val credentials: MobileCredentials) {
        val token get() = credentials.token
    }

    private var session: WorkspaceSession? = null
    private var expiration: Job? = null
    var state by mutableStateOf(MobileWorkspaceState())
        private set

    fun pair(address: String, code: String) {
        if (state.pairing || state.connected) return
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
                val current = WorkspaceSession(api, api.pair(normalizedCode))
                session = current
                state = MobileWorkspaceState(connected = true, refreshing = true)
                expiration = viewModelScope.launch {
                    val remaining = Duration.between(Instant.now(), current.credentials.expiresAt).toMillis()
                    delay(remaining.coerceAtLeast(0))
                    if (session === current) expire()
                }
                refresh(current)
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

    private suspend fun refresh(current: WorkspaceSession) {
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
