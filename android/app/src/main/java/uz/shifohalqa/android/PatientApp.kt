package uz.shifohalqa.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal enum class PatientTab(val label: String, val glyph: Glyph) {
    Today("Bugun", Glyph.Today), Reply("Javoblar", Glyph.Message),
}

@Composable
internal fun PatientApp(demo: PatientDemo, mobile: MobileWorkspaceModel) {
    val mobileState = mobile.state
    var showPair by rememberSaveable { mutableStateOf(false) }
    var showExercise by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(mobileState.connected) { if (mobileState.connected) showPair = false }

    LaunchedEffect(mobileState.connected, mobileState.restoring) {
        if (!mobileState.connected && !mobileState.restoring && mobileState.message != null) showExercise = false
    }
    key(mobileState.connected) {
        if (mobileState.restoring) {
            Box(Modifier.fillMaxSize().background(Paper), contentAlignment = Alignment.Center) {
                Text("Hisob yuklanmoqda…", color = Muted)
            }
        } else if (showExercise) {
            ExerciseScreen(mobile.takeIf { mobileState.connected }, onBack = { showExercise = false })
        } else if (mobileState.connected) {
            ConnectedPatientApp(mobile, onExercise = { showExercise = true })
        } else {
            OfflinePatientApp(demo, mobileState.message.takeUnless { showPair }, onPair = { showPair = true },
                onExercise = { showExercise = true })
        }
    }
    if (showPair && !mobileState.connected) {
        MobilePairDialog(mobileState, mobile::pair, mobile::login, onDismiss = { showPair = false })
    }
}

@Composable
private fun OfflinePatientApp(demo: PatientDemo, notice: String?, onPair: () -> Unit, onExercise: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(PatientTab.Today) }
    var sheet by remember { mutableStateOf<MedicationSheet?>(null) }
    BackHandler(enabled = tab == PatientTab.Reply && sheet == null) { tab = PatientTab.Today }

    Column(
        Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandBar("Demo")
        SafetyActions()
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            when (tab) {
                PatientTab.Today -> TodayPage(demo.entry, { sheet = it }, { tab = PatientTab.Reply }, notice, onPair, onExercise)
                PatientTab.Reply -> ReplyPage(demo, onReset = { tab = PatientTab.Today })
            }
        }
        Navigation(tab, onSelect = { tab = it })
    }
    sheet?.let { current ->
        RecordSheet(current, DEMO_MEDICATION_TITLE, DEMO_MEDICATION_TIME, onDismiss = { sheet = null }, onRecord = {
            demo.record(it)
            null
        })
    }
}

@Composable
internal fun BrandBar(label: String) {
    val preferences = LocalPatientPreferences.current
    var settings by rememberSaveable { mutableStateOf(false) }
    Row(
        Modifier.widthIn(max = 580.dp).fillMaxWidth().padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(painterResource(R.drawable.shifo_mark), null, Modifier.size(33.dp), tint = Color.Unspecified)
        Column(Modifier.weight(1f)) {
            Text("ShifoHalqa", color = Ink, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(label, color = Muted, style = MaterialTheme.typography.labelMedium)
        }
        if (preferences != null) TextButton(onClick = { settings = true }, modifier = Modifier.heightIn(min = 48.dp)) {
            Text("Sozlamalar", color = Ink)
        }
    }
    if (settings && preferences != null) PatientSettings(preferences, onDismiss = { settings = false })
}

@Composable
internal fun Navigation(selected: PatientTab, onSelect: (PatientTab) -> Unit) {
    Row(
        Modifier.widthIn(max = 580.dp).fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(11.dp)).background(Card).border(1.dp, Border, RoundedCornerShape(11.dp))
            .padding(5.dp).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        PatientTab.entries.forEach { tab ->
            val active = tab == selected
            Column(
                Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(7.dp))
                    .background(if (active) Tinted else Color.Transparent)
                    .selectable(selected = active, role = Role.Tab, onClick = { onSelect(tab) })
                    .padding(horizontal = 6.dp, vertical = 9.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                LineIcon(tab.glyph, if (active) Action else Muted)
                Text(tab.label, color = if (active) Ink else Muted, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun TodayPage(
    entry: MedicationEntry?, onRecord: (MedicationSheet) -> Unit, onReply: () -> Unit,
    notice: String?, onPair: () -> Unit, onExercise: () -> Unit,
) {
    PatientPage {
        SoftReveal(0) {
            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                PageTitle("Bugungi vazifalar")
                Text("Assalomu alaykum, Anvar aka", color = Muted, style = MaterialTheme.typography.bodyLarge)
            }
        }
        if (notice != null) PatientNotice(notice)
        SoftReveal(45) { DayOverview(total = 1, recorded = if (entry == null) 0 else 1) }
        SoftReveal(90) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionTitle("Rejangiz")
                MedicationCard(
                    title = DEMO_MEDICATION_TITLE, displayTime = "08:00  ·  Ertalab", entry = entry,
                    onRecord = onRecord, onReply = onReply.takeIf { entry?.reason == MissedReason.OUT_OF_SUPPLY },
                )
            }
        }
        OutlinedButton(shape = MaterialTheme.shapes.large, onClick = onPair, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Veb-panelga ulash", color = Ink) }
        PrimaryAction("O‘tirib-turish mashqi", onClick = onExercise)
    }
}

@Composable
internal fun DayOverview(total: Int, recorded: Int) {
    val complete = total == recorded
    val shape = RoundedCornerShape(7.dp)
    val progress = if (total == 0) 0f else recorded.toFloat() / total
    Column(
        Modifier.fillMaxWidth().background(Tinted, shape).border(1.dp, Border, shape).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Text("Kunlik qayd", color = Muted, style = MaterialTheme.typography.labelLarge)
        Text(
            if (complete) "Qayd saqlandi" else "${total - recorded} ta vazifa qoldi",
            color = Ink, style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        androidx.compose.material3.LinearProgressIndicator(
            progress = { progress }, modifier = Modifier.fillMaxWidth(),
            color = ShifoCobalt, trackColor = Border,
        )
        Text("$recorded / $total ta bajarildi", color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
internal fun MedicationCard(
    title: String, displayTime: String, entry: MedicationEntry?,
    onRecord: (MedicationSheet) -> Unit, onReply: (() -> Unit)?, enabled: Boolean = true,
    boxAvailable: Boolean = false, boxDone: Boolean = false, onDorimos: (() -> Unit)? = null,
    strength: String? = null,
) {
    PatientCard {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SectionTitle(title)
            Text(listOfNotNull(displayTime, strength).joinToString("  ·  "), color = Muted,
                style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"))
        }
        if (entry == null) {
            PrimaryAction("Ichdim", enabled = enabled) { onRecord(MedicationSheet.Taken) }
            OutlinedButton(shape = MaterialTheme.shapes.large, onClick = { onRecord(MedicationSheet.Missed) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                Text("Icha olmadim", Modifier.padding(vertical = 5.dp), style = MaterialTheme.typography.titleSmall)
            }
        } else {
            Badge(entry.status, if (entry.reason == null) Positive else Amber, if (entry.reason == null) PositiveInk else AmberInk)
            entry.reason?.let { Text(it.label, color = Muted, style = MaterialTheme.typography.bodyLarge) }
            if (onReply != null) {
                PrimaryAction(if (entry.replyShown) "Javobni o‘qish" else "Qaydni ko‘rish", onClick = onReply)
            }
        }
        if (boxDone) {
            Badge("DoriMos · quti tekshirildi", Positive, PositiveInk)
        } else if (boxAvailable && onDorimos != null) {
            OutlinedButton(shape = MaterialTheme.shapes.large, onClick = onDorimos, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("DoriMos · qutini kamera bilan tekshirish")
            }
        }
    }
}

@Composable
internal fun PatientPage(content: @Composable () -> Unit) {
    Column(
        Modifier.widthIn(max = 580.dp).fillMaxWidth().verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) { content() }
}

@Composable
internal fun PageTitle(title: String) {
    Text(title, Modifier.semantics { heading() }, color = Ink, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Normal,
        fontSize = 36.sp, lineHeight = 42.sp, letterSpacing = (-1.2).sp)
}

@Composable
internal fun SectionTitle(title: String) {
    Text(title, Modifier.semantics { heading() }, color = Ink,
        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
}

@Composable
internal fun PatientCard(content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(7.dp)
    Column(
        Modifier.fillMaxWidth().background(Card, shape).border(1.dp, Border, shape).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) { content() }
}

@Composable
internal fun Badge(label: String, background: Color, foreground: Color) {
    Text(label, Modifier.background(background, RoundedCornerShape(5.dp)).padding(horizontal = 10.dp, vertical = 5.dp),
        color = foreground, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
}

@Composable
internal fun PrimaryAction(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    Button(
        onClick = onClick, enabled = enabled, interactionSource = interaction,
        colors = ButtonDefaults.buttonColors(containerColor = ShifoCobalt, contentColor = Color.White),
        shape = RoundedCornerShape(11.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).pressResponse(interaction),
    ) {
        Text(label, Modifier.padding(vertical = 7.dp), style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
internal fun IconTile(glyph: Glyph) {
    Box(Modifier.size(49.dp).background(Tinted, RoundedCornerShape(11.dp)), contentAlignment = Alignment.Center) {
        LineIcon(glyph, Action)
    }
}

internal enum class Glyph(val data: String) {
    Today("M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2H5a2 2 0 0 1 -2 -2V7a2 2 0 0 1 2 -2 M7 3v4 M17 3v4 M3 10h18 M8 15h4 M8 18h7"),
    Message("M20 16a2 2 0 0 1 -2 2H9l-5 3v-6a2 2 0 0 1 -1 -2V6a2 2 0 0 1 2 -2h13a2 2 0 0 1 2 2z M7 9h9 M7 13h6"),
    Pill("M6 10l6 -6a5.65 5.65 0 0 1 8 8l-6 6a5.65 5.65 0 0 1 -8 -8z M9 7l8 8"),
    Check("M5 12l4.5 4.5L19 7"),
}

@Composable
private fun LineIcon(glyph: Glyph, color: Color) {
    val path = remember(glyph) { PathParser().parsePathString(glyph.data).toPath() }
    Canvas(Modifier.size(23.dp)) {
        scale(size.width / 24f, pivot = Offset.Zero) {
            drawPath(path, color, style = Stroke(1.7f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}
