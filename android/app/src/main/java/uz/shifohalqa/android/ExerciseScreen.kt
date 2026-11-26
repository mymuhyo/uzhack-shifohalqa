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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import android.os.SystemClock
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
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import androidx.compose.runtime.rememberCoroutineScope
import org.json.JSONObject

private fun practicePlan(movement: PoseMovement) = ExercisePlan(
    "practice", movement.defaultTargetAngle, movement.defaultTargetReps, movement, movement.defaultMaxShallow,
)

@Composable
internal fun ExerciseScreen(mobile: MobileWorkspaceModel?, onBack: () -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    var practice by rememberSaveable { mutableStateOf<String?>(null) }
    val ui = mobile?.exercise ?: ExerciseUi(planLoaded = true)
    val prescribed = ui.plan
    val movement = practice?.let(PoseMovement::fromApiKey) ?: prescribed?.movement ?: PoseMovement.ChairStand
    val plan = prescribed?.takeIf { it.movement == movement } ?: practicePlan(movement)
    val canSave = prescribed?.movement == movement
    val accuracy = LocalPatientPreferences.current?.accuracy ?: PoseAccuracy.Full
    val haptic = LocalHapticFeedback.current
    var running by remember { mutableStateOf(false) }
    var frame by remember { mutableStateOf<ExerciseCameraFrame?>(null) }
    var finished by remember { mutableStateOf<ExerciseMeasurement?>(null) }
    var runDate by remember { mutableStateOf(exerciseToday()) }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var manual by rememberSaveable { mutableStateOf(false) }
    var clip by remember { mutableStateOf<ExerciseClip?>(null) }
    var videoResult by remember { mutableStateOf<ExerciseVideoResult?>(null) }
    var videoProgress by remember { mutableStateOf(0) }
    var sampleDownload by remember { mutableStateOf<Job?>(null) }
    var sampleProgress by remember { mutableStateOf(0) }
    var videoQueueId by remember { mutableStateOf<String?>(null) }
    var videoAccuracy by remember { mutableStateOf(PoseAccuracy.Full) }
    var startedAt by remember { mutableStateOf(0L) }
    var cameraElapsed by remember { mutableStateOf(0L) }
    val mediaBusy = clip != null || sampleDownload != null
    val savedVideo = ui.outbox.firstOrNull { it.id == videoQueueId }
    var audioEnabled by rememberSaveable { mutableStateOf(true) }
    var aiCoachAdvice by remember { mutableStateOf<PublicExerciseAdvice?>(null) }
    var aiCoachLoading by remember { mutableStateOf(false) }
    var aiCoachError by remember { mutableStateOf<String?>(null) }
    val coachScope = rememberCoroutineScope()
    val audioCoach = remember(context) { UzbekAudioCoach(context) }

    DisposableEffect(audioCoach) {
        onDispose { audioCoach.release() }
    }
    LaunchedEffect(audioEnabled) {
        if (!audioEnabled) audioCoach.stopAll()
    }

    var lastReadySpoken by remember { mutableStateOf(false) }
    var lastValidSpoken by remember { mutableStateOf(0) }
    var lastShallowSpoken by remember { mutableStateOf(0) }
    var lastWarningSpoken by remember { mutableStateOf<PoseFormWarning?>(null) }
    var lastWarningMs by remember { mutableStateOf(0L) }

    LaunchedEffect(running) {
        if (!running) {
            lastReadySpoken = false
            lastValidSpoken = 0
            lastShallowSpoken = 0
            lastWarningSpoken = null
            lastWarningMs = 0L
        }
    }

    LaunchedEffect(frame, running, audioEnabled) {
        if (!running) return@LaunchedEffect
        val current = frame ?: return@LaunchedEffect
        if (current.result.validReps > lastValidSpoken) haptic.performHapticFeedback(HapticFeedbackType.Confirm)
        if (!audioEnabled) {
            lastValidSpoken = current.result.validReps
            return@LaunchedEffect
        }
        if (current.ready && !lastReadySpoken) {
            audioCoach.speakReady()
            lastReadySpoken = true
        } else if (!current.ready && lastReadySpoken) {
            audioCoach.speakLost()
            lastReadySpoken = false
        }
        if (current.result.validReps > lastValidSpoken) {
            lastValidSpoken = current.result.validReps
            audioCoach.speakRep(lastValidSpoken)
        } else if (current.result.shallowReps > lastShallowSpoken) {
            lastShallowSpoken = current.result.shallowReps
            audioCoach.speakDeeper()
        } else {
            val warning = current.formWarning
            val now = System.currentTimeMillis()
            if (warning != null && (warning != lastWarningSpoken || now - lastWarningMs >= 4_500L)) {
                audioCoach.speakWarning(warning)
                lastWarningSpoken = warning
                lastWarningMs = now
            } else if (warning == null) {
                lastWarningSpoken = null
            }
        }
    }

    fun requestCoachForResult(measurement: ExerciseMeasurement, activePlan: ExercisePlan) {
        aiCoachAdvice = null
        aiCoachError = null
        if (mobile == null) {
            measurement.pose?.let { pose ->
                val diag = analyzePoseDiagnostics(pose)
                aiCoachAdvice = PublicExerciseAdvice("deterministic_coach", diag.patientCoachingUz, diag.focusCueUz, "shifo-biomechanics-v2")
            }
            return
        }
        aiCoachLoading = true
        coachScope.launch {
            try {
                val pose = measurement.pose
                val payload = JSONObject().apply {
                    put("movement", activePlan.movement.apiKey)
                    put("targetAngle", activePlan.targetAngle)
                    put("targetReps", activePlan.targetReps)
                    put("maxShallow", activePlan.maxShallow)
                    put("validReps", measurement.validReps)
                    put("shallowReps", measurement.shallowReps)
                    put("minAngle", measurement.minAngle ?: JSONObject.NULL)
                    pose?.avgCycleSeconds?.let { put("avgCycleSeconds", it) }
                    pose?.interruptedCycles?.let { put("interruptedCycles", it) }
                    pose?.incompleteCycles?.let { put("incompleteCycles", it) }
                    pose?.biomechanics?.let { bio ->
                        put(
                            "formMetrics",
                            JSONObject().apply {
                                bio.trunkLeanMaxDeg?.let { put("trunkLeanMaxDeg", it) }
                                bio.elbowDriftMaxDeg?.let { put("elbowDriftMaxDeg", it) }
                                bio.shoulderTiltMaxDeg?.let { put("shoulderTiltMaxDeg", it) }
                                put("compensationCycles", bio.compensationCycles)
                                bio.tempoSpreadSeconds?.let { put("tempoSpreadSeconds", it) }
                            },
                        )
                    }
                }
                aiCoachAdvice = mobile.requestExerciseCoach(payload)
            } catch (_: MobileFailure) {
                aiCoachError = "AI murabbiy javob bermadi. Telefon o‘lchovi ko‘rsatildi."
            } finally {
                aiCoachLoading = false
            }
        }
    }

    fun startVideo(input: ExerciseClip) {
        finished = null
        notice = null
        videoResult = null
        videoProgress = 0
        videoQueueId = null
        videoAccuracy = accuracy
        clip = input
    }

    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { startVideo(ExerciseClip.fromPicker(it)) }
    }

    LaunchedEffect(clip) {
        val selected = clip ?: return@LaunchedEffect
        try {
            val analysisPlan = if (selected.sample?.movement == plan.movement || !selected.isPublic) plan
                else practicePlan(requireNotNull(selected.sample).movement)
            videoResult = analyzeExerciseVideo(context, selected, analysisPlan.targetAngle, analysisPlan.movement,
                analysisPlan.targetReps, analysisPlan.maxShallow, videoAccuracy) { videoProgress = it }
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
        startedAt = SystemClock.elapsedRealtime()
        running = true
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera()
        else {
            notice = "Kameraga ruxsat berilmadi. Qayta urinishingiz yoki takrorlarni qo‘lda kiritishingiz mumkin."
            manual = true
        }
    }

    fun submit(evidence: JSONObject, title: String, date: LocalDate = exerciseToday(), onSaved: (String?) -> Unit = {}) {
        if (mobile == null) {
            notice = "Namuna qaydi. Shifokorga yuborish uchun veb-panelga ulang."
            onSaved(null)
        } else if (canSave) mobile.queueExercise(evidence.put("movement", movement.apiKey), title, date) {
            notice = null
            onSaved(it)
        }
    }

    fun startSample(sample: ExerciseSample) {
        notice = null
        sampleProgress = 0
        sampleDownload = coachScope.launch {
            try {
                val api = mobile?.sampleApi() ?: if (BuildConfig.DEBUG) MobileApi.forAddress(LOCAL_DEMO_ORIGIN) else null
                startVideo(loadExerciseSample(context, sample, api) { sampleProgress = it })
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: MobileFailure) {
                notice = if (failure.kind == MobileFailureKind.Rejected) "Namuna fayli tekshiruvdan o‘tmadi. Qayta urinib ko‘ring."
                    else "Namuna hali telefoningizga yuklanmagan. Internet va veb-panel ulanishini tekshiring."
            } catch (_: java.io.IOException) {
                notice = "Namunani telefonga saqlab bo‘lmadi. Qayta urinib ko‘ring."
            } finally {
                sampleDownload = null
            }
        }
    }

    fun reportPain() {
        sampleDownload?.cancel()
        clip = null
        videoResult = null
        running = false
        finished = null
        frame = null
        if (mobile == null || canSave) {
            submit(JSONObject().put("source", "self_report").put("reason", "pain"), "Og‘riq xabari")
        } else notice = "Mashqni to‘xtating. Ko‘krak og‘rig‘i yoki kuchli bosh aylanishida 103 ga qo‘ng‘iroq qiling."
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
        else if (sampleDownload != null) sampleDownload?.cancel()
        else onBack()
    }

    Column(
        Modifier.fillMaxSize().background(Paper).windowInsetsPadding(WindowInsets.safeDrawing),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (running) {
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
                reading?.angle?.let { Text("${movement.jointLabelUz} burchagi ${it.roundToInt()}° · maqsad ${plan.targetAngle}°") }
                val activeWarning = reading?.formWarning ?: reading?.result?.pose?.biomechanics?.currentFormWarning
                Badge(
                    activeWarning?.let { "AI maslahat: ${it.labelUz}" } ?: "Texnika: Me’yor",
                    if (activeWarning != null) Amber else Tinted,
                    if (activeWarning != null) AmberInk else Action,
                )
                PrimaryAction("To‘xtatish") {
                    running = false
                    cameraElapsed = SystemClock.elapsedRealtime() - startedAt
                    val savable = reading?.result?.takeIf { it.savable }
                    finished = savable
                    frame = null
                    if (savable == null) {
                        notice = "Yetarli o‘lchov olinmadi. Qayta urinishingiz yoki takrorlarni qo‘lda kiritishingiz mumkin."
                        manual = true
                    } else {
                        if (audioEnabled) audioCoach.speakDone()
                        requestCoachForResult(savable, plan)
                    }
                }
                RowSafety(onPain = ::reportPain, onEmergency = ::emergency, enabled = !ui.saving)
            }
        } else {
            BrandBar(when {
                mobile == null -> "Namuna"
                mobile.state.isDemo -> "Ulangan demo"
                else -> "Klinika hisobi"
            })
            RowSafety(onPain = ::reportPain, onEmergency = ::emergency, enabled = !ui.saving)
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                PatientPage {
                    TextButton(onClick = onBack) { Text("Bugungi vazifalar") }
                    PageTitle(movement.titleUz)
                    run {
                        var movementsOpen by remember { mutableStateOf(false) }
                        Box {
                            TextButton(enabled = !mediaBusy && !ui.saving, onClick = { movementsOpen = true }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Mashq turini tanlash") }
                            DropdownMenu(expanded = movementsOpen, onDismissRequest = { movementsOpen = false }) {
                                (ExerciseSample.entries.map { it.movement } + listOfNotNull(prescribed?.movement)).distinct().forEach { item ->
                                    DropdownMenuItem(text = { Text(item.shortTitleUz) }, onClick = {
                                        practice = item.apiKey
                                        movementsOpen = false
                                        videoResult = null
                                        finished = null
                                        notice = null
                                        manual = false
                                        videoQueueId = null
                                    })
                                }
                            }
                        }
                    }
                    notice?.let { PatientNotice(it) }
                    ui.message?.let { PatientNotice(it) }
                    if (mobile != null && prescribed == null && ui.loading) Text("Mashq rejasi yuklanmoqda…", color = Muted)
                    if (mobile != null && !canSave) Text("Mashqni sinab ko‘rishingiz mumkin. Shifokor biriktirgan mashq natijasi yuboriladi.", color = Muted)
                    run {
                        Text(if (canSave) "Rejadagi maqsad · ${plan.targetReps} takror" else movement.cycleCueUz,
                            style = MaterialTheme.typography.bodyLarge)
                        Text("Kamera yoki video uchun yon tomondan butun gavdangiz kadrga sig‘sin.", color = Muted)
                        val sample = ExerciseSample.entries.firstOrNull { it.movement == movement }
                        if (sample != null) PrimaryAction("Tayyor namunani tahlil qilish", enabled = !mediaBusy && !ui.saving) {
                            startSample(sample)
                        }
                        TextButton(onClick = { audioEnabled = !audioEnabled }) {
                            Text("Ovozli sanoq: ${if (audioEnabled) "Yoqilgan" else "O‘chirilgan"}")
                        }
                        OutlinedButton(shape = MaterialTheme.shapes.large, onClick = {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                                PackageManager.PERMISSION_GRANTED) startCamera()
                            else permission.launch(Manifest.permission.CAMERA)
                        }, enabled = !ui.saving && !mediaBusy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                            Text("Kamerani boshlash", color = Ink)
                        }
                        OutlinedButton(
                            shape = MaterialTheme.shapes.large,
                            onClick = { videoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
                            enabled = !ui.saving && !mediaBusy,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        ) { Text("Video tanlash va tahlil qilish", color = Ink) }
                        val result = finished
                        if (result != null) PatientCard {
                            SectionTitle("Kamera o‘lchovi · Full")
                            Text("${cameraElapsed / 1000} soniya", color = Muted)
                            Text("To‘liq ${result.validReps} · Chala ${result.shallowReps}")
                            result.pose?.let { Text(analyzePoseDiagnostics(it).patientCoachingUz) }
                            result.minAngle?.let { Text("${if (movement.direction == PoseDirection.Extend) "Eng katta" else "Eng kichik"} burchak ${it.roundToInt()}°") }
                            if (aiCoachLoading) PatientNotice("AI murabbiy maslahat tayyorlamoqda…")
                            aiCoachAdvice?.let { advice ->
                                Text("AI murabbiy (${advice.source}${if (advice.model.isNotBlank()) " · ${advice.model}" else ""})", color = Action, style = MaterialTheme.typography.labelLarge)
                                Text(advice.text)
                                Text("Keyingi e’tibor: ${advice.cue}", color = Muted)
                            }
                            aiCoachError?.let { Text(it, color = Muted) }
                            if (mobile != null && !aiCoachLoading) {
                                TextButton(onClick = { requestCoachForResult(result, plan) }) {
                                    Text("AI murabbiy maslahatini yangilash")
                                }
                            }
                            if (canSave) PrimaryAction("Natijani saqlash", enabled = !ui.saving) {
                                submit(result.asEvidence(), "Kamera o‘lchovi", runDate) { finished = null }
                            }
                        }
                        if (canSave || mobile == null) TextButton(onClick = { manual = !manual }, enabled = !mediaBusy) {
                            Text("Takrorni qo‘lda kiritish")
                        }
                        if (manual && !mediaBusy && (canSave || mobile == null)) ManualExerciseInput(ui.saving) { reps ->
                            submit(JSONObject().put("source", "self_report").put("reason", "manual").put("reps", reps),
                                "Qo‘lda qayd") { manual = false }
                        }
                    }
                    if (sampleDownload != null) {
                        PatientNotice("Namuna yuklanmoqda · $sampleProgress%")
                        TextButton(onClick = { sampleDownload?.cancel() }) { Text("Yuklashni bekor qilish") }
                    }
                    if (clip != null) {
                        PatientNotice("${videoAccuracy.name} video tahlili · $videoProgress%")
                        TextButton(onClick = { clip = null }) { Text("Video tahlilini bekor qilish") }
                    }
                    videoResult?.let { result ->
                        if (result.measurement.savable && result.sha256 != null) {
                            androidx.compose.runtime.key(result) {
                                ExerciseVideoResultPanel(result, mobile, savedVideo, ui.saving,
                                    canSave = canSave && videoQueueId == null && result.movement == movement) {
                                    submit(result.measurement.asEvidence(result.sha256), "Video o‘lchovi") { videoQueueId = it }
                                }
                            }
                        } else ExerciseVideoRetake(result)
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
private fun RowSafety(onPain: () -> Unit, onEmergency: () -> Unit, enabled: Boolean) {
    androidx.compose.foundation.layout.Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 2.dp)
            .background(Urgent, androidx.compose.foundation.shape.RoundedCornerShape(7.dp)),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onPain, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
            Text("Og‘riq bor", color = UrgentInk)
        }
        TextButton(onClick = onEmergency, modifier = Modifier.heightIn(min = 48.dp)) {
            Text("Tez yordam · 103", color = UrgentInk)
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
            if (attempt.hasVideo) Badge("Video yuborildi", Positive, PositiveInk)
            if (review == null) Text("Shifokor paneliga yuborildi")
            else {
                Text(if (review.retake) "Qayta o‘lchash so‘raldi" else "Shifokor ko‘rib chiqdi")
                Text(review.body)
            }
        }
    }
}
