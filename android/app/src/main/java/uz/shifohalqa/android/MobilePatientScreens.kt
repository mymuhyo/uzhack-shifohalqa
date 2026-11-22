package uz.shifohalqa.android

import android.Manifest
import android.os.Build
import android.view.View
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private data class MobileSheetRequest(val task: MobileTask, val sheet: MedicationSheet)

@Composable
internal fun ConnectedPatientApp(mobile: MobileWorkspaceModel, onExercise: () -> Unit) {
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
    LaunchedEffect(tab) { if (tab == PatientTab.Reply) mobile.refresh() }
    BackHandler(enabled = tab == PatientTab.Reply && sheet == null) { tab = PatientTab.Today }

    Column(
        Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandBar("Ulangan demo")
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            PatientPage {
                when (tab) {
                    PatientTab.Today -> ConnectedToday(
                        state = state,
                        steps = stepState,
                        onRequestStepPermission = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                stepPermissionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
                            }
                        },
                        onSimulateSteps = { mobile.simulateSteps(500) },
                        onRecord = { task, type -> sheet = MobileSheetRequest(task, type) },
                        onDorimos = { task -> dorimosTask = task },
                        onReply = { recordId ->
                            focusedReplyId = recordId
                            tab = PatientTab.Reply
                        },
                    )
                    PatientTab.Reply -> ConnectedReplies(state.day, focusedReplyId)
                }
                state.message?.let { PatientNotice(it) }
                if (busy) {
                    PatientNotice(if (state.saving) "Qayd tekshirilmoqda…" else "Veb-panel yangilanmoqda…")
                }
                TextButton(onClick = mobile::refresh, enabled = !busy) { Text("Yangilash") }
                if (tab == PatientTab.Today) {
                    PrimaryAction(mobile.exercise.plan?.movement?.titleUz ?: "Reabilitatsiya mashqi", onClick = onExercise)
                    TextButton(onClick = mobile::disconnect, enabled = !busy) { Text("Ulanishni uzish") }
                }
            }
        }
        Navigation(tab, onSelect = {
            focusedReplyId = null
            tab = it
        })
    }
    sheet?.let { request ->
        RecordSheet(request.sheet, request.task.title, request.task.time, onDismiss = { sheet = null }) {
            mobile.record(request.task.id, it)
        }
    }
    dorimosTask?.let { task ->
        DorimosSheet(task = task, mobile = mobile, onDismiss = { dorimosTask = null })
    }
}

@Composable
private fun ConnectedToday(
    state: MobileWorkspaceState,
    steps: StepUi,
    onRequestStepPermission: () -> Unit,
    onSimulateSteps: () -> Unit,
    onRecord: (MobileTask, MedicationSheet) -> Unit,
    onDorimos: (MobileTask) -> Unit,
    onReply: (String) -> Unit,
) {
    SoftReveal(0) { PageTitle("Bugungi vazifalar") }
    val day = state.day ?: return
    Text("Assalomu alaykum, ${day.patientName}", color = Muted, style = MaterialTheme.typography.bodyLarge)
    Text(displayDate(day.date), color = Muted, style = MaterialTheme.typography.labelLarge)
    DailyStepsCard(steps, onRequestStepPermission, onSimulateSteps)
    if (day.tasks.isEmpty()) {
        PatientCard {
            SectionTitle("Bugunga dori vazifasi yo‘q")
            Text("Shifokor reja qo‘shgach, shu yerda ko‘rinadi.", color = Muted)
        }
        return
    }
    SoftReveal(45) { DayOverview(day.tasks.size, day.tasks.count { it.record != null }) }
    SectionTitle("Dori rejangiz")
    day.tasks.forEach { task ->
        key(task.id) {
            val record = task.record
            val reviewAction: (() -> Unit)? = if (record?.reply == null) null else { { onReply(record.id) } }
            MedicationCard(
                title = task.title, displayTime = task.time,
                entry = record?.let { MedicationEntry(it.reason, replyShown = it.reply != null) },
                onRecord = { onRecord(task, it) }, onReply = reviewAction,
                enabled = !state.refreshing && !state.saving,
                boxAvailable = task.boxAvailable,
                boxDone = task.boxDone,
                onDorimos = { onDorimos(task) },
            )
        }
    }
}

@Composable
private fun DailyStepsCard(
    steps: StepUi,
    onRequestPermission: () -> Unit,
    onSimulateSteps: () -> Unit,
) {
    val progress = (steps.count.toFloat() / steps.goal.coerceAtLeast(1)).coerceIn(0f, 1f)
    val sourceLabel = when (steps.source) {
        "demo_sim" -> "Demo simulyatsiya · auto-sync"
        "self_report" -> "Vebdan kiritilgan"
        else -> if (steps.sensorAvailable && steps.permissionGranted) "Telefon sensori · auto-sync" else "Qadam hisobi"
    }
    val syncLabel = when {
        steps.syncing -> "Sinxronlanmoqda…"
        steps.syncError != null -> steps.syncError
        steps.count == 0 -> "Yurish yoki simulyatsiya bilan boshlanadi"
        steps.synced -> "Shifokor paneliga yuborildi"
        else -> "Sinxronlash kutilmoqda…"
    }
    PatientCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("Bugungi qadamlar")
            Badge(
                if (steps.achieved) "Maqsad bajarildi" else "Jarayonda",
                if (steps.achieved) Mint else Amber,
                if (steps.achieved) Green else AmberInk,
            )
        }
        Text("${steps.count} / ${steps.goal} qadam", color = Ink, style = MaterialTheme.typography.headlineSmall)
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth(), color = Green, trackColor = Mint)
        Text("$sourceLabel · $syncLabel", color = Muted, style = MaterialTheme.typography.bodyMedium)
        if (steps.sensorAvailable && !steps.permissionGranted) {
            OutlinedButton(onClick = onRequestPermission, modifier = Modifier.fillMaxWidth()) {
                Text("Telefon qadam sensorini yoqish")
            }
        }
        OutlinedButton(onClick = onSimulateSteps, modifier = Modifier.fillMaxWidth()) {
            Text("+500 qadam qo‘shish (demo simulyatsiya)")
        }
    }
}

@Composable
private fun ConnectedReplies(day: MobileDay?, focusedReplyId: String?) {
    SoftReveal(0) { PageTitle("Shifokor javobi") }
    if (day == null) return
    if (day.replies.isEmpty()) {
        PatientCard {
            IconTile(Glyph.Message)
            SectionTitle("Hozircha javob yo‘q")
            Text("Shifokor qaydni ko‘rib, javob yozgach shu yerda ko‘rinadi.", color = Muted)
        }
        return
    }
    val replies = day.replies.sortedByDescending { it.recordId == focusedReplyId }
    replies.forEach { reply ->
        key(reply.recordId) {
            val retake = reply.review.needsRetake
            PatientCard {
                IconTile(Glyph.Message)
                Badge(if (retake) "Qayta ko‘rib chiqish so‘raldi" else "Shifokor ko‘rib chiqdi",
                    if (retake) Amber else Mint, if (retake) AmberInk else Green)
                SectionTitle(reply.taskTitle)
                Text("Vazifa sanasi · ${displayDate(reply.date)}", color = Muted, style = MaterialTheme.typography.labelLarge)
                Text(reply.review.body, color = Ink, style = MaterialTheme.typography.bodyLarge)
                Text("Javob yozildi · ${displayReviewTime(reply.review.reviewedAt)}", color = Muted,
                    style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
internal fun MobilePairDialog(state: MobileWorkspaceState, onPair: (String, String) -> Unit, onDismiss: () -> Unit) {
    var address by rememberSaveable { mutableStateOf(if (BuildConfig.DEBUG) LOCAL_DEMO_ORIGIN else "") }
    var code by remember { mutableStateOf("") }
    val pairing = state.pairing
    AlertDialog(
        onDismissRequest = { if (!pairing) onDismiss() },
        properties = DialogProperties(dismissOnBackPress = !pairing, dismissOnClickOutside = !pairing),
        title = { Text("Veb-panelga ulash") },
        text = {
            val view = LocalView.current
            SideEffect {
                // Keep the one-time code out of the password manager's autofill structure.
                (view.parent as? DialogWindowProvider)?.window?.decorView?.importantForAutofill =
                    View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            }
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Veb-paneldagi shifokor sahifasidan bir martalik ulash kodini oling.")
                OutlinedTextField(
                    value = address, onValueChange = { address = it }, modifier = Modifier.fillMaxWidth(),
                    label = { Text("Veb-panel manzili") }, singleLine = true, enabled = !pairing,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                )
                OutlinedTextField(
                    value = code, onValueChange = { code = it }, modifier = Modifier.fillMaxWidth(),
                    label = { Text("Ulash kodi") }, singleLine = true, enabled = !pairing,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false),
                )
                state.message?.let { PatientNotice(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = { onPair(address, code) }, enabled = !pairing && code.isNotBlank()) {
                Text(if (pairing) "Ulanmoqda…" else "Ulash")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !pairing) { Text("Bekor qilish") } },
    )
}

@Composable
internal fun PatientNotice(message: String) {
    Text(
        message,
        modifier = Modifier.fillMaxWidth().background(Amber, RoundedCornerShape(12.dp)).padding(12.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        color = AmberInk, style = MaterialTheme.typography.bodyMedium,
    )
}

private val dateFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy")
private val reviewTimeFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy · HH:mm").withZone(ZoneId.of("Asia/Tashkent"))

private fun displayDate(value: String): String = try { LocalDate.parse(value).format(dateFormat) }
catch (_: DateTimeParseException) { value }

private fun displayReviewTime(value: String): String = try { reviewTimeFormat.format(Instant.parse(value)) }
catch (_: DateTimeParseException) { value }
