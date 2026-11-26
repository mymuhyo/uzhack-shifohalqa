package uz.shifohalqa.android

import java.util.Locale
import kotlin.math.max

internal const val BP_SYSTOLIC_MIN = 50
internal const val BP_SYSTOLIC_MAX = 260
internal const val BP_DIASTOLIC_MIN = 30
internal const val BP_DIASTOLIC_MAX = 160

internal const val MAX_EXERCISE_UPLOAD_DURATION_SEC = 60
internal const val MAX_EXERCISE_UPLOAD_BYTES = 20L * 1024L * 1024L

internal data class BpTargets(
    val maxSystolic: Int,
    val maxDiastolic: Int,
    val warnSystolic: Int,
    val warnDiastolic: Int,
    val minSystolic: Int? = null,
    val minDiastolic: Int? = null,
)

internal enum class BpZoneTone { Ok, Warn, Urgent }

internal data class BpZoneAssessment(
    val tone: BpZoneTone,
    val ruleKey: String,
    val labelUz: String,
    val textUz: String,
    val invalid: Boolean = false,
)

internal fun evaluateBpZone(
    systolic: Int?,
    diastolic: Int?,
    chestPain: Boolean,
    targets: BpTargets?,
): BpZoneAssessment? {
    if (chestPain) {
        return BpZoneAssessment(
            tone = BpZoneTone.Urgent,
            ruleKey = "chest_pain",
            labelUz = "Shoshilinch",
            textUz = "Ko‘krak og‘rig‘i belgilandi — qaydni yuboring va ahvolingiz og‘irlashsa darhol 103 ga qo‘ng‘iroq qiling.",
        )
    }

    if (systolic == null || diastolic == null) return null

    if (systolic !in BP_SYSTOLIC_MIN..BP_SYSTOLIC_MAX) {
        return BpZoneAssessment(
            tone = BpZoneTone.Urgent,
            ruleKey = "invalid_systolic",
            labelUz = "Qiymatni tekshiring",
            textUz = "Yuqori (sistolik) bosim $BP_SYSTOLIC_MIN–$BP_SYSTOLIC_MAX mmHg oralig‘ida bo‘lishi kerak.",
            invalid = true,
        )
    }
    if (diastolic !in BP_DIASTOLIC_MIN..BP_DIASTOLIC_MAX) {
        return BpZoneAssessment(
            tone = BpZoneTone.Urgent,
            ruleKey = "invalid_diastolic",
            labelUz = "Qiymatni tekshiring",
            textUz = "Pastki (diastolik) bosim $BP_DIASTOLIC_MIN–$BP_DIASTOLIC_MAX mmHg oralig‘ida bo‘lishi kerak.",
            invalid = true,
        )
    }
    if (systolic <= diastolic) {
        return BpZoneAssessment(
            tone = BpZoneTone.Urgent,
            ruleKey = "invalid_order",
            labelUz = "Qiymatni tekshiring",
            textUz = "Yuqori bosim pastki bosimdan katta bo‘lishi kerak.",
            invalid = true,
        )
    }

    val t = targets ?: return BpZoneAssessment(
        tone = BpZoneTone.Ok,
        ruleKey = "measured",
        labelUz = "O‘lchov kiritildi",
        textUz = "Shifokor chegara qo‘ymagan — qayd shifokor ko‘rigiga yuboriladi.",
    )

    if (systolic >= t.maxSystolic || diastolic >= t.maxDiastolic) {
        return BpZoneAssessment(
            tone = BpZoneTone.Urgent,
            ruleKey = "bp_max",
            labelUz = "Yuqori chegara",
            textUz = "Yuqori chegara (${t.maxSystolic}/${t.maxDiastolic} mmHg) dan oshdi — shifokorga shoshilinch navbatga tushadi.",
        )
    }

    val lowSys = t.minSystolic != null && systolic < t.minSystolic
    val lowDia = t.minDiastolic != null && diastolic < t.minDiastolic
    if (lowSys || lowDia) {
        val lowLabel = if (t.minSystolic != null && t.minDiastolic != null) {
            "${t.minSystolic}/${t.minDiastolic} mmHg"
        } else if (t.minSystolic != null) {
            "${t.minSystolic} mmHg"
        } else {
            "${t.minDiastolic} mmHg"
        }
        return BpZoneAssessment(
            tone = BpZoneTone.Urgent,
            ruleKey = "bp_low",
            labelUz = "Past chegara",
            textUz = "Past chegara ($lowLabel) dan tushdi — shifokorga shoshilinch navbatga tushadi. Bosh aylansa o‘tiring va 103 ga qo‘ng‘iroq qiling.",
        )
    }

    if (systolic >= t.warnSystolic || diastolic >= t.warnDiastolic) {
        return BpZoneAssessment(
            tone = BpZoneTone.Warn,
            ruleKey = "bp_warning",
            labelUz = "Kuzatuv chegarasi",
            textUz = "Kuzatuv chegarasi (${t.warnSystolic}/${t.warnDiastolic} mmHg) da — shifokor tekshiruv navbatiga chiqadi.",
        )
    }

    return BpZoneAssessment(
        tone = BpZoneTone.Ok,
        ruleKey = "ok",
        labelUz = "Me’yor",
        textUz = "Shifokor belgilagan me’yor ichida (< ${t.warnSystolic}/${t.warnDiastolic} mmHg).",
    )
}

internal fun formatStrength(strength: Double?, unit: String): String {
    if (strength == null) return ""
    val number = if (strength % 1.0 == 0.0) strength.toInt().toString() else strength.toString()
    val unitUz = when (unit.lowercase(Locale.US)) {
        "mcg" -> "mkg"
        "iu" -> "IU"
        else -> unit.lowercase(Locale.US)
    }
    return "$number $unitUz"
}

internal fun normalizeVideoMimeType(raw: String?): String? {
    val clean = raw?.substringBefore(';')?.trim()?.lowercase(Locale.US) ?: return null
    return when (clean) {
        "video/mp4", "video/webm" -> clean
        else -> null
    }
}

internal fun validateVideoUploadSpec(
    durationSec: Int,
    sizeBytes: Long,
    mimeType: String?,
): String? {
    if (durationSec < 1 || durationSec > MAX_EXERCISE_UPLOAD_DURATION_SEC) {
        return "Shifokorga yuboriladigan video 1–$MAX_EXERCISE_UPLOAD_DURATION_SEC soniya oralig‘ida bo‘lishi kerak."
    }
    if (sizeBytes < 1L || sizeBytes > MAX_EXERCISE_UPLOAD_BYTES) {
        return "Video hajmi 20 MiB dan oshmasligi kerak."
    }
    if (normalizeVideoMimeType(mimeType) == null) {
        return "Faqat MP4 yoki WebM formatidagi video qabul qilinadi."
    }
    return null
}

internal fun formatClockMs(ms: Long): String {
    val totalSec = max(0L, ms / 1000L)
    val mins = totalSec / 60L
    val secs = totalSec % 60L
    return String.format(Locale.US, "%02d:%02d", mins, secs)
}
