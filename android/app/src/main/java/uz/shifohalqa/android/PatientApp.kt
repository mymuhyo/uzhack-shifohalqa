package uz.shifohalqa.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext

@Composable
internal fun PatientApp(demo: PatientDemo, mobile: MobileWorkspaceModel) {
    val mobileState = mobile.state
    var showConnect by rememberSaveable { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var showOfflineExercise by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current

    LaunchedEffect(mobileState.connected) {
        if (mobileState.connected) {
            showConnect = false
            showOfflineExercise = false
        }
    }
    LaunchedEffect(mobileState.connected, mobileState.restoring) {
        if (!mobileState.connected && !mobileState.restoring && mobileState.message != null) {
            showOfflineExercise = false
        }
    }

    key(mobileState.connected) {
        if (mobileState.connected) {
            ConnectedPatientApp(
                mobile = mobile,
                onOpenSettings = { showSettings = true },
                onEmergency103 = { dialEmergency103(context) },
            )
        } else if (showOfflineExercise && !mobileState.restoring) {
            ExerciseScreen(
                mobile = null,
                onBack = { showOfflineExercise = false },
                onOpenSettings = { showSettings = true },
            )
        } else {
            OfflinePatientApp(
                demo = demo,
                notice = mobileState.message.takeUnless { showConnect },
                onPair = { showConnect = true },
                onExercise = { showOfflineExercise = true },
                onOpenSettings = { showSettings = true },
                onEmergency103 = { dialEmergency103(context) },
            )
        }
    }

    if (showConnect && !mobileState.connected) {
        AuthConnectDialog(
            state = mobileState,
            defaultOrigin = mobile.preferredOrigin,
            onPair = mobile::pair,
            onClinicLogin = mobile::loginClinic,
            onDismiss = { showConnect = false },
        )
    }

    if (showSettings) {
        SettingsSheet(
            themeMode = mobile.themeMode,
            largeText = mobile.largeText,
            poseModelMode = mobile.poseModelMode,
            connected = mobileState.connected,
            isDemo = mobileState.isDemo,
            serverOrigin = mobileState.serverOrigin,
            onThemeChange = mobile::updateThemeMode,
            onLargeTextChange = mobile::updateLargeText,
            onPoseModelChange = mobile::updatePoseModelMode,
            onConnectClick = { showConnect = true },
            onDisconnectClick = mobile::disconnect,
            onDismiss = { showSettings = false },
        )
    }
}

@Composable
private fun OfflinePatientApp(
    demo: PatientDemo,
    notice: String?,
    onPair: () -> Unit,
    onExercise: () -> Unit,
    onOpenSettings: () -> Unit,
    onEmergency103: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    var tab by rememberSaveable { mutableStateOf(OfflineDemoTab.Today) }
    var sheet by remember { mutableStateOf<MedicationSheet?>(null) }
    BackHandler(enabled = tab == OfflineDemoTab.Reply && sheet == null) { tab = OfflineDemoTab.Today }

    Column(
        Modifier
            .fillMaxSize()
            .background(colors.background)
            .windowInsetsPadding(WindowInsets.safeDrawing),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ShifoTopBar(
            badgeLabel = "Demo",
            badgeTone = ShifoTone.Neutral,
            onEmergency103 = onEmergency103,
            onOpenSettings = onOpenSettings,
        )
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            when (tab) {
                OfflineDemoTab.Today -> OfflineTodayPage(
                    entry = demo.entry,
                    notice = notice,
                    onRecord = { sheet = it },
                    onReply = { tab = OfflineDemoTab.Reply },
                    onPair = onPair,
                    onExercise = onExercise,
                )
                OfflineDemoTab.Reply -> ReplyPage(demo, onReset = { tab = OfflineDemoTab.Today })
            }
        }
        OfflineNavigationBar(selected = tab, onSelect = { tab = it })
    }
    sheet?.let { current ->
        RecordSheet(current, DEMO_MEDICATION_TITLE, DEMO_MEDICATION_TIME, onDismiss = { sheet = null }, onRecord = {
            demo.record(it)
            null
        })
    }
}
