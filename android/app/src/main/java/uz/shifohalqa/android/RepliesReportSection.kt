package uz.shifohalqa.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
internal fun RepliesReportSection(
    day: MobileDay?,
    brief: PatientClinicalBrief?,
    focusedReplyId: String?,
) {
    val colors = ShifoThemeTokens.colors
    SoftReveal(0) { PageTitle("Hisobot va javoblar") }

    if (day == null) {
        ShifoTonalCard {
            Text("Hisobot yuklanmoqda…", color = colors.inkMuted)
        }
        return
    }

    // L4 Doctor-approved 7-day brief
    if (brief != null) {
        ShifoTonalCard(accent = true) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(ShifoIcons.Sparkles, contentDescription = null, modifier = Modifier.size(18.dp), tint = colors.primary)
                    SectionTitle("7 kunlik shifokor xulosasi")
                }
                ShifoPill("L4 tasdiqlangan", ShifoTone.Ok)
            }
            Text(
                text = "Sana: ${displayDate(brief.briefDate)} · Tasdiqlandi ${displayReviewTime(brief.approvedAt)}",
                color = colors.inkMuted,
                style = MaterialTheme.typography.labelLarge,
            )
            Text(
                text = brief.approvedReplyUz,
                color = colors.ink,
                style = MaterialTheme.typography.bodyLarge,
            )
        }
    } else {
        ShifoTonalCard {
            SectionTitle("7 kunlik shifokor xulosasi")
            Text(
                "Shifokor 7 kunlik hisobotni ko‘rib tasdiqlagach, yakuniy xulosa shu yerda ko‘rinadi.",
                color = colors.inkMuted,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }

    // Per-medication 7-day adherence breakdown
    if (day.medicationAdherence.isNotEmpty()) {
        ShifoCard {
            SectionTitle("7 kunlik dori ijrosi")
            day.medicationAdherence.forEach { med ->
                val scheduled = med.week.scheduled.coerceAtLeast(1)
                val pct = (med.week.taken.toFloat() / scheduled.toFloat()).coerceIn(0f, 1f)
                val strengthText = formatStrength(med.strength, med.strengthUnit).takeIf { it.isNotEmpty() }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = if (strengthText != null) "${med.medicationName} ($strengthText)" else med.medicationName,
                            color = colors.ink,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "${med.week.taken}/${med.week.scheduled} ichildi",
                            color = colors.inkVariant,
                            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
                        )
                    }
                    LinearProgressIndicator(
                        progress = { pct },
                        modifier = Modifier.fillMaxWidth(),
                        color = if (med.week.missed == 0 && med.week.taken == med.week.scheduled) colors.ok else colors.primary,
                        trackColor = colors.surfaceLow,
                        drawStopIndicator = {},
                    )
                    Text(
                        text = "Qoldirildi: ${med.week.missed} · Javobsiz: ${med.week.unanswered} · Vaqtlar: ${med.times.joinToString(", ")}",
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
        }
    }

    // Individual medication & BP replies
    SectionTitle("Shifokor javoblari")
    if (day.replies.isEmpty()) {
        ShifoCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(ShifoIcons.Report, contentDescription = null, modifier = Modifier.size(20.dp), tint = colors.primary)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Hozircha alohida javob yo‘q", color = colors.ink, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Shifokor dori yoki bosim qaydingizni ko‘rib chiqqach, javob shu yerda ko‘rinadi.",
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
        return
    }

    val replies = day.replies.sortedByDescending { it.recordId == focusedReplyId }
    replies.forEach { reply ->
        key(reply.recordId) {
            val retake = reply.review.needsRetake
            ShifoCard {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ShifoPill(
                        label = if (retake) "Qayta ko‘rish so‘raldi" else "Shifokor ko‘rib chiqdi",
                        tone = if (retake) ShifoTone.Warn else ShifoTone.Ok,
                    )
                    Text(
                        displayDate(reply.date),
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
                SectionTitle(reply.taskTitle)
                Text(reply.review.body, color = colors.ink, style = MaterialTheme.typography.bodyLarge)
                Text(
                    "Javob yozildi · ${displayReviewTime(reply.review.reviewedAt)}",
                    color = colors.inkMuted,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}
