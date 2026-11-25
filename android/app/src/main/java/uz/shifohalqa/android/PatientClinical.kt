package uz.shifohalqa.android

internal data class StepPoint(val date: String, val count: Int?)
internal data class MobileBrief(val reply: String, val approvedAt: String)
internal data class MobileAdherence(
    val name: String, val strength: String?, val taken: Int, val missed: Int, val unanswered: Int,
)
internal data class MobileVitals(val id: String, val time: String, val record: MobilePressure?)
internal data class MobilePressure(
    val id: String, val systolic: Int?, val diastolic: Int?, val chestPain: Boolean, val reply: MobileReview?,
)
internal enum class BpZone(val label: String) {
    Low("Past"), InRange("Me’yor"), High("Yuqori"),
}

internal data class BpTargets(
    val warnSystolic: Int, val warnDiastolic: Int, val maxSystolic: Int, val maxDiastolic: Int,
    val minSystolic: Int?, val minDiastolic: Int?,
) {
    fun zone(systolic: Int?, diastolic: Int?): BpZone? {
        if (systolic == null || diastolic == null) return null
        // Match the server: maximum thresholds take precedence over low, then warning thresholds.
        return when {
            systolic >= maxSystolic || diastolic >= maxDiastolic -> BpZone.High
            (minSystolic != null && systolic < minSystolic) || (minDiastolic != null && diastolic < minDiastolic) -> BpZone.Low
            systolic >= warnSystolic || diastolic >= warnDiastolic -> BpZone.High
            else -> BpZone.InRange
        }
    }

    fun reachesMax(systolic: Int?, diastolic: Int?): Boolean =
        systolic != null && diastolic != null && (systolic >= maxSystolic || diastolic >= maxDiastolic)
}

internal fun validPressure(systolic: Int?, diastolic: Int?): Boolean =
    systolic != null && diastolic != null && systolic in 50..260 && diastolic in 30..160 && systolic > diastolic
