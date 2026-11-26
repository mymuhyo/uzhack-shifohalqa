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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
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
    var pressureDialog by rememberSaveable { mutableStateOf<Boolean?>(null) }
    var manualSteps by rememberSaveable { mutableStateOf(false) }
    val pressureTask = state.day?.vitals
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
        BrandBar(if (state.isDemo) "Ulangan demo" else "Klinika hisobi")
        SafetyActions(onReportPain = if (pressureTask != null && pressureTask.record == null) ({ pressureDialog = true }) else null)
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
                        onPressure = { pressureDialog = false },
                        onManualSteps = { manualSteps = true },
                        onRecord = { task, type -> sheet = MobileSheetRequest(task, type) },
                        onDorimos = { task -> dorimosTask = task },
                        onReply = { recordId ->
                            focusedReplyId = recordId
                            tab = PatientTab.Reply
                        },
                    )
                    PatientTab.Reply -> ConnectedReplies(state, focusedReplyId)
                }
                state.message?.let { PatientNotice(it) }
                if (busy) {
                    PatientNotice(if (state.saving) "Qayd tekshirilmoqda…" else "Veb-panel yangilanmoqda…")
                }
                TextButton(onClick = mobile::refresh, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Yangilash") }
                if (tab == PatientTab.Today) {
                    PrimaryAction(mobile.exercise.plan?.movement?.titleUz ?: "Reabilitatsiya mashqi", onClick = onExercise)
                    TextButton(onClick = mobile::disconnect, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Hisobdan chiqish") }
                }
            }
        }
        Navigation(tab, onSelect = {
            focusedReplyId = null
            tab = it
        })
    }
    pressureDialog?.let { pain ->
        pressureTask?.let { task ->
            PressureDialog(state.day.bpTargets, pain, onDismiss = { pressureDialog = null }) { upper, lower, hasPain ->
                mobile.recordPressure(task, upper, lower, hasPain)
            }
        }
    }
    if (manualSteps) ManualStepsDialog(state.day?.steps?.selfReport, onDismiss = { manualSteps = false }, mobile::saveManualSteps)
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
internal fun ConnectedToday(
    state: MobileWorkspaceState,
    steps: StepUi,
    onRequestStepPermission: () -> Unit,
    onSimulateSteps: () -> Unit,
    onPressure: () -> Unit,
    onManualSteps: () -> Unit,
    onRecord: (MobileTask, MedicationSheet) -> Unit,
    onDorimos: (MobileTask) -> Unit,
    onReply: (String) -> Unit,
) {
    Text(state.day?.date?.let(::displayDate) ?: "Kunlik reja", color = Muted, style = MaterialTheme.typography.labelLarge)
    PageTitle("Bugungi vazifalar")
    (state.day?.patientName ?: state.patientName)?.let {
        Text("Assalomu alaykum, $it", color = Muted, style = MaterialTheme.typography.bodyLarge)
    }
    val day = state.day ?: return
    val taskCount = day.tasks.size + if (day.vitals != null) 1 else 0
    val savedCount = day.tasks.count { it.record != null } + if (day.vitals?.record != null) 1 else 0
    if (taskCount > 0) DayOverview(taskCount, savedCount)
    if (day.tasks.isNotEmpty()) SectionTitle("Dori rejangiz")
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
                strength = task.strength,
                onDorimos = { onDorimos(task) },
            )
        }
    }
    if (day.tasks.isEmpty()) PatientCard {
        SectionTitle("Dori rejangiz")
        Text("Bugunga dori qabuli rejalashtirilmagan.", color = Muted)
    }
    PressureCard(day.vitals, day.bpTargets, !state.refreshing && !state.saving, onPressure)
    DailyStepsCard(day.steps, steps, state.isDemo, !state.refreshing && !state.saving,
        onRequestStepPermission, onManualSteps, onSimulateSteps)
}

@Composable
private fun DailyStepsCard(
    summary: MobileStepSummary?, steps: StepUi, isDemo: Boolean, enabled: Boolean,
    onRequestPermission: () -> Unit, onManualSteps: () -> Unit, onSimulateSteps: () -> Unit,
) {
    val sensor = maxOf(summary?.deviceSensor ?: 0, steps.count).takeIf { it > 0 } ?: summary?.deviceSensor
    val count = sensor ?: summary?.selfReport ?: summary?.demoSim ?: summary?.count ?: 0
    val goal = summary?.goal ?: steps.goal
    PatientCard {
        SectionTitle("Bugungi qadamlar")
        Text("$count / $goal qadam", color = Ink,
            style = MaterialTheme.typography.headlineSmall.copy(fontFeatureSettings = "tnum"))
        LinearProgressIndicator(progress = { (count.toFloat() / goal.coerceAtLeast(1)).coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth(), trackColor = Border)
        Text("Telefon sensori · ${sensor?.toString() ?: "Qayd yo‘q"}", color = Muted)
        Text("Qo‘lda · ${summary?.selfReport?.toString() ?: "Qayd yo‘q"}", color = Muted)
        if (isDemo && summary?.demoSim != null) Text("Demo simulyatsiya · ${summary.demoSim}", color = Muted)
        if (count >= goal) Badge("Maqsad bajarildi", Positive, PositiveInk)
        StepsTrend(summary?.trend.orEmpty())
        if (steps.syncing) Text("Qadamlar yuborilmoqda…", color = Muted)
        steps.syncError?.let { PatientNotice(it) }
        if (steps.sensorAvailable && !steps.permissionGranted) {
            OutlinedButton(shape = MaterialTheme.shapes.large, onClick = onRequestPermission, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("Telefon sensorini yoqish", color = Ink)
            }
        }
        OutlinedButton(shape = MaterialTheme.shapes.large, onClick = onManualSteps, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text("Qadamlarni qo‘lda kiritish", color = Ink)
        }
        if (isDemo) OutlinedButton(shape = MaterialTheme.shapes.large, onClick = onSimulateSteps, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text("+500 qadam qo‘shish (demo simulyatsiya)", color = Ink)
        }
    }
}

@Composable
internal fun ConnectedReplies(state: MobileWorkspaceState, focusedReplyId: String?) {
    PageTitle("Shifokor javoblari")
    val day = state.day ?: return
    PatientCard {
        SectionTitle("7 kunlik hisobot")
        day.adherence.forEach { medication ->
            Text(listOfNotNull(medication.name, medication.strength).joinToString(" · "),
                color = Ink, style = MaterialTheme.typography.titleSmall)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AdherenceCount("Ichdim", medication.taken, Modifier.weight(1f))
                AdherenceCount("Icha olmadim", medication.missed, Modifier.weight(1f))
                AdherenceCount("Javobsiz", medication.unanswered, Modifier.weight(1f))
            }
        }
        val brief = state.brief
        if (brief != null) {
            Badge("Shifokor tasdiqlagan · L4", Positive, PositiveInk)
            Text(brief.reply, color = Ink, style = MaterialTheme.typography.bodyLarge)
            Text(displayReviewTime(brief.approvedAt), color = Muted)
        } else Text(if (state.briefError) "Hisobotni yuklab bo‘lmadi. Ulanishni tekshiring."
            else "Shifokor haftalik xulosani tasdiqlagach, shu yerda ko‘rinadi.", color = Muted)
    }
    val bpReply = day.vitals?.record?.let { record ->
        record.reply?.let { MobileReply(record.id, "Qon bosimi", day.date, it) }
    }
    val allReplies = day.replies + listOfNotNull(bpReply).filter { reply -> day.replies.none { it.recordId == reply.recordId } }
    if (allReplies.isEmpty()) {
        PatientCard {
            IconTile(Glyph.Message)
            SectionTitle("Hozircha javob yo‘q")
            Text("Shifokor qaydni ko‘rib, javob yozgach shu yerda ko‘rinadi.", color = Muted)
        }
        return
    }
    val replies = allReplies.sortedByDescending { it.recordId == focusedReplyId }
    replies.forEach { reply ->
        key(reply.recordId) {
            val retake = reply.review.needsRetake
            PatientCard {
                IconTile(Glyph.Message)
                Badge(if (retake) "Qayta ko‘rib chiqish so‘raldi" else "Shifokor ko‘rib chiqdi",
                    if (retake) Amber else Tinted, if (retake) AmberInk else Action)
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
private fun AdherenceCount(label: String, count: Int, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(count.toString(), color = Ink, style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"))
        Text(label, color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
internal fun MobilePairDialog(
    state: MobileWorkspaceState, onPair: (String, String) -> Unit,
    onLogin: (String, String, String) -> Unit, onDismiss: () -> Unit,
) {
    var address by rememberSaveable { mutableStateOf(if (BuildConfig.DEBUG) LOCAL_DEMO_ORIGIN else "") }
    var code by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var clinic by rememberSaveable { mutableStateOf(false) }
    val pairing = state.pairing
    AlertDialog(
        onDismissRequest = { if (!pairing) onDismiss() },
        properties = DialogProperties(dismissOnBackPress = !pairing, dismissOnClickOutside = !pairing),
        title = { Text("ShifoHalqaga kirish") },
        text = {
            val view = LocalView.current
            SideEffect {
                // Keep the one-time code out of the password manager's autofill structure.
                (view.parent as? DialogWindowProvider)?.window?.decorView?.importantForAutofill =
                    View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            }
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryTabRow(selectedTabIndex = if (clinic) 0 else 1) {
                    Tab(selected = clinic, onClick = { if (!pairing) { clinic = true; code = "" } },
                        modifier = Modifier.heightIn(min = 48.dp), text = { Text("Klinika") })
                    Tab(selected = !clinic, onClick = { if (!pairing) { clinic = false; password = "" } },
                        modifier = Modifier.heightIn(min = 48.dp), text = { Text("Demo") })
                }
                Text(if (clinic) "Klinikada berilgan hisobingiz bilan kiring."
                    else "Shifokor panelidan bir martalik ulash kodini oling.", color = Muted)
                OutlinedTextField(
                    value = address, onValueChange = { address = it }, modifier = Modifier.fillMaxWidth(),
                    label = { Text("Veb-panel manzili") }, singleLine = true, enabled = !pairing,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                )
                if (clinic) {
                    OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Elektron pochta") },
                        singleLine = true, enabled = !pairing,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, autoCorrectEnabled = false))
                    OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Parol") },
                        singleLine = true, enabled = !pairing, visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                } else {
                    OutlinedTextField(code, { code = it.take(32) }, Modifier.fillMaxWidth(), label = { Text("Ulash kodi") },
                        singleLine = true, enabled = !pairing, visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false))
                }
                state.message?.let { PatientNotice(it) }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (clinic) onLogin(address, email, password) else onPair(address, code) },
                enabled = !pairing && if (clinic) email.isNotBlank() && password.isNotEmpty() else code.isNotBlank(),
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(if (pairing) "Ulanmoqda…" else if (clinic) "Kirish" else "Ulash")
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

internal fun displayDate(value: String): String = try { LocalDate.parse(value).format(dateFormat) }
catch (_: DateTimeParseException) { value }

private fun displayReviewTime(value: String): String = try { reviewTimeFormat.format(Instant.parse(value)) }
catch (_: DateTimeParseException) { value }
