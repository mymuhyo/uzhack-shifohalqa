package uz.shifohalqa.android

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.net.toUri

private data class MobileSheetRequest(val task: MobileTask, val sheet: MedicationSheet)

@Composable
internal fun ConnectedPatientApp(
    mobile: MobileWorkspaceModel,
    onOpenSettings: () -> Unit,
    onEmergency103: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    val state = mobile.state
    val stepState = mobile.steps
    var tab by rememberSaveable { mutableStateOf(PatientTab.Today) }
    var focusedReplyId by rememberSaveable { mutableStateOf<String?>(null) }
    var sheet by remember { mutableStateOf<MobileSheetRequest?>(null) }
    var dorimosTask by remember { mutableStateOf<MobileTask?>(null) }
    val busy = state.refreshing || state.saving
    val stepPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        mobile.refreshStepPermission()
    }

    LaunchedEffect(tab) {
        if (tab == PatientTab.Reply) mobile.refresh()
        if (tab == PatientTab.Exercise) mobile.refreshExercise()
    }
    BackHandler(enabled = tab != PatientTab.Today && sheet == null && dorimosTask == null) {
        tab = PatientTab.Today
    }

    if (tab == PatientTab.Exercise) {
        Column(
            Modifier
                .fillMaxSize()
                .background(colors.background)
                .windowInsetsPadding(WindowInsets.safeDrawing),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                ExerciseScreen(
                    mobile = mobile,
                    onBack = { tab = PatientTab.Today },
                    onOpenSettings = onOpenSettings,
                )
            }
            ShifoBottomBar(selected = tab, onSelect = {
                focusedReplyId = null
                tab = it
            })
        }
        return
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(colors.background)
            .windowInsetsPadding(WindowInsets.safeDrawing),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ShifoTopBar(
            badgeLabel = if (state.isDemo) "Demo" else "Klinika",
            badgeTone = if (state.isDemo) ShifoTone.Neutral else ShifoTone.Accent,
            onEmergency103 = onEmergency103,
            onOpenSettings = onOpenSettings,
        )
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            PatientPage {
                when (tab) {
                    PatientTab.Today -> ConnectedTodayContent(
                        state = state,
                        steps = stepState,
                        exercise = mobile.exercise,
                        onRequestStepPermission = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                stepPermissionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
                            }
                        },
                        onSimulateSteps = { mobile.simulateSteps(500) },
                        onSaveManualSteps = mobile::saveManualSteps,
                        onRecordMedication = { task, type -> sheet = MobileSheetRequest(task, type) },
                        onDorimos = { task -> dorimosTask = task },
                        onRecordVitals = mobile::recordVitals,
                        onReply = { recordId ->
                            focusedReplyId = recordId
                            tab = PatientTab.Reply
                        },
                        onOpenExercise = { tab = PatientTab.Exercise },
                        onEmergency103 = onEmergency103,
                    )
                    PatientTab.Reply -> RepliesReportSection(
                        day = state.day,
                        brief = state.brief,
                        focusedReplyId = focusedReplyId,
                    )
                    PatientTab.Exercise -> Unit
                }

                state.message?.let { PatientNotice(it, tone = ShifoTone.Warn) }
                if (busy) {
                    PatientNotice(
                        if (state.saving) "Qayd saqlanmoqda…" else "Veb-panel yangilanmoqda…",
                        tone = ShifoTone.Accent,
                    )
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = mobile::refresh, enabled = !busy) { Text("Yangilash") }
                    TextButton(onClick = mobile::disconnect, enabled = !busy) { Text("Ulanishni uzish") }
                }
            }
        }
        ShifoBottomBar(
            selected = tab,
            onSelect = {
                focusedReplyId = null
                tab = it
            },
        )
    }

    sheet?.let { request ->
        val strengthText = formatStrength(request.task.strength, request.task.strengthUnit)
        val fullTitle = if (strengthText.isNotEmpty()) "${request.task.title} ($strengthText)" else request.task.title
        RecordSheet(request.sheet, fullTitle, request.task.time, onDismiss = { sheet = null }) {
            mobile.record(request.task.id, it)
        }
    }
    dorimosTask?.let { task ->
        DorimosSheet(
            task = task,
            isDemo = state.isDemo,
            mobile = mobile,
            onDismiss = { dorimosTask = null },
        )
    }
}

internal fun dialEmergency103(context: Context): Boolean = try {
    context.startActivity(Intent(Intent.ACTION_DIAL, "tel:103".toUri()))
    true
} catch (_: ActivityNotFoundException) {
    Toast.makeText(context, "Tez yordam raqami 103. Telefon orqali qo‘ng‘iroq qiling.", Toast.LENGTH_LONG).show()
    false
}
