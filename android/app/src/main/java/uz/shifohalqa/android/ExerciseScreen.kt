package uz.shifohalqa.android

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.time.LocalDate
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

private val samplePlan = ExercisePlan("sample", 100, 5)

@Composable
internal fun ExerciseScreen(mobile: MobileWorkspaceModel?, onBack: () -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    var practice by rememberSaveable { mutableStateOf(PoseMovement.ChairStand.apiKey) }
    val selectedMovement = PoseMovement.fromApiKey(practice)
    val ui = mobile?.exercise ?: ExerciseUi(planLoaded = true, plan = samplePlan.copy(
        movement = selectedMovement, targetAngle = selectedMovement.defaultTargetAngle,
    ))
    val plan = ui.plan
    val movement = plan?.movement ?: PoseMovement.ChairStand
    var running by remember { mutableStateOf(false) }
    var frame by remember { mutableStateOf<ExerciseCameraFrame?>(null) }
    var finished by remember { mutableStateOf<ExerciseMeasurement?>(null) }
    var runDate by remember { mutableStateOf(exerciseToday()) }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var manual by rememberSaveable { mutableStateOf(false) }
    var clip by remember { mutableStateOf<ExerciseClip?>(null) }
    var videoResult by remember { mutableStateOf<ExerciseVideoResult?>(null) }
    var videoProgress by remember { mutableStateOf(0) }
    var showSampleAi by rememberSaveable { mutableStateOf(false) }

    fun startVideo(input: ExerciseClip) {
        finished = null
        notice = null
        videoResult = null
        videoProgress = 0
        showSampleAi = input.isPublic
        clip = input
    }

    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { startVideo(ExerciseClip.fromPicker(it)) }
    }

    LaunchedEffect(clip) {
        val selected = clip ?: return@LaunchedEffect
        try {
            val analysisPlan = if (selected.isPublic) samplePlan else plan ?: samplePlan
            videoResult = analyzeExerciseVideo(context, selected, analysisPlan.targetAngle, analysisPlan.movement,
                analysisPlan.targetReps, analysisPlan.maxShallow) {
                videoProgress = it
            }
            if (videoResult?.measurement?.savable != true) {
                notice = "Videodan yetarli o‘lchov olinmadi. Boshqa video tanlang yoki takrorlarni qo‘lda kiriting."
                manual = true
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: ExerciseVideoTooLong) {
            notice = "Ikki daqiqagacha bo‘lgan video tanlang."
        } catch (_: Exception) {
            notice = "Videoni tahlil qilib bo‘lmadi. Boshqa video tanlang yoki takrorlarni qo‘lda kiriting."
            manual = true
        }
        if (clip == selected) clip = null
    }

    fun startCamera() {
        frame = null
        finished = null
        videoResult = null
        notice = null
        runDate = exerciseToday()
        running = true
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera()
        else {
            notice = "Kameraga ruxsat berilmadi. Qayta urinishingiz yoki takrorlarni qo‘lda kiritishingiz mumkin."
            manual = true
        }
    }

    fun submit(evidence: JSONObject, title: String, date: LocalDate = exerciseToday(), onSaved: () -> Unit = {}) {
        if (mobile == null) {
            notice = "Namuna qaydi. Shifokorga yuborish uchun veb-panelga ulang."
            onSaved()
        } else mobile.queueExercise(evidence.put("movement", movement.apiKey), title, date) {
            notice = null
            onSaved()
        }
    }

    fun reportPain() {
        clip = null
        videoResult = null
        running = false
        finished = null
        frame = null
        submit(JSONObject().put("source", "self_report").put("reason", "pain"), "Og‘riq xabari")
    }

    fun emergency() {
        clip = null
        running = false
        frame = null
        try {
            context.startActivity(Intent(Intent.ACTION_DIAL, "tel:103".toUri()))
        } catch (_: ActivityNotFoundException) {
            notice = "Tez yordam raqami 103. Telefon orqali qo‘ng‘iroq qiling."
        }
    }

    LaunchedEffect(mobile) { mobile?.refreshExercise() }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                if (running) {
                    running = false
                    frame = null
                    notice = "Kamera yopildi. Mashqni qaytadan boshlashingiz mumkin."
                }
                if (clip != null) {
                    clip = null
                    notice = "Video tahlili to‘xtatildi. Videoni qayta tanlashingiz mumkin."
                }
            }
        }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    BackHandler {
        if (running) {
            running = false
            frame = null
        } else if (clip != null) clip = null
        else onBack()
    }

    Column(
        Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (running && plan != null) {
            ExerciseCamera(Modifier.weight(1f).fillMaxWidth(), plan, onFrame = { frame = it }) {
                running = false
                frame = null
                manual = true
                notice = "Kamerani ochib bo‘lmadi. Qayta urinishingiz yoki takrorlarni qo‘lda kiritishingiz mumkin."
            }
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val reading = frame
                Text("Jonli kamera · Full", style = MaterialTheme.typography.labelLarge)
                Text(
                    when {
                        reading == null -> "Kamera ishga tushmoqda…"
                        reading.ready -> "Kamera tayyor · To‘liq ${reading.result.validReps} · Chala ${reading.result.shallowReps}"
                        else -> "Yon tomoningiz bilan turing. ${movement.pointsLabelUz} kadrda ko‘rinsin."
                    },
                    style = MaterialTheme.typography.bodyLarge,
                )
                reading?.angle?.let { Text("${movement.jointLabelUz} burchagi ${it.roundToInt()}°") }
                reading?.result?.pose?.biomechanics?.currentFormWarning?.let { Text(it.labelUz) }
                PrimaryAction("To‘xtatish") {
                    running = false
                    finished = reading?.result?.takeIf { it.savable }
                    frame = null
                    if (finished == null) {
                        notice = "Yetarli o‘lchov olinmadi. Qayta urinishingiz yoki takrorlarni qo‘lda kiritishingiz mumkin."
                        manual = true
                    }
                }
                OutlinedButton(onClick = ::reportPain, modifier = Modifier.fillMaxWidth(), enabled = !ui.saving) {
                    Text("Og‘riq bor")
                }
                TextButton(onClick = ::emergency, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Text("Tez yordam · 103")
                }
            }
        } else {
            BrandBar(if (mobile == null) "Namuna" else "Ulangan demo")
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                PatientPage {
                    TextButton(onClick = onBack) { Text("Bugungi vazifalar") }
                    PageTitle(movement.titleUz)
                    if (mobile == null) {
                        var movementsOpen by remember { mutableStateOf(false) }
                        Box {
                            TextButton(enabled = clip == null, onClick = { movementsOpen = true }) { Text("Mashq turini tanlash") }
                            DropdownMenu(expanded = movementsOpen, onDismissRequest = { movementsOpen = false }) {
                                PoseMovement.entries.forEach { item ->
                                    DropdownMenuItem(text = { Text(item.shortTitleUz) }, onClick = {
                                        practice = item.apiKey
                                        movementsOpen = false
                                        videoResult = null
                                        finished = null
                                        notice = null
                                        manual = false
                                    })
                                }
                            }
                        }
                    }
                    TextButton(onClick = ::emergency) { Text("Tez yordam · 103") }
                    notice?.let { PatientNotice(it) }
                    ui.message?.let { PatientNotice(it) }
                    if (plan == null) {
                        Text(when {
                            ui.loading -> "Mashq rejasi yuklanmoqda…"
                            ui.planLoaded -> "Shifokor mashq rejasini hali biriktirmagan."
                            else -> "Mashq rejasi telefonga yuklanmagan."
                        })
                    } else {
                        Text("Rejadagi maqsad · ${plan.targetReps} takror", style = MaterialTheme.typography.bodyLarge)
                        PrimaryAction("Kamerani boshlash", enabled = !ui.saving && clip == null) {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                                PackageManager.PERMISSION_GRANTED) startCamera()
                            else permission.launch(Manifest.permission.CAMERA)
                        }
                        OutlinedButton(
                            onClick = { videoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
                            enabled = !ui.saving && clip == null,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Video tanlash va tahlil qilish") }
                        val result = finished
                        if (result != null) PatientCard {
                            SectionTitle("Kamera o‘lchovi · Full")
                            Text("To‘liq ${result.validReps} · Chala ${result.shallowReps}")
                            result.pose?.let { Text(analyzePoseDiagnostics(it).patientCoachingUz) }
                            result.minAngle?.let { Text("${if (movement.direction == PoseDirection.Extend) "Eng katta" else "Eng kichik"} burchak ${it.roundToInt()}°") }
                            PrimaryAction("Natijani saqlash", enabled = !ui.saving) {
                                submit(result.asEvidence(), "Kamera o‘lchovi", runDate) { finished = null }
                            }
                        }
                        OutlinedButton(onClick = ::reportPain, modifier = Modifier.fillMaxWidth(), enabled = !ui.saving) {
                            Text("Og‘riq bor")
                        }
                        TextButton(onClick = { manual = !manual }, enabled = clip == null) { Text("Takrorni qo‘lda kiritish") }
                        if (manual && clip == null) ManualExerciseInput(ui.saving) { reps ->
                            submit(JSONObject().put("source", "self_report").put("reason", "manual").put("reps", reps),
                                "Qo‘lda qayd") { manual = false }
                        }
                    }
                    TextButton(onClick = { startVideo(ExerciseClip.PublicSample) }, enabled = clip == null && !ui.saving) {
                        Text("CDC namunasini Heavy bilan tahlil qilish")
                    }
                    if (clip != null) {
                        PatientNotice("Heavy video tahlili · $videoProgress%")
                        TextButton(onClick = { clip = null }) { Text("Video tahlilini bekor qilish") }
                    }
                    videoResult?.let { result ->
                        if (result.measurement.savable && result.sha256 != null) {
                            PatientCard {
                                SectionTitle(if (result.isPublic) "Heavy o‘lchovi · CDC namunasi" else "Heavy o‘lchovi · Tanlangan video")
                                Text("To‘liq ${result.measurement.validReps} · Chala ${result.measurement.shallowReps}")
                                result.measurement.minAngle?.let { Text("${if (result.movement.direction == PoseDirection.Extend) "Eng katta" else "Eng kichik"} burchak ${it.roundToInt()}°") }
                                result.measurement.pose?.let { Text(analyzePoseDiagnostics(it).patientCoachingUz) }
                                if (plan != null && result.movement == plan.movement) {
                                    Text("Video shu telefonda qoladi. Saqlashda faqat o‘lchov xulosasi yuboriladi.")
                                    PrimaryAction("Natijani tasdiqlash va saqlash", enabled = !ui.saving) {
                                        submit(result.measurement.asEvidence(result.sha256), "Video o‘lchovi") { videoResult = null }
                                    }
                                }
                            }
                        }
                    }
                    if (clip?.isPublic != false && videoResult?.isPublic != false) {
                        TextButton(onClick = { showSampleAi = !showSampleAi }) {
                            Text(if (showSampleAi) "AI tahlilchini yopish" else "AI tahlilchi · CDC namunasi")
                        }
                        if (showSampleAi) {
                            val cycles = videoResult?.takeIf { it.isPublic && it.measurement.savable }?.cycles
                            ExerciseSampleAi(mobile, cycles)
                        }
                    }
                    if (mobile != null) {
                        TextButton(onClick = mobile::refreshExercise, enabled = !ui.loading) { Text("Yangilash") }
                        ExerciseHistory(ui, mobile::discardExercise)
                    }
                }
            }
        }
    }
}

@Composable
private fun ManualExerciseInput(saving: Boolean, onSubmit: (Int) -> Unit) {
    var value by rememberSaveable { mutableStateOf("") }
    val reps = value.toIntOrNull()
    OutlinedTextField(value, { if (it.length <= 3 && it.all { char -> char in '0'..'9' }) value = it },
        modifier = Modifier.fillMaxWidth(), label = { Text("Takrorlar soni") }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
    PrimaryAction("Qo‘lda qayd saqlash", enabled = reps != null && !saving) {
        reps?.let(onSubmit)
    }
}

@Composable
private fun ExerciseHistory(ui: ExerciseUi, onDiscard: (String) -> Unit) {
    if (ui.outbox.isNotEmpty() || ui.attempts.isNotEmpty()) SectionTitle("Mashq qaydlari va javoblar")
    val received = ui.attempts.mapTo(mutableSetOf()) { it.id }
    ui.outbox.filter { it.serverId !in received }.forEach { attempt ->
        PatientCard {
            SectionTitle(attempt.label)
            Text(when (attempt.status) {
                "sent" -> "Shifokor paneliga yuborildi"
                "rejected" -> "Qayd yuborilmadi. Rejani yangilang va qayta qayd eting."
                else -> "Telefonda saqlandi, hali yuborilmadi."
            })
            if (attempt.status == "rejected") {
                TextButton(onClick = { onDiscard(attempt.id) }) { Text("Ushbu qaydni olib tashlash") }
            }
        }
    }
    ui.attempts.forEach { attempt ->
        PatientCard {
            SectionTitle(attempt.title)
            Text("${attempt.movement.shortTitleUz} · ${attempt.date} · L${attempt.level}")
            attempt.reps?.let { reps ->
                Text(attempt.shallow?.let { "To‘liq $reps · Chala $it" } ?: "$reps takror")
            }
            val review = attempt.review
            if (review == null) Text("Shifokor paneliga yuborildi")
            else {
                Text(if (review.retake) "Qayta o‘lchash so‘raldi" else "Shifokor ko‘rib chiqdi")
                Text(review.body)
            }
        }
    }
}
