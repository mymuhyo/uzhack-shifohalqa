package uz.shifohalqa.android

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlinx.coroutines.launch

@Composable
internal fun OfflineTodayPage(
    entry: MedicationEntry?,
    notice: String?,
    onRecord: (MedicationSheet) -> Unit,
    onReply: () -> Unit,
    onPair: () -> Unit,
    onExercise: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    PatientPage {
        SoftReveal(0) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PageTitle("Bugungi vazifalar")
                Text("Assalomu alaykum, Anvar aka", color = colors.inkVariant, style = MaterialTheme.typography.bodyLarge)
            }
        }
        if (notice != null) PatientNotice(notice, tone = ShifoTone.Warn)
        SoftReveal(45) { DayOverviewCard(total = 1, recorded = if (entry == null) 0 else 1, bpSummary = null, stepsSummary = null) }
        SoftReveal(90) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionTitle("Rejangiz")
                MedicationCard(
                    title = DEMO_MEDICATION_TITLE,
                    displayTime = "08:00  ·  Ertalab",
                    strengthLabel = null,
                    entry = entry,
                    onRecord = onRecord,
                    onReply = onReply.takeIf { entry?.reason == MissedReason.OUT_OF_SUPPLY },
                )
            }
        }
        TextButton(onClick = onPair) { Text("Veb-panelga ulash") }
        PrimaryAction("O‘tirib-turish mashqi", onClick = onExercise)
    }
}

@Composable
internal fun ConnectedTodayContent(
    state: MobileWorkspaceState,
    steps: StepUi,
    exercise: ExerciseUi,
    onRequestStepPermission: () -> Unit,
    onSimulateSteps: () -> Unit,
    onSaveManualSteps: suspend (Int) -> String?,
    onRecordMedication: (MobileTask, MedicationSheet) -> Unit,
    onDorimos: (MobileTask) -> Unit,
    onRecordVitals: suspend (String, Int?, Int?, Boolean) -> String?,
    onReply: (String) -> Unit,
    onOpenExercise: () -> Unit,
    onEmergency103: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    val day = state.day

    SoftReveal(0) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PageTitle("Bugungi vazifalar")
            if (day != null) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Assalomu alaykum, ${day.patientName}",
                        color = colors.inkVariant,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        displayDate(day.date),
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
                if (day.isDemo) {
                    ShifoPill("Demo · sintetik bemor tarixi", ShifoTone.Neutral)
                }
            }
        }
    }

    if (day == null) {
        ShifoTonalCard {
            SectionTitle("Ma’lumot yuklanmoqda…")
            Text("Veb-panel bilan aloqa o‘rnatilmoqda.", color = colors.inkMuted)
        }
        return
    }

    val totalTasks = day.tasks.size + (if (day.vitalsTask != null) 1 else 0)
    val doneTasks = day.tasks.count { it.record != null } + (if (day.vitalsTask?.record != null) 1 else 0)
    val bpQuick = day.vitalsTask?.record?.let { r ->
        if (r.systolic != null && r.diastolic != null) "${r.systolic}/${r.diastolic} mmHg"
        else if (r.chestPain) "Ko‘krak og‘rig‘i"
        else null
    }
    val stepQuick = day.steps?.let { "${it.count}/${it.goal} qadam" }

    SoftReveal(40) {
        DayOverviewCard(
            total = totalTasks.coerceAtLeast(1),
            recorded = doneTasks,
            bpSummary = bpQuick,
            stepsSummary = stepQuick,
        )
    }

    // Time-grouped multi-medication schedule
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Dori rejangiz")
        if (day.tasks.isEmpty()) {
            ShifoCard {
                Text("Bugunga dori vazifasi yo‘q", color = colors.ink, style = MaterialTheme.typography.titleMedium)
                Text("Shifokor reja qo‘shgach, shu yerda ko‘rinadi.", color = colors.inkMuted, style = MaterialTheme.typography.bodyMedium)
            }
        } else {
            val grouped = remember(day.tasks) {
                day.tasks.sortedBy { it.time }.groupBy { it.time }
            }
            grouped.forEach { (slotTime, slotTasks) ->
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        ShifoPill(slotTime, ShifoTone.Accent)
                        Text(timeOfDayLabel(slotTime), color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
                    }
                    slotTasks.forEach { task ->
                        key(task.id) {
                            val record = task.record
                            val reviewAction: (() -> Unit)? = if (record?.reply == null) null else { { onReply(record.id) } }
                            val strengthText = formatStrength(task.strength, task.strengthUnit).takeIf { it.isNotEmpty() }
                            MedicationCard(
                                title = task.title,
                                displayTime = task.time,
                                strengthLabel = strengthText,
                                entry = record?.let { MedicationEntry(it.reason, replyShown = it.reply != null) },
                                onRecord = { onRecordMedication(task, it) },
                                onReply = reviewAction,
                                enabled = !state.refreshing && !state.saving,
                                boxAvailable = task.boxAvailable,
                                boxDone = task.boxDone,
                                onDorimos = { onDorimos(task) },
                            )
                        }
                    }
                }
            }
        }
    }

    // Manual Blood Pressure (High + Low thresholds)
    day.vitalsTask?.let { vt ->
        ManualBpCard(
            task = vt,
            targets = day.bpTargets,
            history = day.bpHistory,
            saving = state.vitalsSaving,
            onSubmit = { sys, dia, pain -> onRecordVitals(vt.id, sys, dia, pain) },
            onOpenReply = vt.record?.reply?.let { { onReply(vt.record.id) } },
            onEmergency103 = onEmergency103,
        )
    }

    // Dual-source Steps + 7-day visual trend
    DualSourceStepsCard(
        steps = steps,
        serverSteps = day.steps,
        isDemo = day.isDemo,
        savingManual = state.manualStepsSaving,
        onRequestPermission = onRequestStepPermission,
        onSimulateSteps = onSimulateSteps,
        onSaveManualSteps = onSaveManualSteps,
    )

    // Quick launch to Rehabilitation Exercise Studio
    ShifoTonalCard(accent = true) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(ShifoIcons.Exercise, contentDescription = null, modifier = Modifier.size(20.dp), tint = colors.primary)
            Column(Modifier.weight(1f)) {
                Text("Reabilitatsiya mashqlari", color = colors.ink, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                Text(
                    exercise.plan?.let { "${it.movement.titleUz} · ${it.targetReps} takror" }
                        ?: "3 ta harakat · tayyor namuna, kamera yoki video",
                    color = colors.inkVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        PrimaryAction(
            label = exercise.plan?.movement?.titleUz ?: "Mashqlarni ochish",
            onClick = onOpenExercise,
        )
    }

    SafetyBar(onPain = onOpenExercise, onEmergency103 = onEmergency103)
}

@Composable
internal fun DayOverviewCard(
    total: Int,
    recorded: Int,
    bpSummary: String?,
    stepsSummary: String?,
) {
    val colors = ShifoThemeTokens.colors
    val complete = total > 0 && recorded >= total
    ShifoTonalCard(accent = true) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Kunlik qayd", color = colors.primary, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
                Text(
                    text = if (complete) "Qayd saqlandi" else "${(total - recorded).coerceAtLeast(0)} ta vazifa qoldi",
                    color = colors.ink,
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                if (bpSummary != null || stepsSummary != null) {
                    val parts = listOfNotNull(bpSummary?.let { "Bosim: $it" }, stepsSummary).joinToString(" · ")
                    Text(parts, color = colors.inkVariant, style = MaterialTheme.typography.bodyMedium)
                }
            }
            DailyProgressRing(total = total, recorded = recorded)
        }
    }
}

@Composable
internal fun MedicationCard(
    title: String,
    displayTime: String,
    strengthLabel: String?,
    entry: MedicationEntry?,
    onRecord: (MedicationSheet) -> Unit,
    onReply: (() -> Unit)?,
    enabled: Boolean = true,
    boxAvailable: Boolean = false,
    boxDone: Boolean = false,
    onDorimos: (() -> Unit)? = null,
) {
    val colors = ShifoThemeTokens.colors
    ShifoCard(Modifier.animateContentSize()) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(ShifoRadiusMd))
                    .background(colors.surfaceLow)
                    .border(1.dp, colors.outlineVariant, RoundedCornerShape(ShifoRadiusMd)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(ShifoIcons.Pill, contentDescription = null, modifier = Modifier.size(20.dp), tint = colors.primary)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(title, color = colors.ink, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    if (strengthLabel != null) {
                        ShifoPill(strengthLabel, ShifoTone.Neutral)
                    }
                }
                Text(displayTime, color = colors.inkMuted, style = MaterialTheme.typography.bodyMedium)
            }
            if (entry != null) {
                ShifoPill(
                    label = entry.status,
                    tone = if (entry.reason == null) ShifoTone.Ok else ShifoTone.Warn,
                )
            }
        }

        if (entry == null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryAction("Ichdim", enabled = enabled, modifier = Modifier.weight(1f), withHaptic = true) {
                    onRecord(MedicationSheet.Taken)
                }
                ShifoOutlineButton(
                    label = "Icha olmadim",
                    enabled = enabled,
                    modifier = Modifier.weight(1f),
                    onClick = { onRecord(MedicationSheet.Missed) },
                )
            }
        } else {
            entry.reason?.let {
                Text("Sabab: ${it.label}", color = colors.inkVariant, style = MaterialTheme.typography.bodyMedium)
            }
            if (onReply != null) {
                PrimaryAction(if (entry.replyShown) "Javobni o‘qish" else "Qaydni ko‘rish", onClick = onReply)
            }
        }

        if (boxDone) {
            ShifoPill("DoriMos: quti tekshirildi ✓", ShifoTone.Ok)
        } else if (boxAvailable && onDorimos != null) {
            ShifoOutlineButton(
                label = "DoriMos · qutini kamera bilan tekshirish",
                enabled = enabled,
                onClick = onDorimos,
            )
        }
    }
}

@Composable
private fun ManualBpCard(
    task: MobileVitalsTask,
    targets: BpTargets?,
    history: List<MobileBpHistoryPoint>,
    saving: Boolean,
    onSubmit: suspend (Int?, Int?, Boolean) -> String?,
    onOpenReply: (() -> Unit)?,
    onEmergency103: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    val haptic = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()

    var systolicText by rememberSaveable(task.id) { mutableStateOf("") }
    var diastolicText by rememberSaveable(task.id) { mutableStateOf("") }
    var chestPain by rememberSaveable(task.id) { mutableStateOf(false) }
    var errorMsg by remember(task.id) { mutableStateOf<String?>(null) }

    val sys = systolicText.toIntOrNull()
    val dia = diastolicText.toIntOrNull()
    val previewZone = evaluateBpZone(sys, dia, chestPain, targets)
    val canSubmit = !saving && task.record == null && (
        (sys != null && dia != null && previewZone?.invalid != true) ||
            (chestPain && systolicText.isBlank() && diastolicText.isBlank())
        )

    ShifoCard(Modifier.animateContentSize()) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(ShifoIcons.HeartPulse, contentDescription = null, modifier = Modifier.size(19.dp), tint = colors.primary)
                Column {
                    SectionTitle("Qon bosimi (qo‘lda)")
                    Text("Jadval · ${task.time}", color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
                }
            }
            val savedRec = task.record
            if (savedRec != null) {
                val savedZone = evaluateBpZone(savedRec.systolic, savedRec.diastolic, savedRec.chestPain, targets)
                ShifoPill(
                    label = savedZone?.labelUz ?: "Saqlandi",
                    tone = when (savedZone?.tone) {
                        BpZoneTone.Urgent -> ShifoTone.Urgent
                        BpZoneTone.Warn -> ShifoTone.Warn
                        else -> ShifoTone.Ok
                    },
                )
            }
        }

        val saved = task.record
        if (saved != null) {
            val savedZone = evaluateBpZone(saved.systolic, saved.diastolic, saved.chestPain, targets)
            val readingTitle = if (saved.systolic != null && saved.diastolic != null) {
                "${saved.systolic}/${saved.diastolic} mmHg"
            } else {
                "Ko‘krak og‘rig‘i qaydi"
            }
            ShifoTonalCard {
                Text(
                    readingTitle,
                    color = colors.ink,
                    style = MaterialTheme.typography.headlineSmall.copy(fontFeatureSettings = "tnum"),
                )
                if (saved.chestPain) {
                    ShifoPill("Ko‘krak og‘rig‘i belgilandi", ShifoTone.Urgent)
                }
                savedZone?.let {
                    Text(it.textUz, color = colors.inkVariant, style = MaterialTheme.typography.bodyMedium)
                }
                Text("Daraja: L${saved.level} · qo‘lda o‘lchov", color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
                if (savedZone?.tone == BpZoneTone.Urgent) {
                    ShifoOutlineButton(label = "Tez yordam · 103", urgent = true, onClick = onEmergency103)
                }
                if (onOpenReply != null) {
                    PrimaryAction("Shifokor javobini ko‘rish", onClick = onOpenReply)
                }
            }
        } else {
            BpZoneGauge(targets = targets, systolic = sys, diastolic = dia)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = systolicText,
                    onValueChange = { next ->
                        if (next.length <= 3 && next.all { it in '0'..'9' }) {
                            systolicText = next
                            errorMsg = null
                        }
                    },
                    modifier = Modifier.weight(1f),
                    label = { Text("Yuqori (sistolik)") },
                    placeholder = { Text("120") },
                    singleLine = true,
                    enabled = !saving,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    value = diastolicText,
                    onValueChange = { next ->
                        if (next.length <= 3 && next.all { it in '0'..'9' }) {
                            diastolicText = next
                            errorMsg = null
                        }
                    },
                    modifier = Modifier.weight(1f),
                    label = { Text("Pastki (diastolik)") },
                    placeholder = { Text("80") },
                    singleLine = true,
                    enabled = !saving,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(ShifoRadiusMd))
                    .background(if (chestPain) colors.urgentBg else colors.surfaceLow)
                    .border(
                        1.dp,
                        if (chestPain) colors.urgent.copy(alpha = 0.4f) else colors.outlineVariant,
                        RoundedCornerShape(ShifoRadiusMd),
                    )
                    .clickable(enabled = !saving, role = Role.Checkbox) { chestPain = !chestPain }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Checkbox(checked = chestPain, onCheckedChange = null, enabled = !saving)
                Text("Ko‘krak og‘rig‘i bor", color = if (chestPain) colors.urgent else colors.ink, style = MaterialTheme.typography.bodyLarge)
            }

            AnimatedVisibility(visible = previewZone != null) {
                previewZone?.let { zone ->
                    val tone = when (zone.tone) {
                        BpZoneTone.Urgent -> ShifoTone.Urgent
                        BpZoneTone.Warn -> ShifoTone.Warn
                        BpZoneTone.Ok -> ShifoTone.Ok
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        PatientNotice("${zone.labelUz}: ${zone.textUz}", tone = tone)
                        if (zone.tone == BpZoneTone.Urgent && !zone.invalid) {
                            ShifoOutlineButton(label = "Tez yordam · 103", urgent = true, onClick = onEmergency103)
                        }
                    }
                }
            }

            errorMsg?.let { PatientNotice(it, tone = ShifoTone.Urgent) }

            PrimaryAction(
                label = if (saving) "Saqlanmoqda…" else "Bosimni saqlash",
                enabled = canSubmit,
                withHaptic = true,
            ) {
                scope.launch {
                    val err = onSubmit(sys, dia, chestPain)
                    if (err == null) {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    } else {
                        errorMsg = err
                    }
                }
            }
        }

        if (history.isNotEmpty()) {
            HorizontalDivider(thickness = 1.dp, color = colors.outlineVariant)
            BpSevenDayMiniChart(history = history, targets = targets)
        }
    }
}

@Composable
private fun DualSourceStepsCard(
    steps: StepUi,
    serverSteps: MobileStepSummary?,
    isDemo: Boolean,
    savingManual: Boolean,
    onRequestPermission: () -> Unit,
    onSimulateSteps: () -> Unit,
    onSaveManualSteps: suspend (Int) -> String?,
) {
    val colors = ShifoThemeTokens.colors
    val scope = rememberCoroutineScope()
    var showManualInput by rememberSaveable { mutableStateOf(false) }
    var manualText by rememberSaveable { mutableStateOf("") }
    var manualError by remember { mutableStateOf<String?>(null) }

    val goal = (serverSteps?.goal ?: steps.goal).coerceAtLeast(1)
    val sensorCount = serverSteps?.bySource?.deviceSensor?.count
        ?: if (steps.source == "device_sensor") steps.count else 0
    val manualCount = serverSteps?.bySource?.selfReport?.count
    val displayCount = serverSteps?.count ?: steps.count
    val progress = (displayCount.toFloat() / goal.toFloat()).coerceIn(0f, 1f)
    val achieved = displayCount >= goal

    ShifoCard(Modifier.animateContentSize()) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(ShifoIcons.Steps, contentDescription = null, modifier = Modifier.size(19.dp), tint = colors.primary)
                SectionTitle("Qadamlar va 7 kunlik trend")
            }
            ShifoPill(
                label = if (achieved) "Maqsad bajarildi" else "Jarayonda",
                tone = if (achieved) ShifoTone.Ok else ShifoTone.Warn,
            )
        }

        Text(
            "$displayCount / $goal qadam",
            color = colors.ink,
            style = MaterialTheme.typography.headlineSmall.copy(fontFeatureSettings = "tnum"),
        )
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.fillMaxWidth(),
            color = if (achieved) colors.ok else colors.primary,
            trackColor = colors.surfaceLow,
            drawStopIndicator = {},
        )

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ShifoTonalCard(Modifier.weight(1f)) {
                Text("Telefon sensori", color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
                Text(
                    "$sensorCount",
                    color = colors.ink,
                    style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    when {
                        steps.syncing -> "Sinxronlanmoqda…"
                        steps.syncError != null -> "Oflayn navbatda"
                        steps.sensorAvailable && steps.permissionGranted -> "Auto-sync"
                        else -> "Ruxsat kutilmoqda"
                    },
                    color = colors.inkMuted,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            ShifoTonalCard(Modifier.weight(1f)) {
                Text("Qo‘lda kiritilgan", color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
                Text(
                    manualCount?.toString() ?: "—",
                    color = colors.ink,
                    style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.SemiBold,
                )
                Text("Mustaqil qayd (L0)", color = colors.inkMuted, style = MaterialTheme.typography.labelMedium)
            }
        }

        if (serverSteps?.trend?.isNotEmpty() == true) {
            SevenDayStepsChart(trend = serverSteps.trend, goal = goal)
        }

        if (steps.sensorAvailable && !steps.permissionGranted) {
            ShifoOutlineButton(label = "Telefon qadam sensorini yoqish", onClick = onRequestPermission)
        }

        TextButton(onClick = { showManualInput = !showManualInput }) {
            Text(if (showManualInput) "Qo‘lda kiritishni yopish" else "Qo‘lda qadam kiritish")
        }

        AnimatedVisibility(visible = showManualInput) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = manualText,
                    onValueChange = { next ->
                        if (next.length <= 6 && next.all { it in '0'..'9' }) {
                            manualText = next
                            manualError = null
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Bugungi qo‘lda qadam soni") },
                    singleLine = true,
                    enabled = !savingManual,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                manualError?.let { PatientNotice(it, tone = ShifoTone.Urgent) }
                val parsedCount = manualText.toIntOrNull()
                SecondaryAction(
                    label = if (savingManual) "Saqlanmoqda…" else "Qo‘lda qadamni saqlash",
                    enabled = parsedCount != null && !savingManual,
                ) {
                    val count = parsedCount ?: return@SecondaryAction
                    scope.launch {
                        val err = onSaveManualSteps(count)
                        if (err == null) {
                            manualText = ""
                            showManualInput = false
                        } else {
                            manualError = err
                        }
                    }
                }
            }
        }

        if (isDemo) {
            ShifoOutlineButton(label = "+500 qadam qo‘shish (demo simulyatsiya)", onClick = onSimulateSteps)
        }
    }
}

private fun timeOfDayLabel(hhmm: String): String {
    val hour = hhmm.substringBefore(':').toIntOrNull() ?: return "Jadval"
    return when {
        hour < 12 -> "Ertalab"
        hour < 17 -> "Kunduzi"
        else -> "Kechqurun"
    }
}

private val dateFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy")
private val reviewTimeFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy · HH:mm").withZone(ZoneId.of("Asia/Tashkent"))

internal fun displayDate(value: String): String = try {
    LocalDate.parse(value).format(dateFormat)
} catch (_: DateTimeParseException) {
    value
}

internal fun displayReviewTime(value: String): String = try {
    reviewTimeFormat.format(Instant.parse(value))
} catch (_: DateTimeParseException) {
    value
}
