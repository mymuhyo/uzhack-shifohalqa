package uz.shifohalqa.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

internal enum class ShifoTone { Neutral, Accent, Ok, Warn, Urgent }

internal enum class PatientTab(val label: String, val icon: ImageVector) {
    Today("Bugun", ShifoIcons.Today),
    Exercise("Mashqlar", ShifoIcons.Exercise),
    Reply("Hisobot", ShifoIcons.Report),
}

internal enum class OfflineDemoTab(val label: String, val icon: ImageVector) {
    Today("Bugun", ShifoIcons.Today),
    Reply("Javoblar", ShifoIcons.Report),
}

@Composable
internal fun ShifoTopBar(
    badgeLabel: String,
    badgeTone: ShifoTone = ShifoTone.Accent,
    onEmergency103: (() -> Unit)? = null,
    onOpenSettings: (() -> Unit)? = null,
) {
    val colors = ShifoThemeTokens.colors
    Column(
        Modifier
            .fillMaxWidth()
            .background(colors.background),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            Modifier
                .widthIn(max = 600.dp)
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = painterResource(R.drawable.shifo_mark),
                contentDescription = null,
                modifier = Modifier.size(34.dp),
                tint = Color.Unspecified,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "ShifoHalqa",
                    color = colors.ink,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            ShifoPill(label = badgeLabel, tone = badgeTone)
            if (onEmergency103 != null) {
                Box(
                    Modifier
                        .heightIn(min = 48.dp)
                        .clip(RoundedCornerShape(ShifoRadiusSm))
                        .background(colors.urgentBg)
                        .border(1.dp, colors.urgent.copy(alpha = 0.25f), RoundedCornerShape(ShifoRadiusSm))
                        .clickable(role = Role.Button, onClick = onEmergency103)
                        .padding(horizontal = 10.dp, vertical = 8.dp)
                        .semantics { contentDescription = "Tez yordam 103" },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(ShifoIcons.Phone, contentDescription = null, modifier = Modifier.size(14.dp), tint = colors.urgent)
                        Text("103", color = colors.urgent, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            if (onOpenSettings != null) {
                IconButton(
                    onClick = onOpenSettings,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(ShifoRadiusSm))
                        .border(1.dp, colors.outlineVariant, RoundedCornerShape(ShifoRadiusSm)),
                ) {
                    Icon(
                        imageVector = ShifoIcons.Settings,
                        contentDescription = "Sozlamalar",
                        modifier = Modifier.size(19.dp),
                        tint = colors.ink,
                    )
                }
            }
        }
        HorizontalDivider(thickness = 1.dp, color = colors.outlineVariant)
    }
}

@Composable
internal fun ShifoBottomBar(
    selected: PatientTab,
    onSelect: (PatientTab) -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    Column(Modifier.fillMaxWidth().background(colors.surface), horizontalAlignment = Alignment.CenterHorizontally) {
        HorizontalDivider(thickness = 1.dp, color = colors.outlineVariant)
        Row(
            Modifier
                .widthIn(max = 600.dp)
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PatientTab.entries.forEach { tab ->
                val active = tab == selected
                Column(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 52.dp)
                        .clip(RoundedCornerShape(ShifoRadiusMd))
                        .background(if (active) colors.surfaceAccent else Color.Transparent)
                        .border(
                            1.dp,
                            if (active) colors.primary.copy(alpha = 0.28f) else Color.Transparent,
                            RoundedCornerShape(ShifoRadiusMd),
                        )
                        .selectable(selected = active, role = Role.Tab, onClick = { onSelect(tab) })
                        .padding(horizontal = 8.dp, vertical = 7.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = null,
                        modifier = Modifier.size(19.dp),
                        tint = if (active) colors.primary else colors.inkMuted,
                    )
                    Text(
                        text = tab.label,
                        color = if (active) colors.ink else colors.inkMuted,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
internal fun OfflineNavigationBar(
    selected: OfflineDemoTab,
    onSelect: (OfflineDemoTab) -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    Column(Modifier.fillMaxWidth().background(colors.surface), horizontalAlignment = Alignment.CenterHorizontally) {
        HorizontalDivider(thickness = 1.dp, color = colors.outlineVariant)
        Row(
            Modifier
                .widthIn(max = 600.dp)
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OfflineDemoTab.entries.forEach { tab ->
                val active = tab == selected
                Column(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 52.dp)
                        .clip(RoundedCornerShape(ShifoRadiusMd))
                        .background(if (active) colors.surfaceAccent else Color.Transparent)
                        .border(
                            1.dp,
                            if (active) colors.primary.copy(alpha = 0.28f) else Color.Transparent,
                            RoundedCornerShape(ShifoRadiusMd),
                        )
                        .selectable(selected = active, role = Role.Tab, onClick = { onSelect(tab) })
                        .padding(horizontal = 8.dp, vertical = 7.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = null,
                        modifier = Modifier.size(19.dp),
                        tint = if (active) colors.primary else colors.inkMuted,
                    )
                    Text(
                        text = tab.label,
                        color = if (active) colors.ink else colors.inkMuted,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
internal fun PatientPage(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .widthIn(max = 600.dp)
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        content = content,
    )
}

@Composable
internal fun PageTitle(title: String) {
    Text(
        text = title,
        modifier = Modifier.semantics { heading() },
        color = ShifoThemeTokens.colors.ink,
        style = MaterialTheme.typography.displaySmall,
    )
}

@Composable
internal fun SectionTitle(title: String, modifier: Modifier = Modifier) {
    Text(
        text = title,
        modifier = modifier.semantics { heading() },
        color = ShifoThemeTokens.colors.ink,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Medium,
    )
}

@Composable
internal fun ShifoCard(
    modifier: Modifier = Modifier,
    containerColor: Color = ShifoThemeTokens.colors.surface,
    borderColor: Color = ShifoThemeTokens.colors.outlineVariant,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(ShifoRadiusMd)
    Column(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(containerColor, shape)
            .border(1.dp, borderColor, shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

@Composable
internal fun ShifoTonalCard(
    modifier: Modifier = Modifier,
    accent: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    ShifoCard(
        modifier = modifier,
        containerColor = if (accent) colors.surfaceAccent else colors.surfaceLow,
        borderColor = if (accent) colors.primary.copy(alpha = 0.22f) else colors.outlineVariant,
        content = content,
    )
}

@Composable
internal fun ShifoPill(
    label: String,
    tone: ShifoTone = ShifoTone.Neutral,
    modifier: Modifier = Modifier,
) {
    val colors = ShifoThemeTokens.colors
    val (bg, fg) = when (tone) {
        ShifoTone.Neutral -> colors.surfaceLow to colors.inkVariant
        ShifoTone.Accent -> colors.surfaceAccent to colors.primary
        ShifoTone.Ok -> colors.okBg to colors.ok
        ShifoTone.Warn -> colors.warnBg to colors.warn
        ShifoTone.Urgent -> colors.urgentBg to colors.urgent
    }
    Text(
        text = label,
        modifier = modifier
            .clip(RoundedCornerShape(ShifoRadiusSm))
            .background(bg)
            .padding(horizontal = 9.dp, vertical = 4.dp),
        color = fg,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
internal fun PrimaryAction(
    label: String,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    withHaptic: Boolean = false,
    onClick: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    val interaction = remember { MutableInteractionSource() }
    val haptic = LocalHapticFeedback.current
    Button(
        onClick = {
            if (withHaptic) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
        enabled = enabled,
        interactionSource = interaction,
        shape = RoundedCornerShape(ShifoRadiusLg),
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.primary,
            contentColor = colors.onPrimary,
            disabledContainerColor = colors.surfaceHigh,
            disabledContentColor = colors.inkMuted,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 13.dp),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .pressResponse(interaction),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
internal fun SecondaryAction(
    label: String,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    val interaction = remember { MutableInteractionSource() }
    Button(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interaction,
        shape = RoundedCornerShape(ShifoRadiusLg),
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.secondary,
            contentColor = colors.onSecondary,
            disabledContainerColor = colors.surfaceHigh,
            disabledContentColor = colors.inkMuted,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 13.dp),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .pressResponse(interaction),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
internal fun ShifoOutlineButton(
    label: String,
    enabled: Boolean = true,
    urgent: Boolean = false,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(ShifoRadiusLg),
        border = BorderStroke(1.dp, if (urgent) colors.urgent.copy(alpha = 0.45f) else colors.outlineVariant),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = if (urgent) colors.urgent else colors.ink,
            disabledContentColor = colors.inkMuted,
        ),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
        modifier = modifier.fillMaxWidth().heightIn(min = 48.dp),
    ) {
        Text(text = label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
    }
}

@Composable
internal fun PatientNotice(
    message: String,
    tone: ShifoTone = ShifoTone.Warn,
) {
    val colors = ShifoThemeTokens.colors
    val (bg, fg, border) = when (tone) {
        ShifoTone.Urgent -> Triple(colors.urgentBg, colors.urgent, colors.urgent.copy(alpha = 0.3f))
        ShifoTone.Ok -> Triple(colors.okBg, colors.ok, colors.ok.copy(alpha = 0.25f))
        ShifoTone.Accent -> Triple(colors.surfaceAccent, colors.primary, colors.primary.copy(alpha = 0.25f))
        else -> Triple(colors.warnBg, colors.warn, colors.warn.copy(alpha = 0.28f))
    }
    Text(
        text = message,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(ShifoRadiusMd))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(ShifoRadiusMd))
            .padding(12.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        color = fg,
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
internal fun SafetyBar(
    onPain: () -> Unit,
    onEmergency103: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    ShifoCard(
        containerColor = colors.urgentBg,
        borderColor = colors.urgent.copy(alpha = 0.28f),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(ShifoIcons.Alert, contentDescription = null, modifier = Modifier.size(18.dp), tint = colors.urgent)
            Column(Modifier.weight(1f)) {
                Text("Shoshilinch yordam", color = colors.urgent, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text("Ko‘krak og‘rig‘i, kuchli bosh aylanishi yoki mashqdagi og‘riqda.", color = colors.inkVariant, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ShifoOutlineButton(
                label = "Og‘riq bor",
                urgent = true,
                modifier = Modifier.weight(1f),
                onClick = onPain,
            )
            Button(
                onClick = onEmergency103,
                shape = RoundedCornerShape(ShifoRadiusLg),
                colors = ButtonDefaults.buttonColors(containerColor = colors.urgent, contentColor = Color.White),
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            ) {
                Icon(ShifoIcons.Phone, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.size(6.dp))
                Text("103 chaqirish", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SettingsSheet(
    themeMode: ThemeMode,
    largeText: Boolean,
    poseModelMode: PoseModelMode,
    connected: Boolean,
    isDemo: Boolean,
    serverOrigin: String?,
    onThemeChange: (ThemeMode) -> Unit,
    onLargeTextChange: (Boolean) -> Unit,
    onPoseModelChange: (PoseModelMode) -> Unit,
    onConnectClick: () -> Unit,
    onDisconnectClick: () -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = colors.surface,
        contentColor = colors.ink,
        shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionTitle("Ilova sozlamalari")

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Ko‘rinish mavzusi", color = colors.inkVariant, style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    ThemeMode.entries.forEachIndexed { index, mode ->
                        SegmentedButton(
                            selected = themeMode == mode,
                            onClick = { onThemeChange(mode) },
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = ThemeMode.entries.size),
                            colors = SegmentedButtonDefaults.colors(
                                activeContainerColor = colors.surfaceAccent,
                                activeContentColor = if (colors.isDark) colors.ink else colors.primary,
                                inactiveContainerColor = colors.surfaceLow,
                                inactiveContentColor = colors.inkVariant,
                            ),
                        ) {
                            Text(mode.labelUz, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(ShifoRadiusMd))
                    .background(colors.surfaceLow)
                    .border(1.dp, colors.outlineVariant, RoundedCornerShape(ShifoRadiusMd))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text("A+ Katta matn", color = colors.ink, style = MaterialTheme.typography.titleMedium)
                    Text("O‘qishni osonlashtirish uchun shriftni kattalashtiradi.", color = colors.inkMuted, style = MaterialTheme.typography.bodyMedium)
                }
                Switch(checked = largeText, onCheckedChange = onLargeTextChange)
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Aniqlik rejimi (yozilgan video tahlili)", color = colors.inkVariant, style = MaterialTheme.typography.labelLarge)
                Text(
                    "Jonli kamera tezkor ishlashi uchun sukut bo‘yicha Full modelida ishlaydi.",
                    color = colors.inkMuted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                PoseModelMode.entries.forEach { mode ->
                    val selected = poseModelMode == mode
                    val shape = RoundedCornerShape(ShifoRadiusMd)
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .clip(shape)
                            .background(if (selected) colors.surfaceAccent else colors.surfaceLow)
                            .border(1.dp, if (selected) colors.primary else colors.outlineVariant, shape)
                            .clickable(role = Role.RadioButton) { onPoseModelChange(mode) }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(mode.labelUz, color = colors.ink, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text(mode.descriptionUz, color = colors.inkMuted, style = MaterialTheme.typography.bodyMedium)
                        }
                        if (selected) {
                            Icon(ShifoIcons.Check, contentDescription = "Tanlangan", modifier = Modifier.size(18.dp), tint = colors.primary)
                        }
                    }
                }
            }

            ShifoTonalCard {
                Text("Ulanish holati", color = colors.inkVariant, style = MaterialTheme.typography.labelLarge)
                if (connected) {
                    Text(
                        if (isDemo) "Demo sessiyasi (sintetik ma’lumot)" else "Klinika hisobi (Supabase Bearer)",
                        color = colors.ink,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium,
                    )
                    serverOrigin?.let {
                        Text(
                            it,
                            color = colors.inkMuted,
                            fontFamily = ShifoThemeTokens.monoFont,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    ShifoOutlineButton(label = "Ulanishni uzish", urgent = true, onClick = {
                        onDismiss()
                        onDisconnectClick()
                    })
                } else {
                    Text("Hozir oflayn demo rejimi faol.", color = colors.inkMuted, style = MaterialTheme.typography.bodyMedium)
                    PrimaryAction("Serverga ulanish", onClick = {
                        onDismiss()
                        onConnectClick()
                    })
                }
            }

            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text("Yopish")
            }
        }
    }
}
