package uz.shifohalqa.android

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch

internal data class PublicExerciseAdvice(val source: String, val text: String, val cue: String)

internal enum class SampleAiProvider(val value: String, val label: String) {
    OpenRouter("openrouter", "AI bilan tahlil"),
    Baidu("baidu", "AI bilan izohlash"),
}

internal sealed interface SampleAiReport {
    val model: String
    data class Observation(override val model: String, val view: String, val seatedAtSeconds: List<Double>,
        val usesSampleFrames: Boolean = false) : SampleAiReport
    data class Explanation(override val model: String, val summary: String) : SampleAiReport
}

internal fun compareSampleObservations(cycles: List<ExerciseCycle>, observation: SampleAiReport.Observation?): String {
    if (observation == null) return "pose_only"
    if (observation.view == "unclear") return "video_unclear"
    val times = observation.seatedAtSeconds
    if (cycles.size != times.size) return "count_differs"
    if (cycles.isEmpty()) return "no_cycles"
    return if (cycles.all { cycle -> times.any { it * 1000 in cycle.fromMs.toDouble()..cycle.toMs.toDouble() } }) {
        "match"
    } else "time_differs"
}

@Composable
internal fun ExerciseSampleAi(mobile: MobileWorkspaceModel?, cycles: List<ExerciseCycle>?) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var observation by remember { mutableStateOf<SampleAiReport.Observation?>(null) }
    var explanation by remember { mutableStateOf<SampleAiReport.Explanation?>(null) }
    var advice by remember { mutableStateOf<PublicExerciseAdvice?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }

    PatientCard {
        SectionTitle("AI tahlilchi · CDC namunasi")
        Text("Mustaqil AI kuzatuvi faqat ommaviy CDC videosiga ishlatiladi.")
        if (mobile == null) {
            Text("AI tahlili uchun veb-panelga ulang.")
        } else {
            TextButton(enabled = !busy, onClick = {
                busy = true
                notice = null
                scope.launch {
                    try {
                        advice = mobile.publicExerciseCoach()
                    } catch (failure: MobileFailure) {
                        notice = if (failure.kind == MobileFailureKind.Expired) "AI murabbiy uchun veb-panelga qayta ulang."
                            else "Murabbiy javob bermadi. Keyinroq qayta urinib ko‘ring."
                    } finally {
                        busy = false
                    }
                }
            }) { Text("Namuna uchun murabbiy izohi") }
            val providers = if (cycles == null) SampleAiProvider.entries.filter { it != SampleAiProvider.Baidu }
                else SampleAiProvider.entries
            providers.forEach { provider ->
                TextButton(enabled = !busy, onClick = {
                    busy = true
                    notice = null
                    if (provider == SampleAiProvider.Baidu) explanation = null
                    scope.launch {
                        try {
                            when (val report = mobile.analyzePublicSample(provider, compareSampleObservations(cycles.orEmpty(), observation))) {
                                is SampleAiReport.Observation -> {
                                    observation = report
                                    explanation = null
                                }
                                is SampleAiReport.Explanation -> explanation = report
                            }
                        } catch (failure: MobileFailure) {
                            notice = when (failure.kind) {
                                MobileFailureKind.NotFound -> "Bu AI xizmati veb-panelda yoqilmagan."
                                MobileFailureKind.Expired -> "AI tahlili uchun veb-panelga qayta ulang."
                                else -> "AI javob bermadi. Keyinroq qayta urinib ko‘ring."
                            }
                        } finally {
                            busy = false
                        }
                    }
                }) { Text(provider.label) }
            }
        }
        advice?.let {
            Text(if (it.source == "deterministic_coach") "Qoidaviy murabbiy" else "AI murabbiy · ommaviy namuna")
            Text(it.text)
            Text(it.cue)
        }
        if (busy) PatientNotice("AI namunani tahlil qilmoqda…")
        observation?.let {
            Text(it.model)
            if (it.usesSampleFrames) Text("Ommaviy namunadan 9 kadr")
            if (it.view == "unclear") Text("Video modeli harakatni yetarli ko‘rmadi.")
            else Text("Topilgan sikllar · ${it.seatedAtSeconds.size}")
            if (it.seatedAtSeconds.isNotEmpty()) Text("Taxminiy o‘tirish vaqtlari · ${it.seatedAtSeconds.joinToString { time -> "$time s" }}")
        }
        explanation?.let {
            Text(it.model)
            Text(it.summary)
        }
        notice?.let { PatientNotice(it) }
    }
}
