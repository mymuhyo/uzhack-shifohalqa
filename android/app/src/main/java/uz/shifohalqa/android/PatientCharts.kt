package uz.shifohalqa.android

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlin.math.max

@Composable
internal fun DailyProgressRing(
    total: Int,
    recorded: Int,
    modifier: Modifier = Modifier,
) {
    val colors = ShifoThemeTokens.colors
    val targetProgress = if (total <= 0) 0f else (recorded.toFloat() / total.toFloat()).coerceIn(0f, 1f)
    val animatedProgress by animateFloatAsState(
        targetValue = targetProgress,
        animationSpec = tween(durationMillis = 360),
        label = "Daily ring",
    )
    val complete = total > 0 && recorded >= total

    Box(modifier.size(64.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val strokeWidth = 5.dp.toPx()
            drawArc(
                color = colors.outlineVariant,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
            drawArc(
                color = if (complete) colors.ok else colors.primary,
                startAngle = -90f,
                sweepAngle = 360f * animatedProgress,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
        }
        Text(
            text = "$recorded/$total",
            color = if (complete) colors.ok else colors.ink,
            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
internal fun SevenDayStepsChart(
    trend: List<MobileStepTrendPoint>,
    goal: Int,
    modifier: Modifier = Modifier,
) {
    val colors = ShifoThemeTokens.colors
    if (trend.isEmpty()) return

    val maxVal = max(goal, trend.maxOfOrNull { it.effectiveCount ?: 0 } ?: goal).coerceAtLeast(100)
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(92.dp)
                .semantics {
                    contentDescription = "Oxirgi 7 kunlik qadamlar grafigi, maqsad $goal qadam"
                },
        ) {
            val count = trend.size.coerceAtLeast(1)
            val slotW = size.width / count
            val barW = (slotW * 0.48f).coerceAtMost(26.dp.toPx())
            val chartH = size.height - 8.dp.toPx()
            val goalY = chartH - (goal.toFloat() / maxVal.toFloat()).coerceIn(0f, 1f) * chartH + 4.dp.toPx()

            drawLine(
                color = colors.inkMuted.copy(alpha = 0.45f),
                start = Offset(0f, goalY),
                end = Offset(size.width, goalY),
                strokeWidth = 1.2.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)),
            )

            trend.forEachIndexed { index, point ->
                val value = (point.effectiveCount ?: 0).coerceAtLeast(0)
                val ratio = (value.toFloat() / maxVal.toFloat()).coerceIn(0f, 1f)
                val barH = max(if (value > 0) 6.dp.toPx() else 3.dp.toPx(), chartH * ratio)
                val left = index * slotW + (slotW - barW) / 2f
                val top = (chartH + 4.dp.toPx()) - barH
                val barColor = when {
                    value == 0 -> colors.outlineVariant
                    value >= goal -> colors.ok
                    else -> colors.primary
                }
                drawRoundRect(
                    color = barColor,
                    topLeft = Offset(left, top),
                    size = Size(barW, barH),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
                )
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            trend.forEach { point ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = shortWeekdayUz(point.date),
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.labelMedium,
                    )
                    Text(
                        text = point.effectiveCount?.let { formatCompactSteps(it) } ?: "—",
                        color = colors.inkVariant,
                        style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                    )
                }
            }
        }
    }
}

@Composable
internal fun BpZoneGauge(
    targets: BpTargets?,
    systolic: Int?,
    diastolic: Int?,
) {
    val colors = ShifoThemeTokens.colors
    if (targets == null) return
    val minSys = targets.minSystolic ?: 90
    val warnSys = targets.warnSystolic
    val maxSys = targets.maxSystolic

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(99.dp)),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Box(Modifier.weight(1f).fillMaxSize().background(colors.urgent.copy(alpha = 0.72f)))
            Box(Modifier.weight(2.2f).fillMaxSize().background(colors.ok.copy(alpha = 0.78f)))
            Box(Modifier.weight(1f).fillMaxSize().background(colors.warn.copy(alpha = 0.80f)))
            Box(Modifier.weight(1f).fillMaxSize().background(colors.urgent.copy(alpha = 0.85f)))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("<$minSys Past", color = colors.inkMuted, style = MaterialTheme.typography.labelMedium)
            Text("Me’yor", color = colors.ok, style = MaterialTheme.typography.labelMedium)
            Text("$warnSys Kuzatuv", color = colors.warn, style = MaterialTheme.typography.labelMedium)
            Text("≥$maxSys Yuqori", color = colors.urgent, style = MaterialTheme.typography.labelMedium)
        }
        if (systolic != null && diastolic != null) {
            Text(
                text = "Kiritilgan: $systolic/$diastolic mmHg",
                color = colors.inkVariant,
                style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
            )
        }
    }
}

@Composable
internal fun BpSevenDayMiniChart(
    history: List<MobileBpHistoryPoint>,
    targets: BpTargets?,
) {
    val colors = ShifoThemeTokens.colors
    val numeric = history.filter { it.systolic != null && it.diastolic != null }.takeLast(7)
    if (numeric.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Oxirgi bosim o‘lchovlari", color = colors.inkVariant, style = MaterialTheme.typography.labelLarge)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            numeric.forEach { pt ->
                val zone = evaluateBpZone(pt.systolic, pt.diastolic, pt.chestPain, targets)
                val pillTone = when (zone?.tone) {
                    BpZoneTone.Urgent -> ShifoTone.Urgent
                    BpZoneTone.Warn -> ShifoTone.Warn
                    else -> ShifoTone.Ok
                }
                Column(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(ShifoRadiusSm))
                        .background(colors.surfaceLow)
                        .padding(horizontal = 6.dp, vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "${pt.systolic}/${pt.diastolic}",
                        color = when (pillTone) {
                            ShifoTone.Urgent -> colors.urgent
                            ShifoTone.Warn -> colors.warn
                            else -> colors.ok
                        },
                        style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(shortDateMd(pt.date), color = colors.inkMuted, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

private fun formatCompactSteps(count: Int): String = when {
    count >= 10_000 -> "${count / 1000}k"
    count >= 1_000 -> String.format(java.util.Locale.US, "%.1fk", count / 1000f).replace(".0k", "k")
    else -> count.toString()
}

private fun shortWeekdayUz(isoDate: String): String = try {
    when (LocalDate.parse(isoDate).dayOfWeek.value) {
        1 -> "Du"
        2 -> "Se"
        3 -> "Ch"
        4 -> "Pa"
        5 -> "Ju"
        6 -> "Sh"
        else -> "Ya"
    }
} catch (_: DateTimeParseException) {
    isoDate.takeLast(2)
}

private fun shortDateMd(isoDate: String): String = try {
    val d = LocalDate.parse(isoDate)
    String.format(java.util.Locale.US, "%02d.%02d", d.dayOfMonth, d.monthValue)
} catch (_: DateTimeParseException) {
    isoDate
}
