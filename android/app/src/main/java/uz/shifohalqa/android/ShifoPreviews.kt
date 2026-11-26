package uz.shifohalqa.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

private val sampleBpTargets = BpTargets(
    maxSystolic = 140,
    maxDiastolic = 90,
    warnSystolic = 130,
    warnDiastolic = 85,
    minSystolic = 90,
    minDiastolic = 60,
)

private val sampleMobileDay = MobileDay(
    patientName = "Anvar Toshmatov",
    date = "2026-11-26",
    isDemo = false,
    tasks = listOf(
        MobileTask(
            id = "task-1",
            title = "Amlodipin",
            time = "08:00",
            strength = 5.0,
            strengthUnit = "mg",
            record = MobileRecord("rec-1", null, null),
            boxAvailable = true,
            boxDone = true,
        ),
        MobileTask(
            id = "task-2",
            title = "Levotiroksin",
            time = "08:00",
            strength = 50.0,
            strengthUnit = "mcg",
            record = null,
            boxAvailable = true,
            boxDone = false,
        ),
        MobileTask(
            id = "task-3",
            title = "Amlodipin",
            time = "20:00",
            strength = 5.0,
            strengthUnit = "mg",
            record = null,
            boxAvailable = true,
            boxDone = false,
        ),
    ),
    replies = listOf(
        MobileReply(
            recordId = "rec-bp-1",
            taskTitle = "Qon bosimi",
            date = "2026-11-25",
            review = MobileReview(
                body = "Bosim biroz ko‘tarilgan. Kechqurun yana tinch holatda qayta o‘lchab qo‘ying.",
                needsRetake = true,
                reviewedAt = "2026-11-25T14:20:00Z",
            ),
        ),
    ),
    steps = MobileStepSummary(
        count = 3420,
        goal = 4000,
        achieved = false,
        source = "device_sensor",
        updatedAt = "2026-11-26T10:00:00Z",
        bySource = MobileStepsBySource(
            deviceSensor = MobileStepReading(3420, "device_sensor", "2026-11-26T10:00:00Z"),
            selfReport = MobileStepReading(2800, "self_report", "2026-11-26T09:00:00Z"),
        ),
        trend = listOf(
            MobileStepTrendPoint("2026-11-20", 3100, "device_sensor", null, null, null),
            MobileStepTrendPoint("2026-11-21", 4200, "device_sensor", null, null, null),
            MobileStepTrendPoint("2026-11-22", 2600, "self_report", null, null, null),
            MobileStepTrendPoint("2026-11-23", 4500, "device_sensor", null, null, null),
            MobileStepTrendPoint("2026-11-24", 3900, "device_sensor", null, null, null),
            MobileStepTrendPoint("2026-11-25", 4150, "device_sensor", null, null, null),
            MobileStepTrendPoint("2026-11-26", 3420, "device_sensor", null, null, null),
        ),
    ),
    medicationAdherence = listOf(
        MedicationAdherenceSummary(
            medicationName = "Amlodipin",
            strength = 5.0,
            strengthUnit = "mg",
            times = listOf("08:00", "20:00"),
            today = MedicationAdherenceCounts(2, 1, 0, 1),
            week = MedicationAdherenceCounts(14, 12, 1, 1),
        ),
        MedicationAdherenceSummary(
            medicationName = "Levotiroksin",
            strength = 50.0,
            strengthUnit = "mcg",
            times = listOf("08:00"),
            today = MedicationAdherenceCounts(1, 0, 0, 1),
            week = MedicationAdherenceCounts(7, 7, 0, 0),
        ),
    ),
    bpTargets = sampleBpTargets,
    vitalsTask = MobileVitalsTask(
        id = "vitals-1",
        title = "Qon bosimi",
        time = "09:00",
        status = "pending",
        record = null,
    ),
    bpHistory = listOf(
        MobileBpHistoryPoint("bp-1", "2026-11-24", 126, 82, false, 0, false),
        MobileBpHistoryPoint("bp-2", "2026-11-25", 136, 88, false, 4, true),
        MobileBpHistoryPoint("bp-3", "2026-11-26", 118, 76, false, 0, false),
    ),
)

private val sampleBrief = PatientClinicalBrief(
    id = "brief-1",
    briefDate = "2026-11-26",
    approvedReplyUz = "Assalomu alaykum, Anvar aka. Oxirgi 7 kunda dorilarni muntazam qabul qilgansiz. Kechagi bosim biroz yuqori chiqqani uchun bugun ham tinch holatda o‘lchab boring.",
    approvedAt = "2026-11-26T06:30:00Z",
)

@Composable
private fun PreviewTodayScaffold(themeMode: ThemeMode, largeText: Boolean = false) {
    ShifoTheme(themeMode = themeMode, largeText = largeText) {
        val colors = ShifoThemeTokens.colors
        Column(Modifier.fillMaxSize().background(colors.background)) {
            ShifoTopBar(badgeLabel = "Klinika", badgeTone = ShifoTone.Accent, onEmergency103 = {}, onOpenSettings = {})
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                PatientPage {
                    ConnectedTodayContent(
                        state = MobileWorkspaceState(connected = true, isDemo = false, day = sampleMobileDay, brief = sampleBrief),
                        steps = StepUi(count = 3420, goal = 4000, sensorAvailable = true, permissionGranted = true, synced = true),
                        exercise = ExerciseUi(planLoaded = true, plan = ExercisePlan("rx-1", 100, 5, PoseMovement.ChairStand, 1)),
                        onRequestStepPermission = {},
                        onSimulateSteps = {},
                        onSaveManualSteps = { null },
                        onRecordMedication = { _, _ -> },
                        onDorimos = {},
                        onRecordVitals = { _, _, _, _ -> null },
                        onReply = {},
                        onOpenExercise = {},
                        onEmergency103 = {},
                    )
                }
            }
            ShifoBottomBar(selected = PatientTab.Today, onSelect = {})
        }
    }
}

@Composable
private fun PreviewReportScaffold(themeMode: ThemeMode) {
    ShifoTheme(themeMode = themeMode) {
        val colors = ShifoThemeTokens.colors
        Column(Modifier.fillMaxSize().background(colors.background)) {
            ShifoTopBar(badgeLabel = "Klinika", badgeTone = ShifoTone.Accent, onEmergency103 = {}, onOpenSettings = {})
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                PatientPage {
                    RepliesReportSection(day = sampleMobileDay, brief = sampleBrief, focusedReplyId = null)
                }
            }
            ShifoBottomBar(selected = PatientTab.Reply, onSelect = {})
        }
    }
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
internal fun TodayScreenLightPreview() {
    PreviewTodayScaffold(ThemeMode.Light)
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
internal fun TodayScreenDarkPreview() {
    PreviewTodayScaffold(ThemeMode.Dark)
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
internal fun TodayScreenLargeTextPreview() {
    PreviewTodayScaffold(ThemeMode.Light, largeText = true)
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
internal fun RepliesReportLightPreview() {
    PreviewReportScaffold(ThemeMode.Light)
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
internal fun RepliesReportDarkPreview() {
    PreviewReportScaffold(ThemeMode.Dark)
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
internal fun ExerciseStudioLightPreview() {
    ShifoTheme(themeMode = ThemeMode.Light) {
        ExerciseScreen(mobile = null, onBack = {}, onOpenSettings = {})
    }
}

@Preview(showBackground = true, widthDp = 412, heightDp = 915)
@Composable
internal fun ExerciseStudioDarkPreview() {
    ShifoTheme(themeMode = ThemeMode.Dark) {
        ExerciseScreen(mobile = null, onBack = {}, onOpenSettings = {})
    }
}

@Preview(showBackground = true, widthDp = 412, heightDp = 640)
@Composable
internal fun DualAuthLightPreview() {
    ShifoTheme(themeMode = ThemeMode.Light) {
        Box(Modifier.fillMaxSize().background(ShifoThemeTokens.colors.background)) {
            AuthConnectDialog(
                state = MobileWorkspaceState(),
                defaultOrigin = LOCAL_DEMO_ORIGIN,
                onPair = { _, _ -> },
                onClinicLogin = { _, _, _ -> },
                onDismiss = {},
            )
        }
    }
}

@Preview(showBackground = true, widthDp = 412, heightDp = 640)
@Composable
internal fun DualAuthDarkPreview() {
    ShifoTheme(themeMode = ThemeMode.Dark) {
        Box(Modifier.fillMaxSize().background(ShifoThemeTokens.colors.background)) {
            AuthConnectDialog(
                state = MobileWorkspaceState(),
                defaultOrigin = LOCAL_DEMO_ORIGIN,
                onPair = { _, _ -> },
                onClinicLogin = { _, _, _ -> },
                onDismiss = {},
            )
        }
    }
}
