package uz.shifohalqa.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

internal val Paper = Color(0xFFF5F4ED)
internal val Ink = Color(0xFF172F28)
internal val Muted = Color(0xFF4D6259)
internal val Green = Color(0xFF185443)
internal val Mint = Color(0xFFDCECE1)
internal val Border = Color(0xFFD9E0D6)
internal val Card = Color(0xFFFFFEF9)
internal val Amber = Color(0xFFF6E8CC)
internal val AmberInk = Color(0xFF674717)

private val shifoColors = lightColorScheme(
    primary = Green, onPrimary = Color.White, primaryContainer = Mint, onPrimaryContainer = Ink,
    background = Paper, onBackground = Ink, surface = Card, onSurface = Ink,
    surfaceVariant = Mint, onSurfaceVariant = Muted, outline = Muted, outlineVariant = Border,
)

@Composable
internal fun ShifoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = shifoColors, content = content)
}
