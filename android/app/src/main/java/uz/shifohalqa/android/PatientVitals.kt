package uz.shifohalqa.android

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import kotlinx.coroutines.launch

private const val emergencyGuidance = "Ko‘krak og‘rig‘i yoki kuchli bosh aylanishida darhol 103 ga qo‘ng‘iroq qiling."

@Composable
internal fun SafetyActions(onReportPain: (() -> Unit)? = null) {
    val context = LocalContext.current
    var guidance by rememberSaveable { mutableStateOf(false) }
    val dial = {
        try {
            context.startActivity(Intent(Intent.ACTION_DIAL, "tel:103".toUri()))
        } catch (_: ActivityNotFoundException) {
            guidance = true
        }
    }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 2.dp)
            .background(Urgent, RoundedCornerShape(7.dp)),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = { guidance = true }, modifier = Modifier.heightIn(min = 48.dp)) {
            Text("Og‘riq bor", color = UrgentInk)
        }
        TextButton(onClick = dial, modifier = Modifier.heightIn(min = 48.dp)
            .semantics { contentDescription = "Tez yordam, 103" }) {
            Text("103", color = UrgentInk, style = MaterialTheme.typography.titleMedium)
        }
    }
    if (guidance) AlertDialog(
        onDismissRequest = { guidance = false },
        title = { Text("Shoshilinch yordam") },
        text = { Text(emergencyGuidance) },
        confirmButton = { TextButton(onClick = dial) { Text("103 ga qo‘ng‘iroq") } },
        dismissButton = {
            TextButton(onClick = {
                guidance = false
                onReportPain?.invoke()
            }) { Text(if (onReportPain != null) "Og‘riqni qayd etish" else "Yopish") }
        },
    )
}

@Composable
internal fun PressureCard(task: MobileVitals?, targets: BpTargets?, enabled: Boolean, onRecord: () -> Unit) {
    PatientCard {
        SectionTitle("Qon bosimi")
        if (task == null) {
            Text("Bugun qon bosimini o‘lchash rejalashtirilmagan.", color = Muted)
        } else {
            Text("O‘lchash vaqti · ${task.time}", color = Muted)
            val record = task.record
            if (record == null) {
                PrimaryAction("Qon bosimini kiritish", enabled, onRecord)
            } else {
                if (record.systolic != null && record.diastolic != null) {
                    Text("${record.systolic} / ${record.diastolic} mmHg",
                        style = MaterialTheme.typography.headlineSmall.copy(fontFeatureSettings = "tnum"), color = Ink)
                }
                PressureZone(targets, record.systolic, record.diastolic, record.chestPain)
                record.reply?.let {
                    Text("Shifokor javobi", style = MaterialTheme.typography.titleSmall, color = Ink)
                    Text(it.body, color = Ink)
                }
            }
        }
    }
}

@Composable
private fun PressureZone(targets: BpTargets?, systolic: Int?, diastolic: Int?, pain: Boolean) {
    val zone = targets?.zone(systolic, diastolic)
    when (zone) {
        BpZone.Low -> Badge(zone.label, Urgent, UrgentInk)
        BpZone.High -> if (targets.reachesMax(systolic, diastolic)) Badge(zone.label, Urgent, UrgentInk)
            else Badge(zone.label, Amber, AmberInk)
        BpZone.InRange -> Badge(zone.label, Positive, PositiveInk)
        null -> Unit
    }
    if (pain) Badge("Ko‘krak og‘rig‘i", Urgent, UrgentInk)
    if (pain || zone == BpZone.Low || targets?.reachesMax(systolic, diastolic) == true) {
        Text(emergencyGuidance, color = UrgentInk, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
internal fun PressureDialog(
    targets: BpTargets?, initialPain: Boolean, onDismiss: () -> Unit,
    onSave: suspend (Int?, Int?, Boolean) -> String?,
) {
    var systolic by rememberSaveable { mutableStateOf("") }
    var diastolic by rememberSaveable { mutableStateOf("") }
    var pain by rememberSaveable { mutableStateOf(initialPain) }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val upper = systolic.toIntOrNull()
    val lower = diastolic.toIntOrNull()
    val valid = validPressure(upper, lower)
    val symptomOnly = systolic.isBlank() && diastolic.isBlank() && pain
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Qon bosimini kiritish") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Tonometrdagi ikki qiymatni mmHg da kiriting.", color = Muted)
                OutlinedTextField(systolic, { if (it.length <= 3 && it.all(Char::isDigit)) systolic = it },
                    label = { Text("Sistolik") }, singleLine = true, enabled = !busy,
                    modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                OutlinedTextField(diastolic, { if (it.length <= 3 && it.all(Char::isDigit)) diastolic = it },
                    label = { Text("Diastolik") }, singleLine = true, enabled = !busy,
                    modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .toggleable(pain, enabled = !busy, role = Role.Checkbox) { pain = it },
                    horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(pain, onCheckedChange = null)
                    Text("Ko‘kragim og‘riyapti")
                }
                if (valid || pain) PressureZone(targets, upper.takeIf { valid }, lower.takeIf { valid }, pain)
                if (!valid && !symptomOnly && (systolic.isNotBlank() || diastolic.isNotBlank())) {
                    Text("Sistolik 50–260, diastolik 30–160 oralig‘ida bo‘lsin. Sistolik qiymat kattaroq bo‘lishi kerak.",
                        color = Muted, style = MaterialTheme.typography.bodySmall)
                }
                failure?.let { PatientNotice(it) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && (valid || symptomOnly), onClick = {
                busy = true
                scope.launch {
                    failure = onSave(upper, lower, pain)
                    busy = false
                    if (failure == null) onDismiss()
                }
            }) { Text(if (busy) "Saqlanmoqda…" else "Saqlash") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Bekor qilish") } },
    )
}

@Composable
internal fun StepsTrend(trend: List<StepPoint>) {
    if (trend.isEmpty()) return
    val chartInk = Action
    val emptyInk = Border
    val maximum = trend.maxOf { it.count ?: 0 }.coerceAtLeast(1)
    val summary = trend.joinToString(". ") { "${displayDate(it.date)}: ${it.count?.let { n -> "$n qadam" } ?: "qayd yo‘q"}" }
    Text("So‘nggi 7 kun", style = MaterialTheme.typography.titleSmall, color = Ink)
    Canvas(Modifier.fillMaxWidth().height(58.dp).semantics { contentDescription = summary }) {
        val slot = size.width / trend.size
        val barWidth = slot * .55f
        trend.forEachIndexed { index, point ->
            val height = point.count?.let { (it.toFloat() / maximum * size.height).coerceAtLeast(3.dp.toPx()) }
                ?: 2.dp.toPx()
            drawRoundRect(
                if (point.count == null) emptyInk else chartInk,
                topLeft = Offset(slot * index + (slot - barWidth) / 2f, size.height - height),
                size = Size(barWidth, height), cornerRadius = CornerRadius(2.dp.toPx()),
            )
        }
    }
    Row(Modifier.fillMaxWidth()) {
        trend.forEach { point ->
            Text(displayDate(point.date).take(2), modifier = Modifier.weight(1f), color = Muted,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
internal fun ManualStepsDialog(count: Int?, onDismiss: () -> Unit, onSave: suspend (Int) -> String?) {
    var value by rememberSaveable { mutableStateOf(count?.toString().orEmpty()) }
    var failure by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Qadamlarni qo‘lda kiritish") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value, { if (it.length <= 6 && it.all(Char::isDigit)) value = it },
                    label = { Text("Bugungi qadamlar") }, singleLine = true, enabled = !busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                failure?.let { PatientNotice(it) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && value.toIntOrNull() != null, onClick = {
                busy = true
                scope.launch {
                    failure = onSave(value.toInt())
                    busy = false
                    if (failure == null) onDismiss()
                }
            }) { Text(if (busy) "Saqlanmoqda…" else "Saqlash") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Bekor qilish") } },
    )
}
