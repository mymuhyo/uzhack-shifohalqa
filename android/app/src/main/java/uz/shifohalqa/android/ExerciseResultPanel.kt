package uz.shifohalqa.android

import android.content.Context
import android.media.MediaPlayer
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.IOException
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

@Composable
internal fun ExerciseVideoSummary(result: ExerciseVideoResult) {
    val reading = result.measurement
    SectionTitle(if (result.isPublic) "Namuna o‘lchovi" else "Video o‘lchovi")
    Text("${result.accuracy.name} · ${formatSeconds(result.elapsedMs)} soniya", color = Muted)
    Text("To‘liq ${reading.validReps} ta  ·  Chala ${reading.shallowReps} ta", color = Ink)
    reading.minAngle?.let { angle ->
        val label = if (result.movement.direction == PoseDirection.Extend) "Eng katta" else "Eng kichik"
        Text("$label burchak ${angle.roundToInt()}°", color = Ink)
    }
    reading.pose?.let { Text(analyzePoseDiagnostics(it).patientCoachingUz, color = Muted) }
    if (result.isPublic) Text("Ochiq namuna videosi.", color = Muted)
}

@Composable
internal fun ExerciseVideoRetake(result: ExerciseVideoResult) {
    var preview by remember(result) { mutableStateOf(false) }
    PatientCard {
        SectionTitle("Video tahlili")
        Text("${result.accuracy.name} · ${formatSeconds(result.elapsedMs)} soniya", color = Muted)
        if (result.isPublic && result.clip.uri.scheme != "asset") {
            TextButton(onClick = { preview = !preview }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(if (preview) "Namunani yopish" else "Namuna videosini ko‘rish", color = Ink)
            }
            if (preview) LocalVideoPreview(result)
        }
    }
}

@Composable
internal fun ExerciseVideoResultPanel(
    result: ExerciseVideoResult, mobile: MobileWorkspaceModel?, saved: ExerciseOutbox?,
    saving: Boolean, canSave: Boolean, onSave: () -> Unit,
) {
    val serverId = saved?.serverId
    val flagged = remember(result) { flaggedCycles(result.cycles) }
    PatientCard {
        ExerciseVideoSummary(result)
        if (saved != null) {
            val status = when (saved.status) {
                "sent" -> "O‘lchov shifokorga yuborildi."
                "rejected" -> "O‘lchov telefonda saqlandi, server qabul qilmadi."
                else -> "O‘lchov telefonda saqlandi. Internetga ulangach yuboriladi."
            }
            Text(status, color = if (saved.status == "rejected") UrgentInk else Muted)
        } else if (canSave && result.sha256 != null) {
            Text("O‘lchovni tekshirib, tasdiqlang.", color = Muted)
            PrimaryAction("Natijani tasdiqlash va saqlash", enabled = !saving, onClick = onSave)
        }
        if (flagged.isNotEmpty()) {
            SectionTitle("E’tibor talab qilgan takrorlar")
            flagged.forEach { item ->
                Text("${item.index + 1}-takror · ${formatSeconds(item.cycle.fromMs)}–${formatSeconds(item.cycle.toMs)} s",
                    style = MaterialTheme.typography.titleSmall, color = Ink)
                Text(item.codes.joinToString(" · ") { cycleLabel(it) }, color = Muted)
            }
            if (mobile != null && (serverId != null || result.isPublic)) ExerciseKeyframeReview(mobile, result, flagged, serverId)
        }
        if (!result.isPublic && serverId != null && mobile != null) {
            ExerciseVideoShare(mobile, result, serverId, alreadyShared = mobile.exercise.attempts.any { it.id == serverId && it.hasVideo })
        }
    }
}

@Composable
private fun ExerciseKeyframeReview(
    mobile: MobileWorkspaceModel, result: ExerciseVideoResult, flagged: List<FlaggedCycle>, serverId: String?,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var busy by remember(result) { mutableStateOf(false) }
    var observations by remember(result, serverId) { mutableStateOf<Map<Int, KeyframeObservation>>(emptyMap()) }
    var incomplete by remember(result) { mutableStateOf(false) }
    val available = flagged.take(3)
    val pending = available.filter { it.index !in observations }
    Text(
        if (result.isPublic) "Namuna kadrlaridan ehtiyotkor AI kuzatuvi olish mumkin."
        else "AI kuzatuvi uchun har bir tanlangan takrordan 3–4 ta kadr yuboriladi.",
        color = Muted, style = MaterialTheme.typography.bodyMedium,
    )
    OutlinedButton(
        shape = MaterialTheme.shapes.large,
        onClick = {
            busy = true
            incomplete = false
            scope.launch {
                try {
                    for (item in pending) {
                        val request = extractKeyframeReview(context, result, item, serverId)
                        if (request == null) {
                            incomplete = true
                            continue
                        }
                        observations = observations + (item.index to mobile.reviewKeyframes(request))
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    incomplete = true
                } finally {
                    busy = false
                }
            }
        },
        enabled = !busy && pending.isNotEmpty(),
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
    ) { Text(if (busy) "Kadrlar ko‘rib chiqilmoqda…" else "Kadrlarni AI kuzatuviga yuborish", color = Ink) }
    observations.toSortedMap().forEach { (_, observation) ->
        Text(observation.summary, color = Ink)
        Text(observation.uncertainty, color = Muted)
    }
    if (incomplete) Text("Kadr kuzatuvini olib bo‘lmadi. Telefon o‘lchovi yuqorida ko‘rsatilgan.", color = Muted)
}

@Composable
private fun ExerciseVideoShare(
    mobile: MobileWorkspaceModel, result: ExerciseVideoResult, serverId: String, alreadyShared: Boolean,
) {
    var consent by remember(result) { mutableStateOf(false) }
    var progress by remember(result) { mutableStateOf<Int?>(null) }
    var stagedPath by remember(result) { mutableStateOf<String?>(null) }
    var sent by remember(result) { mutableStateOf(false) }
    var finalizing by remember(result) { mutableStateOf(false) }
    var message by remember(result) { mutableStateOf<String?>(null) }
    var transfer by remember(result) { mutableStateOf<Job?>(null) }
    var preview by remember(result) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    SectionTitle("Urinish videosi")
    if (sent || alreadyShared) {
        Badge("Video shifokorga yuborildi", Positive, PositiveInk)
        return
    }
    if (result.durationMs > 60_000) {
        Text("Yuborish uchun 60 soniyagacha bo‘lgan video kerak. O‘lchov saqlandi.", color = Muted)
        return
    }
    TextButton(onClick = { preview = !preview }, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(if (preview) "Videoni yopish" else "Videoni ko‘rish", color = Ink)
    }
    if (preview) LocalVideoPreview(result)
    Text("Videoni biriktirilgan shifokor ko‘ra oladi. MP4 yoki WebM, 60 soniya va 20 MiB gacha.", color = Muted)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(consent, enabled = transfer == null, role = Role.Checkbox) { consent = it },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Checkbox(consent, onCheckedChange = null)
        Text("Videoni yuborishga roziman", color = Ink)
    }
    if (transfer != null) {
        val percent = progress
        Text(if (finalizing) "Yuborish yakunlanmoqda…" else percent?.let { "Yuklanmoqda · $it%" } ?: "Video tayyorlanmoqda…", color = Muted)
        if (percent == null || finalizing) LinearProgressIndicator(Modifier.fillMaxWidth())
        else LinearProgressIndicator(progress = { percent / 100f }, modifier = Modifier.fillMaxWidth())
        if (!finalizing) TextButton(onClick = {
            transfer?.cancel()
            message = "Yuborish bekor qilindi. O‘lchov saqlandi."
        }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Bekor qilish") }
    } else {
        PrimaryAction("Shu urinish videosini shifokorga yuborish", enabled = consent) {
            message = null
            progress = null
            finalizing = stagedPath != null
            transfer = scope.launch {
                try {
                    mobile.shareExerciseVideo(result, serverId, stagedPath, { progress = it }) {
                        stagedPath = it
                        finalizing = true
                    }
                    sent = true
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: VideoNotShareable) {
                    message = "Video turi, hajmi yoki fayl holatini tekshiring. O‘lchov saqlandi."
                } catch (failure: MobileFailure) {
                    message = when (failure.kind) {
                        MobileFailureKind.Offline -> "Internet yo‘q. O‘lchov saqlandi. Video uchun ulanishni tiklang."
                        MobileFailureKind.Quota -> "Kunlik video yuklash chegarasiga yetdingiz. O‘lchov saqlandi."
                        else -> "Videoni yuborib bo‘lmadi. O‘lchov saqlandi. Qayta urinib ko‘ring."
                    }
                } catch (_: IOException) {
                    message = "Videoni telefondan o‘qib bo‘lmadi. O‘lchov saqlandi."
                } catch (_: SecurityException) {
                    message = "Videoga kirish ruxsati tugagan. O‘lchov saqlandi."
                } finally {
                    transfer = null
                    finalizing = false
                }
            }
        }
    }
    message?.let { PatientNotice(it) }
}

@Composable
private fun LocalVideoPreview(result: ExerciseVideoResult) {
    var failed by remember(result) { mutableStateOf(false) }
    if (failed) {
        Text("Videoni oldindan ko‘rib bo‘lmadi.", color = Muted)
    } else AndroidView(
        factory = { context: Context ->
            VideoView(context).apply {
                setMediaController(MediaController(context).also { it.setAnchorView(this) })
                setOnErrorListener { _: MediaPlayer, _, _ -> failed = true; true }
                setVideoURI(result.clip.uri)
            }
        },
        modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
        onRelease = { it.stopPlayback() },
    )
}

private fun formatSeconds(ms: Long): String {
    val tenths = (ms + 50) / 100
    return "${tenths / 10},${tenths % 10}"
}

private fun cycleLabel(code: String): String = when (code) {
    "shallow_range" -> "Burchak maqsadga yetmadi"
    "too_fast" -> "Takror tez bajarildi"
    "too_slow" -> "Takror sekin bajarildi"
    "trunk_lean" -> "Gavda og‘ishi kuzatildi"
    "elbow_drift" -> "Tirsak siljishi kuzatildi"
    "shoulder_asymmetry" -> "Yelkalar notekis ko‘rindi"
    else -> "Takrorni qayta ko‘rib chiqing"
}
