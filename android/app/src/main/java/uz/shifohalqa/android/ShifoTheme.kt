package uz.shifohalqa.android

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal enum class ThemeMode(val key: String, val labelUz: String) {
    System("system", "Tizim"),
    Light("light", "Yorug‘"),
    Dark("dark", "Tungi");

    companion object {
        fun fromKey(value: String?): ThemeMode = entries.firstOrNull { it.key == value } ?: System
    }
}

internal enum class PoseModelMode(
    val key: String,
    val assetName: String,
    val labelUz: String,
    val shortUz: String,
    val descriptionUz: String,
) {
    Full(
        key = "full",
        assetName = "pose_landmarker_full.task",
        labelUz = "Tezkor (Full)",
        shortUz = "Full",
        descriptionUz = "Tavsiya etiladi · tez va tejamkor on-device tahlil",
    ),
    Heavy(
        key = "heavy",
        assetName = "pose_landmarker_heavy.task",
        labelUz = "Yuqori aniqlik (Heavy)",
        shortUz = "Heavy",
        descriptionUz = "Yozilgan videolar uchun chuqurroq model (ko‘proq vaqt oladi)",
    );

    companion object {
        fun fromKey(value: String?): PoseModelMode = entries.firstOrNull { it.key == value } ?: Full
    }
}

internal val ShifoRadiusSm = 5.4.dp
internal val ShifoRadiusMd = 7.2.dp
internal val ShifoRadiusLg = 10.8.dp

@Immutable
internal data class ShifoColors(
    val isDark: Boolean,
    val background: Color,
    val surface: Color,
    val surfaceLow: Color,
    val surfaceAccent: Color,
    val surfaceHigh: Color,
    val ink: Color,
    val inkVariant: Color,
    val inkMuted: Color,
    val outline: Color,
    val outlineVariant: Color,
    val primary: Color,
    val primaryHover: Color,
    val onPrimary: Color,
    val secondary: Color,
    val onSecondary: Color,
    val urgent: Color,
    val urgentBg: Color,
    val warn: Color,
    val warnBg: Color,
    val ok: Color,
    val okBg: Color,
)

private val ShifoLightColors = ShifoColors(
    isDark = false,
    background = Color(0xFFFFFFFF),
    surface = Color(0xFFFFFFFF),
    surfaceLow = Color(0xFFF7F8FA),
    surfaceAccent = Color(0xFFE9EFFD),
    surfaceHigh = Color(0xFFD1D5DC),
    ink = Color(0xFF000000),
    inkVariant = Color(0xFF4D4D4D),
    inkMuted = Color(0xFF666666),
    outline = Color(0x1F000000),
    outlineVariant = Color(0xFFE5E7EB),
    primary = Color(0xFF2563EB),
    primaryHover = Color(0xFF1D4ED8),
    onPrimary = Color(0xFFFFFFFF),
    secondary = Color(0xFF000000),
    onSecondary = Color(0xFFFFFFFF),
    urgent = Color(0xFFDC2626),
    urgentBg = Color(0xFFFEF2F2),
    warn = Color(0xFFB45309),
    warnBg = Color(0xFFFFFBEB),
    ok = Color(0xFF047857),
    okBg = Color(0xFFECFDF5),
)

private val ShifoDarkColors = ShifoColors(
    isDark = true,
    background = Color(0xFF0A0A0B),
    surface = Color(0xFF121316),
    surfaceLow = Color(0xFF181A20),
    surfaceAccent = Color(0xFF1D2538),
    surfaceHigh = Color(0xFF272B36),
    ink = Color(0xFFFFFFFF),
    inkVariant = Color(0xFFB4B8C2),
    inkMuted = Color(0xFF8A909E),
    outline = Color(0x1FFFFFFF),
    outlineVariant = Color(0xFF262A34),
    primary = Color(0xFF2563EB),
    primaryHover = Color(0xFF3B82F6),
    onPrimary = Color(0xFFFFFFFF),
    secondary = Color(0xFFFFFFFF),
    onSecondary = Color(0xFF000000),
    urgent = Color(0xFFFB7185),
    urgentBg = Color(0x29E11D48),
    warn = Color(0xFFFBBF24),
    warnBg = Color(0x26F59E0B),
    ok = Color(0xFF34D399),
    okBg = Color(0x2410B981),
)

private val RethinkSansFontFamily = FontFamily(
    Font(
        resId = R.font.rethink_sans_variable,
        weight = FontWeight.Normal,
        variationSettings = FontVariation.Settings(FontVariation.weight(400)),
    ),
    Font(
        resId = R.font.rethink_sans_variable,
        weight = FontWeight.Medium,
        variationSettings = FontVariation.Settings(FontVariation.weight(500)),
    ),
    Font(
        resId = R.font.rethink_sans_variable,
        weight = FontWeight.SemiBold,
        variationSettings = FontVariation.Settings(FontVariation.weight(600)),
    ),
    Font(
        resId = R.font.rethink_sans_variable,
        weight = FontWeight.Bold,
        variationSettings = FontVariation.Settings(FontVariation.weight(700)),
    ),
)

private val DmMonoFontFamily = FontFamily(
    Font(resId = R.font.dm_mono_regular, weight = FontWeight.Normal),
)

internal val LocalShifoColors = staticCompositionLocalOf { ShifoLightColors }
internal val LocalShifoUiFont = staticCompositionLocalOf { RethinkSansFontFamily }
internal val LocalShifoMonoFont = staticCompositionLocalOf { DmMonoFontFamily }

private fun ShifoColors.toMaterialColorScheme() = if (isDark) {
    darkColorScheme(
        primary = primary,
        onPrimary = onPrimary,
        primaryContainer = surfaceAccent,
        onPrimaryContainer = ink,
        secondary = secondary,
        onSecondary = onSecondary,
        background = background,
        onBackground = ink,
        surface = surface,
        onSurface = ink,
        surfaceVariant = surfaceLow,
        onSurfaceVariant = inkVariant,
        surfaceContainerLowest = background,
        surfaceContainerLow = surfaceLow,
        surfaceContainer = surfaceAccent,
        surfaceContainerHigh = surfaceHigh,
        outline = outline,
        outlineVariant = outlineVariant,
        error = urgent,
        onError = Color.White,
        errorContainer = urgentBg,
        onErrorContainer = urgent,
    )
} else {
    lightColorScheme(
        primary = primary,
        onPrimary = onPrimary,
        primaryContainer = surfaceAccent,
        onPrimaryContainer = ink,
        secondary = secondary,
        onSecondary = onSecondary,
        background = background,
        onBackground = ink,
        surface = surface,
        onSurface = ink,
        surfaceVariant = surfaceLow,
        onSurfaceVariant = inkVariant,
        surfaceContainerLowest = background,
        surfaceContainerLow = surfaceLow,
        surfaceContainer = surfaceAccent,
        surfaceContainerHigh = surfaceHigh,
        outline = outline,
        outlineVariant = outlineVariant,
        error = urgent,
        onError = Color.White,
        errorContainer = urgentBg,
        onErrorContainer = urgent,
    )
}

private fun rethinkTypography(uiFont: FontFamily) = Typography(
    displaySmall = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Normal,
        fontSize = 32.sp,
        lineHeight = 36.sp,
        letterSpacing = (-1.1).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Normal,
        fontSize = 26.sp,
        lineHeight = 31.sp,
        letterSpacing = (-0.8).sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Normal,
        fontSize = 22.sp,
        lineHeight = 27.sp,
        letterSpacing = (-0.6).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Medium,
        fontSize = 18.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.3).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 21.sp,
        letterSpacing = (-0.15).sp,
    ),
    titleSmall = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 19.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 23.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = uiFont,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    ),
)

internal object ShifoThemeTokens {
    val colors: ShifoColors
        @Composable
        @ReadOnlyComposable
        get() = LocalShifoColors.current

    val monoFont: FontFamily
        @Composable
        @ReadOnlyComposable
        get() = LocalShifoMonoFont.current
}

@Composable
internal fun resolveIsDark(themeMode: ThemeMode): Boolean = when (themeMode) {
    ThemeMode.System -> isSystemInDarkTheme()
    ThemeMode.Light -> false
    ThemeMode.Dark -> true
}

@Composable
internal fun ShifoTheme(
    themeMode: ThemeMode = ThemeMode.System,
    largeText: Boolean = false,
    content: @Composable () -> Unit,
) {
    val dark = resolveIsDark(themeMode)
    val palette = if (dark) ShifoDarkColors else ShifoLightColors
    val density = LocalDensity.current
    val effectiveScale = if (largeText) (density.fontScale * 1.16f).coerceIn(1.16f, 1.45f) else density.fontScale
    val uiFont = RethinkSansFontFamily
    val monoFont = DmMonoFontFamily

    CompositionLocalProvider(
        LocalShifoColors provides palette,
        LocalShifoUiFont provides uiFont,
        LocalShifoMonoFont provides monoFont,
        LocalDensity provides Density(density.density, effectiveScale),
    ) {
        MaterialTheme(
            colorScheme = palette.toMaterialColorScheme(),
            typography = rethinkTypography(uiFont),
            content = content,
        )
    }
}
