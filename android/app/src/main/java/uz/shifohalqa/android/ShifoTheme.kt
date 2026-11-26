package uz.shifohalqa.android

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Shapes
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp

internal enum class Appearance(val label: String) { System("Tizim"), Light("Yorug‘"), Dark("Tungi") }
internal enum class PoseAccuracy(val label: String, val asset: String) {
    Full("Tezkor (Full)", "pose_landmarker_full.task"),
    Heavy("Yuqori aniqlik (Heavy)", "pose_landmarker_heavy.task"),
}

internal class PatientPreferences(context: Context) {
    private val storage = context.getSharedPreferences("patient_appearance", Context.MODE_PRIVATE)
    var appearance by mutableStateOf(Appearance.entries.find { it.name == storage.getString("theme", null) } ?: Appearance.System)
        private set
    var accuracy by mutableStateOf(PoseAccuracy.entries.find { it.name == storage.getString("accuracy", null) } ?: PoseAccuracy.Full)
        private set
    var largeText by mutableStateOf(storage.getBoolean("large_text", false))
        private set

    fun chooseAppearance(value: Appearance) {
        appearance = value
        storage.edit().putString("theme", value.name).apply()
    }

    fun chooseAccuracy(value: PoseAccuracy) {
        accuracy = value
        storage.edit().putString("accuracy", value.name).apply()
    }

    fun chooseLargeText(value: Boolean) {
        largeText = value
        storage.edit().putBoolean("large_text", value).apply()
    }
}

internal val LocalPatientPreferences = staticCompositionLocalOf<PatientPreferences?> { null }

private data class ClinicalColors(
    val urgent: Color, val urgentInk: Color,
    val warn: Color, val warnInk: Color,
    val ok: Color, val okInk: Color,
)

private val LightClinical = ClinicalColors(
    Color(0xFFFDE8E8), Color(0xFF9D1726),
    Color(0xFFFFF1CF), Color(0xFF684100),
    Color(0xFFE3F4E9), Color(0xFF165637),
)
private val DarkClinical = ClinicalColors(
    Color(0xFF461D25), Color(0xFFFFB9BE),
    Color(0xFF3B2E13), Color(0xFFFFDA8B),
    Color(0xFF16342A), Color(0xFF9AE1B9),
)
private val LocalClinical = staticCompositionLocalOf { LightClinical }

internal val Paper: Color @Composable get() = MaterialTheme.colorScheme.background
internal val Card: Color @Composable get() = MaterialTheme.colorScheme.surface
internal val Ink: Color @Composable get() = MaterialTheme.colorScheme.onSurface
internal val Muted: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
internal val Action: Color @Composable get() = MaterialTheme.colorScheme.onPrimaryContainer
internal val Tinted: Color @Composable get() = MaterialTheme.colorScheme.primaryContainer
internal val Border: Color @Composable get() = MaterialTheme.colorScheme.outlineVariant
internal val Amber: Color @Composable get() = LocalClinical.current.warn
internal val AmberInk: Color @Composable get() = LocalClinical.current.warnInk
internal val Urgent: Color @Composable get() = LocalClinical.current.urgent
internal val UrgentInk: Color @Composable get() = LocalClinical.current.urgentInk
internal val Positive: Color @Composable get() = LocalClinical.current.ok
internal val PositiveInk: Color @Composable get() = LocalClinical.current.okInk

internal val ShifoCobalt = Color(0xFF2563EB)
private val light = lightColorScheme(
    primary = ShifoCobalt, onPrimary = Color.White, primaryContainer = Color(0xFFE9EFFD), onPrimaryContainer = Color(0xFF1644A5),
    secondary = Color.Black, onSecondary = Color.White,
    background = Color.White, surface = Color(0xFFF7F8FA), onBackground = Color.Black, onSurface = Color.Black,
    surfaceVariant = Color(0xFFE9EFFD), onSurfaceVariant = Color(0xFF4C5262),
    surfaceContainer = Color(0xFFF7F8FA), surfaceContainerHigh = Color(0xFFE9EFFD),
    outline = Color(0xFF6E7687), outlineVariant = Color(0xFFD6DCE7),
    error = LightClinical.urgentInk, errorContainer = LightClinical.urgent, onErrorContainer = LightClinical.urgentInk,
)
private val dark = darkColorScheme(
    primary = Color(0xFFB4CBFF), onPrimary = Color(0xFF0A0A0B), primaryContainer = Color(0xFF1D2538), onPrimaryContainer = Color(0xFFB4CBFF),
    secondary = Color.White, onSecondary = Color.Black,
    background = Color(0xFF0A0A0B), surface = Color(0xFF121316), onBackground = Color.White, onSurface = Color.White,
    surfaceVariant = Color(0xFF181A20), onSurfaceVariant = Color(0xFFC4CBD9),
    surfaceContainer = Color(0xFF181A20), surfaceContainerHigh = Color(0xFF1D2538),
    outline = Color(0xFFA0A9BD), outlineVariant = Color(0xFF343C4D),
    error = DarkClinical.urgentInk, errorContainer = DarkClinical.urgent, onErrorContainer = DarkClinical.urgentInk,
)

private val rethink = FontFamily(
    listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold).map { weight ->
        Font(R.font.rethink_sans, weight = weight, variationSettings = FontVariation.Settings(weight, FontStyle.Normal))
    },
)
private val rethinkTypography = Typography().let { styles ->
    styles.copy(
        displayLarge = styles.displayLarge.copy(fontFamily = rethink),
        displayMedium = styles.displayMedium.copy(fontFamily = rethink),
        displaySmall = styles.displaySmall.copy(fontFamily = rethink),
        headlineLarge = styles.headlineLarge.copy(fontFamily = rethink),
        headlineMedium = styles.headlineMedium.copy(fontFamily = rethink),
        headlineSmall = styles.headlineSmall.copy(fontFamily = rethink),
        titleLarge = styles.titleLarge.copy(fontFamily = rethink),
        titleMedium = styles.titleMedium.copy(fontFamily = rethink),
        titleSmall = styles.titleSmall.copy(fontFamily = rethink),
        bodyLarge = styles.bodyLarge.copy(fontFamily = rethink),
        bodyMedium = styles.bodyMedium.copy(fontFamily = rethink),
        bodySmall = styles.bodySmall.copy(fontFamily = rethink),
        labelLarge = styles.labelLarge.copy(fontFamily = rethink),
        labelMedium = styles.labelMedium.copy(fontFamily = rethink),
        labelSmall = styles.labelSmall.copy(fontFamily = rethink),
    )
}

@Composable
internal fun ShifoTheme(isDark: Boolean = isSystemInDarkTheme(), largeText: Boolean = false, content: @Composable () -> Unit) {
    val density = LocalDensity.current
    CompositionLocalProvider(
        LocalClinical provides if (isDark) DarkClinical else LightClinical,
        LocalDensity provides if (largeText) Density(density.density, density.fontScale * 1.2f) else density,
    ) {
        MaterialTheme(
            colorScheme = if (isDark) dark else light,
            typography = rethinkTypography,
            shapes = Shapes(extraSmall = RoundedCornerShape(5.dp), small = RoundedCornerShape(7.dp),
                medium = RoundedCornerShape(7.dp), large = RoundedCornerShape(11.dp), extraLarge = RoundedCornerShape(11.dp)),
            content = content,
        )
    }
}

@Composable
internal fun PatientSettings(preferences: PatientPreferences, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sozlamalar") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Ko‘rinish", style = MaterialTheme.typography.titleMedium)
                SettingsChoices(Appearance.entries, preferences.appearance, { it.label }, preferences::chooseAppearance)
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .selectable(preferences.largeText, role = Role.Checkbox) { preferences.chooseLargeText(!preferences.largeText) },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Checkbox(preferences.largeText, onCheckedChange = null)
                    Text("Katta matn")
                }
                Text("Aniqlik rejimi", style = MaterialTheme.typography.titleMedium)
                SettingsChoices(PoseAccuracy.entries, preferences.accuracy, { it.label }, preferences::chooseAccuracy)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Yopish") } },
    )
}

@Composable
private fun <T> SettingsChoices(items: List<T>, current: T, label: (T) -> String, choose: (T) -> Unit) {
    Column(Modifier.selectableGroup()) {
        items.forEach { option ->
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .selectable(option == current, role = Role.RadioButton) { choose(option) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                RadioButton(option == current, onClick = null)
                Text(label(option))
            }
        }
    }
}
