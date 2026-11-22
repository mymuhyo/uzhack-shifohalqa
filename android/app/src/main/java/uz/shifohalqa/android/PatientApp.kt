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
import androidx.compose.ui.graphics.Brush
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
import androidx.compose.ui.text.font.FontFamily
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
        if (showExercise && !mobileState.restoring) {
            ExerciseScreen(mobile.takeIf { mobileState.connected }, onBack = { showExercise = false })
        } else if (mobileState.connected) {
            ConnectedPatientApp(mobile, onExercise = { showExercise = true })
        } else {
            OfflinePatientApp(demo, mobileState.message.takeUnless { showPair }, onPair = { showPair = true },
                onExercise = { showExercise = true })
        }
    }
    if (showPair && !mobileState.connected) {
        MobilePairDialog(mobileState, mobile::pair, onDismiss = { showPair = false })
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
    Row(
        Modifier.widthIn(max = 580.dp).fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(painterResource(R.drawable.shifo_mark), null, Modifier.size(38.dp), tint = Color.Unspecified)
        Text("ShifoHalqa", Modifier.weight(1f), color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Badge(label, Mint, Green)
    }
}

@Composable
internal fun Navigation(selected: PatientTab, onSelect: (PatientTab) -> Unit) {
    Row(
        Modifier.widthIn(max = 580.dp).fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(24.dp)).background(Card).border(1.dp, Border, RoundedCornerShape(24.dp))
            .padding(5.dp).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        PatientTab.entries.forEach { tab ->
            val active = tab == selected
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(19.dp))
                    .background(if (active) Mint else Color.Transparent)
                    .selectable(selected = active, role = Role.Tab, onClick = { onSelect(tab) })
                    .padding(horizontal = 6.dp, vertical = 9.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                LineIcon(tab.glyph, if (active) Green else Muted)
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
        TextButton(onClick = onPair) { Text("Veb-panelga ulash") }
        PrimaryAction("O‘tirib-turish mashqi", onClick = onExercise)
    }
}

@Composable
internal fun DayOverview(total: Int, recorded: Int) {
    val complete = total == recorded
    val shape = RoundedCornerShape(28.dp)
    Box(
        Modifier.fillMaxWidth().clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF123F33), Color(0xFF256953)))),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val origin = Offset(size.width * 0.95f, size.height * 0.53f)
            for (radius in listOf(56.dp, 78.dp, 101.dp, 124.dp)) {
                drawCircle(Color(0xFFB5E4CB).copy(alpha = 0.15f), radius.toPx(), origin, style = Stroke(1.dp.toPx()))
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Kunlik qayd", color = Color(0xFFCBEBDA), style = MaterialTheme.typography.labelLarge)
                Text(
                    if (complete) "Qayd saqlandi" else "${total - recorded} ta vazifa qoldi",
                    color = Color.White, style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            Box(Modifier.size(66.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize()) {
                    drawCircle(
                        if (complete) Color(0xFFB9E7CB) else Color(0xFF94BAA8),
                        radius = size.minDimension / 2 - 2.dp.toPx(), style = Stroke(2.dp.toPx()),
                    )
                }
                if (complete) LineIcon(Glyph.Check, Color(0xFFE7F8EF))
                else Text("$recorded/$total", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
internal fun MedicationCard(
    title: String, displayTime: String, entry: MedicationEntry?,
    onRecord: (MedicationSheet) -> Unit, onReply: (() -> Unit)?, enabled: Boolean = true,
    boxAvailable: Boolean = false, boxDone: Boolean = false, onDorimos: (() -> Unit)? = null,
) {
    PatientCard {
        Row(horizontalArrangement = Arrangement.spacedBy(13.dp), verticalAlignment = Alignment.CenterVertically) {
            IconTile(Glyph.Pill)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("Dori qabuli", color = Muted, style = MaterialTheme.typography.labelLarge)
                SectionTitle(title)
                Text(displayTime, color = Muted, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (entry == null) {
            PrimaryAction("Ichdim", enabled = enabled) { onRecord(MedicationSheet.Taken) }
            OutlinedButton(onClick = { onRecord(MedicationSheet.Missed) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                Text("Icha olmadim", Modifier.padding(vertical = 5.dp), style = MaterialTheme.typography.titleSmall)
            }
        } else {
            Badge(entry.status, if (entry.reason == null) Mint else Amber, if (entry.reason == null) Green else AmberInk)
            entry.reason?.let { Text(it.label, color = Muted, style = MaterialTheme.typography.bodyLarge) }
            if (onReply != null) {
                PrimaryAction(if (entry.replyShown) "Javobni o‘qish" else "Qaydni ko‘rish", onClick = onReply)
            }
        }
        if (boxDone) {
            Badge("DoriMos: quti tekshirildi ✓", Mint, Green)
        } else if (boxAvailable && onDorimos != null) {
            OutlinedButton(onClick = onDorimos, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
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
    Text(title, Modifier.semantics { heading() }, color = Ink, fontFamily = FontFamily.Serif,
        fontSize = 35.sp, lineHeight = 41.sp, letterSpacing = (-1).sp)
}

@Composable
internal fun SectionTitle(title: String) {
    Text(title, Modifier.semantics { heading() }, color = Ink,
        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
}

@Composable
internal fun PatientCard(content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(27.dp)
    Column(
        Modifier.fillMaxWidth().background(Card, shape).border(1.dp, Border, shape).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) { content() }
}

@Composable
internal fun Badge(label: String, background: Color, foreground: Color) {
    Text(label, Modifier.background(background, RoundedCornerShape(12.dp)).padding(horizontal = 10.dp, vertical = 5.dp),
        color = foreground, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
}

@Composable
internal fun PrimaryAction(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    Button(
        onClick = onClick, enabled = enabled, interactionSource = interaction,
        shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().pressResponse(interaction),
    ) {
        Text(label, Modifier.padding(vertical = 7.dp), style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
internal fun IconTile(glyph: Glyph) {
    Box(Modifier.size(49.dp).background(Mint, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
        LineIcon(glyph, Green)
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
