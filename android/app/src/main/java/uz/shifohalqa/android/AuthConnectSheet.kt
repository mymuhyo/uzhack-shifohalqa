package uz.shifohalqa.android

import android.view.View
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider

internal enum class AuthTab(val labelUz: String) {
    Clinic("Klinika hisobi"),
    DemoCode("Demo kodi"),
}

@Composable
internal fun AuthConnectDialog(
    state: MobileWorkspaceState,
    defaultOrigin: String,
    onPair: (String, String) -> Unit,
    onClinicLogin: (String, String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var activeTab by rememberSaveable { mutableStateOf(AuthTab.Clinic) }
    var address by rememberSaveable {
        mutableStateOf(defaultOrigin.ifBlank { if (BuildConfig.DEBUG) LOCAL_DEMO_ORIGIN else "" })
    }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }

    val colors = ShifoThemeTokens.colors
    val busy = state.pairing

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        properties = DialogProperties(dismissOnBackPress = !busy, dismissOnClickOutside = !busy),
        containerColor = colors.surface,
        titleContentColor = colors.ink,
        textContentColor = colors.ink,
        title = { Text("Veb-panelga ulash", style = MaterialTheme.typography.headlineSmall) },
        text = {
            val view = LocalView.current
            if (activeTab == AuthTab.DemoCode) {
                SideEffect {
                    // Keep the one-time demo code out of password manager autofill.
                    (view.parent as? DialogWindowProvider)?.window?.decorView?.importantForAutofill =
                        View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
                }
            } else {
                SideEffect {
                    (view.parent as? DialogWindowProvider)?.window?.decorView?.importantForAutofill =
                        View.IMPORTANT_FOR_AUTOFILL_AUTO
                }
            }

            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    AuthTab.entries.forEachIndexed { index, tab ->
                        SegmentedButton(
                            selected = activeTab == tab,
                            onClick = { if (!busy) activeTab = tab },
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = AuthTab.entries.size),
                            colors = SegmentedButtonDefaults.colors(
                                activeContainerColor = colors.surfaceAccent,
                                activeContentColor = if (colors.isDark) colors.ink else colors.primary,
                                inactiveContainerColor = colors.surfaceLow,
                                inactiveContentColor = colors.inkVariant,
                            ),
                        ) {
                            Text(tab.labelUz)
                        }
                    }
                }

                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(if (BuildConfig.DEBUG) "Server manzili (HTTPS / lokal)" else "Server manzili (HTTPS)") },
                    singleLine = true,
                    enabled = !busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                )

                if (BuildConfig.DEBUG) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("Emulator" to EMULATOR_DEMO_ORIGIN, "USB/ADB" to LOCAL_DEMO_ORIGIN).forEach { (label, url) ->
                            val selected = address.trim() == url
                            Text(
                                text = label,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(ShifoRadiusSm))
                                    .background(if (selected) colors.surfaceAccent else colors.surfaceLow)
                                    .border(1.dp, if (selected) colors.primary else colors.outlineVariant, RoundedCornerShape(ShifoRadiusSm))
                                    .clickable(enabled = !busy) { address = url }
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                                color = if (selected) colors.primary else colors.inkVariant,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }

                if (activeTab == AuthTab.Clinic) {
                    Text(
                        "Klinika tomonidan berilgan bemor emaili va paroli bilan kiring.",
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Email") },
                        singleLine = true,
                        enabled = !busy,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, autoCorrectEnabled = false),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Parol") },
                        singleLine = true,
                        enabled = !busy,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                    )
                } else {
                    Text(
                        "Veb-paneldagi shifokor sahifasidan olingan 32 belgili bir martalik kodni kiriting.",
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Ulash kodi (32 belgi)") },
                        singleLine = true,
                        enabled = !busy,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false),
                    )
                }

                state.message?.let { PatientNotice(it, tone = ShifoTone.Urgent) }
            }
        },
        confirmButton = {
            val canSubmit = if (activeTab == AuthTab.Clinic) {
                address.isNotBlank() && email.contains("@") && password.isNotEmpty()
            } else {
                address.isNotBlank() && code.isNotBlank()
            }
            TextButton(
                onClick = {
                    if (activeTab == AuthTab.Clinic) onClinicLogin(address, email, password)
                    else onPair(address, code)
                },
                enabled = !busy && canSubmit,
            ) {
                Text(if (busy) "Ulanmoqda…" else if (activeTab == AuthTab.Clinic) "Kirish" else "Ulash")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text("Bekor qilish") }
        },
    )
}
