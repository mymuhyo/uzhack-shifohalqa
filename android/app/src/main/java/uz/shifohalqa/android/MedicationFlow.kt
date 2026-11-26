package uz.shifohalqa.android

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

internal enum class MedicationSheet { Taken, Missed }
internal const val DEMO_MEDICATION_TITLE = "Amlodipin 5 mg"
internal const val DEMO_MEDICATION_TIME = "08:00"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RecordSheet(
    sheet: MedicationSheet,
    title: String,
    time: String,
    onDismiss: () -> Unit,
    onRecord: suspend (MissedReason?) -> String?,
) {
    val colors = ShifoThemeTokens.colors
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var reason by rememberSaveable { mutableStateOf<MissedReason?>(null) }
    var saving by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    val missed = sheet == MedicationSheet.Missed

    ModalBottomSheet(
        onDismissRequest = { if (!saving) onDismiss() },
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !saving, shouldDismissOnClickOutside = !saving),
        sheetState = state,
        sheetGesturesEnabled = !saving,
        containerColor = colors.surface,
        contentColor = colors.ink,
        shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionTitle(if (missed) "Nega icha olmadingiz?" else "Dori qabulini tasdiqlang")
            Text(
                if (missed) "$title uchun bitta sababni tanlang." else "$time dagi $title vazifasi.",
                color = colors.inkVariant,
                style = MaterialTheme.typography.bodyLarge,
            )
            if (missed) {
                Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MissedReason.entries.forEach { option ->
                        ReasonOption(option.label, selected = reason == option, enabled = !saving) { reason = option }
                    }
                }
            }
            failure?.let { PatientNotice(it, tone = ShifoTone.Urgent) }
            PrimaryAction(
                label = if (saving) "Saqlanmoqda…" else "Qaydni saqlash",
                enabled = !saving && (!missed || reason != null),
                withHaptic = true,
            ) {
                saving = true
                failure = null
                scope.launch {
                    failure = onRecord(reason)
                    if (failure == null) {
                        state.hide()
                        onDismiss()
                    }
                    saving = false
                }
            }
            TextButton(onClick = onDismiss, enabled = !saving, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text("Bekor qilish")
            }
        }
    }
}

@Composable
private fun ReasonOption(label: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val colors = ShifoThemeTokens.colors
    val shape = RoundedCornerShape(ShifoRadiusMd)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clip(shape)
            .background(if (selected) colors.surfaceAccent else colors.surfaceLow)
            .border(1.dp, if (selected) colors.primary else colors.outlineVariant, shape)
            .selectable(selected = selected, enabled = enabled, onClick = onClick, role = Role.RadioButton)
            .padding(horizontal = 13.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        RadioButton(selected = selected, onClick = null, enabled = enabled)
        Text(label, color = colors.ink, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
internal fun ReplyPage(demo: PatientDemo, onReset: () -> Unit) {
    val colors = ShifoThemeTokens.colors
    var askReset by rememberSaveable { mutableStateOf(false) }
    val entry = demo.entry
    PatientPage {
        SoftReveal(0) { PageTitle("Shifokor javobi") }
        SoftReveal(45) {
            ShifoCard {
                if (entry?.reason == MissedReason.OUT_OF_SUPPLY) {
                    AnimatedContent(
                        targetState = entry.replyShown,
                        transitionSpec = { fadeIn(tween(200, easing = SettleEasing)) togetherWith fadeOut(tween(120)) },
                        label = "Doctor reply",
                    ) { reviewed ->
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (reviewed) {
                                ShifoPill("Namuna javob", ShifoTone.Ok)
                                SectionTitle("Shifokor ko‘rib chiqdi")
                                Text(
                                    "Dori tugagani haqidagi qaydingizni ko‘rdim. Keyingi qadamni kelishish uchun qabulxonaga murojaat qiling.",
                                    color = colors.ink,
                                    style = MaterialTheme.typography.bodyLarge,
                                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                                )
                                Text("Dr. Sardor · demo", color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
                            } else {
                                ShifoPill("Qayd saqlandi", ShifoTone.Warn)
                                SectionTitle("Dori tugadi")
                                Text("Amlodipin 5 mg · 08:00", color = colors.inkMuted, style = MaterialTheme.typography.bodyLarge)
                                PrimaryAction("Namuna javobni ochish", onClick = demo::showSampleReply)
                            }
                        }
                    }
                } else {
                    SectionTitle("Hozircha javob yo‘q")
                    Text("Shifokor javobi shu yerda ko‘rinadi.", color = colors.inkMuted, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
        if (entry != null) {
            TextButton(onClick = { askReset = true }) { Text("Demoni qayta boshlash") }
        }
    }
    if (askReset) {
        AlertDialog(
            onDismissRequest = { askReset = false },
            containerColor = colors.surface,
            title = { Text("Demoni qayta boshlash?") },
            text = { Text("Shu qurilmadagi namuna qaydi o‘chadi.") },
            confirmButton = {
                TextButton(onClick = {
                    demo.reset()
                    askReset = false
                    onReset()
                }) { Text("Qayta boshlash") }
            },
            dismissButton = { TextButton(onClick = { askReset = false }) { Text("Bekor qilish") } },
        )
    }
}
