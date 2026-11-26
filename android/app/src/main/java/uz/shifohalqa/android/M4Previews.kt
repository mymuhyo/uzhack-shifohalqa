package uz.shifohalqa.android

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

private val previewTargets = BpTargets(140, 90, 160, 100, 90, 60)
private val previewDay = MobileDay(
    patientName = "Malika", date = "2026-11-26",
    tasks = listOf(
        MobileTask("aml-morning", "Amlodipin", "08:00", null, boxAvailable = true, strength = "5 mg"),
        MobileTask("metformin", "Metformin", "08:00", MobileRecord("dose", null, null), strength = "500 mg"),
        MobileTask("aml-evening", "Amlodipin", "20:00", null, strength = "5 mg"),
    ),
    replies = listOf(MobileReply("dose", "Metformin", "2026-11-26",
        MobileReview("Qaydingizni ko‘rib chiqdim. Rejadagi o‘lchovlarni davom ettiring.", false, "2026-11-26T04:30:00Z"))),
    vitals = MobileVitals("bp", "09:00", MobilePressure("bp-1", 88, 58, false, null)),
    bpTargets = previewTargets,
    steps = MobileStepSummary(3400, 4500, false, "device_sensor", null, deviceSensor = 3400, selfReport = 2900,
        trend = listOf(1400, null, 3100, 2700, 4900, 2200, 3400).mapIndexed { index, count ->
            StepPoint("2026-11-${20 + index}", count)
        }),
    adherence = listOf(MobileAdherence("Amlodipin", "5 mg", 11, 1, 2), MobileAdherence("Metformin", "500 mg", 6, 0, 1)),
)
private val previewState = MobileWorkspaceState(
    connected = true, day = previewDay,
    brief = MobileBrief("Hafta qaydlaringizni ko‘rib chiqdim. Keyingi uchrashuvda bosim o‘lchovlarini muhokama qilamiz.",
        "2026-11-26T04:30:00Z"),
)

@Composable
private fun PreviewPatient(dark: Boolean, large: Boolean, tab: PatientTab, content: @Composable () -> Unit) {
    ShifoTheme(isDark = dark, largeText = large) {
        Column(Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing)) {
            BrandBar("Klinika hisobi")
            SafetyActions()
            Column(Modifier.weight(1f)) { PatientPage(content) }
            Navigation(tab) {}
        }
    }
}

@Composable
private fun PreviewToday(dark: Boolean, large: Boolean = false) =
    PreviewPatient(dark, large, PatientTab.Today) {
        ConnectedToday(previewState, StepUi(sensorAvailable = true, permissionGranted = true),
            {}, {}, {}, {}, { _, _ -> }, {}, {})
    }

@Preview(name = "Bugun · Yorug‘", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
internal fun M4TodayLight() = PreviewToday(false)

@Preview(name = "Bugun · Tungi", widthDp = 393, heightDp = 852, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
internal fun M4TodayDark() = PreviewToday(true)

@Preview(name = "Bugun · Katta matn", widthDp = 360, heightDp = 800, fontScale = 1.3f)
@Composable
internal fun M4TodayLargeText() = PreviewToday(false, true)

@Preview(name = "Javoblar · Yorug‘", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
internal fun M4RepliesLight() = PreviewPatient(false, false, PatientTab.Reply) { ConnectedReplies(previewState, null) }

@Preview(name = "Javoblar · Tungi", widthDp = 393, heightDp = 852, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
internal fun M4RepliesDark() = PreviewPatient(true, false, PatientTab.Reply) { ConnectedReplies(previewState, null) }

@Preview(name = "Javoblar · Katta matn", widthDp = 360, heightDp = 800, fontScale = 1.3f)
@Composable
internal fun M4RepliesLargeText() = PreviewPatient(false, true, PatientTab.Reply) { ConnectedReplies(previewState, null) }

@Preview(name = "Bosim · Tungi", widthDp = 393, heightDp = 852, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
internal fun M4PressureDark() = ShifoTheme(isDark = true) {
    Column(Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing)) {
        PatientPage { PressureCard(previewDay.vitals, previewTargets, true) {} }
        PressureDialog(previewTargets, initialPain = true, onDismiss = {}) { _, _, _ -> null }
    }
}

@Preview(name = "Ulash · Katta matn", widthDp = 360, heightDp = 800, fontScale = 1.3f)
@Composable
internal fun M4AuthLargeText() = ShifoTheme(isDark = false, largeText = true) {
    Column(Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing)) {
        BrandBar("Klinika hisobi")
        MobilePairDialog(MobileWorkspaceState(), { _, _ -> }, { _, _, _ -> }, {})
    }
}

@Composable
private fun PreviewExercise(dark: Boolean, large: Boolean = false) = ShifoTheme(dark, large) {
    Column(Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing)) {
        BrandBar("Namuna")
        SafetyActions()
        PatientPage {
            TextButton(onClick = {}) { Text("Bugungi vazifalar") }
            PageTitle(PoseMovement.ChairStand.titleUz)
            ExerciseVideoResultPanel(
                ExerciseVideoResult(
                    ExerciseMeasurement(2, 1, 96.0, 0.93, 72, null),
                    listOf(ExerciseCycle(2_100, 4_600, 108.0, false)), ExerciseSample.Chair.sha256,
                    ExerciseClip.PublicSample, PoseMovement.ChairStand, 100, 8_792, 7_430, PoseAccuracy.Full,
                ), null, null, false, false,
            ) {}
        }
    }
}

@Preview(name = "Mashq · Yorug‘", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
internal fun M4ExerciseLight() = PreviewExercise(false)

@Preview(name = "Mashq · Tungi", widthDp = 393, heightDp = 852, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
internal fun M4ExerciseDark() = PreviewExercise(true)

@Preview(name = "Mashq · Katta matn", widthDp = 360, heightDp = 800, fontScale = 1.3f)
@Composable
internal fun M4ExerciseLargeText() = PreviewExercise(false, true)
