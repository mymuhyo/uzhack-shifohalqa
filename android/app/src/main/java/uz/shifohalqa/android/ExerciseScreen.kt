package uz.shifohalqa.android

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.time.LocalDate
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

private val samplePlan = ExercisePlan("sample", 100, 5)

@Composable
internal fun ExerciseScreen(
    mobile: MobileWorkspaceModel?,
    onBack: () -> Unit,
    onOpenSettings: (() -> Unit)? = null,
) {
    val colors = ShifoThemeTokens.colors
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val haptic = LocalHapticFeedback.current
    val ui = mobile?.exercise ?: ExerciseUi(
        planLoaded = true,
        plan = samplePlan,
    )
    val plan = ui.plan

    var selectedMovementKey by rememberSaveable(plan?.movement?.apiKey) {
        mutableStateOf(plan?.movement?.apiKey ?: PoseMovement.ChairStand.apiKey)
    }
    val activeMovement = PoseMovement.fromApiKey(selectedMovementKey)
    val activeAnalysisPlan = if (plan != null && activeMovement == plan.movement) {
        plan
    } else {
        ExercisePlan(
            id = plan?.id ?: "sample",
            targetAngle = activeMovement.defaultTargetAngle,
            targetReps = activeMovement.defaultTargetReps,
            movement = activeMovement,
            maxShallow = activeMovement.defaultMaxShallow,
        )
    }

    val modelMode = mobile?.poseModelMode ?: PoseModelMode.Full
    var running by remember { mutableStateOf(false) }
    var frame by remember { mutableStateOf<ExerciseCameraFrame?>(null) }
    var finished by remember { mutableStateOf<ExerciseMeasurement?>(null) }
    var runDate by remember { mutableStateOf(exerciseToday()) }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var manual by rememberSaveable { mutableStateOf(false) }
    var clip by remember { mutableStateOf<ExerciseClip?>(null) }
    var downloadingSample by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableStateOf(0) }
    var videoResult by remember { mutableStateOf<ExerciseVideoResult?>(null) }
    var videoProgress by remember { mutableStateOf(0) }
    var videoThumbnail by remember { mutableStateOf<Bitmap?>(null) }
    var showSampleAi by rememberSaveable { mutableStateOf(false) }
    var audioEnabled by rememberSaveable { mutableStateOf(true) }

    var aiCoachAdvice by remember { mutableStateOf<PublicExerciseAdvice?>(null) }
    var aiCoachLoading by remember { mutableStateOf(false) }
    var aiCoachError by remember { mutableStateOf<String?>(null) }

    var keyframeReports by remember { mutableStateOf<List<KeyframeReviewReport>>(emptyList()) }
    var keyframeLoading by remember { mutableStateOf(false) }
    var keyframeNote by remember { mutableStateOf<String?>(null) }

    var savedAttemptForUpload by remember { mutableStateOf<Pair<String, ExerciseVideoResult>?>(null) }
    var uploadConsent by rememberSaveable { mutableStateOf(false) }

    val isPreview = LocalInspectionMode.current
    val coachScope = rememberCoroutineScope()
    val audioCoach = remember(context, isPreview) { if (isPreview) null else UzbekAudioCoach(context) }

    DisposableEffect(audioCoach) {
        onDispose { audioCoach?.release() }
    }
    LaunchedEffect(audioEnabled, audioCoach) {
        if (!audioEnabled) audioCoach?.stopAll()
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

    LaunchedEffect(frame, running) {
        if (!running) return@LaunchedEffect
        val current = frame ?: return@LaunchedEffect
        if (current.result.validReps > lastValidSpoken) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        }
        if (!audioEnabled || audioCoach == null) return@LaunchedEffect
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

    fun requestCoachForResult(measurement: ExerciseMeasurement, usedPlan: ExercisePlan) {
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
                    put("movement", usedPlan.movement.apiKey)
                    put("targetAngle", usedPlan.targetAngle)
                    put("targetReps", usedPlan.targetReps)
                    put("maxShallow", usedPlan.maxShallow)
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
                aiCoachError = "AI murabbiy javob bermadi; lokal biomexanika tahlili ko‘rsatildi."
            } finally {
                aiCoachLoading = false
            }
        }
    }

    fun runKeyframeObservation(result: ExerciseVideoResult, attemptId: String? = null) {
        val pose = result.measurement.pose ?: return
        val selectedClip = result.clip ?: return
        val diag = analyzePoseDiagnostics(pose)
        val flagged = selectFlaggedCycles(pose, diag)
        if (flagged.isEmpty()) return

        keyframeLoading = true
        keyframeNote = null
        coachScope.launch {
            try {
                val collected = mutableListOf<KeyframeReviewReport>()
                for (cycle in flagged) {
                    val frames = extractCycleKeyframes(context, selectedClip, cycle, result.durationMs, count = 4)
                    if (frames.size >= 3) {
                        if (mobile != null) {
                            val payload = buildKeyframeReviewPayload(
                                attemptId = attemptId,
                                movement = result.movement,
                                targetAngle = pose.targetAngle,
                                cycle = cycle,
                                keyframes = frames,
                            )
                            collected.add(mobile.reviewExerciseKeyframes(payload))
                        }
                    }
                }
                keyframeReports = collected
                if (mobile == null) {
                    keyframeNote = "Kadrlar tahlili uchun serverga ulaning."
                }
            } catch (_: MobileFailure) {
                keyframeNote = "AI kadr sharhi vaqtincha ishlamadi — lokal CV o‘lchovi saqlanadi."
            } catch (_: Exception) {
                keyframeNote = "Kadrlar ajratishda xatolik — lokal CV natijasi bilan davom eting."
            } finally {
                keyframeLoading = false
            }
        }
    }

    fun startVideo(input: ExerciseClip) {
        finished = null
        notice = null
        videoResult = null
        videoThumbnail = null
        keyframeReports = emptyList()
        keyframeNote = null
        savedAttemptForUpload = null
        uploadConsent = false
        mobile?.resetVideoUploadState()
        videoProgress = 0
        showSampleAi = input.isPublic && input.sampleMovement == PoseMovement.ChairStand
        clip = input
    }

    fun launchPreparedSample(movement: PoseMovement) {
        notice = null
        downloadingSample = true
        downloadProgress = 0
        coachScope.launch {
            try {
                val sampleClip = if (mobile != null) {
                    mobile.resolveSampleClip(movement) { downloadProgress = it }
                } else {
                    SampleVideoCache(context).resolveClip(SampleVideoCatalog.specFor(movement), null) {
                        downloadProgress = it
                    }
                }
                startVideo(sampleClip)
            } catch (failure: MobileFailure) {
                notice = if (failure.kind == MobileFailureKind.Offline) {
                    "Namuna videosi telefonda keshlanmagan. Uni bir marta yuklab olish uchun internet va veb-panelga ulaning."
                } else {
                    "Namuna videosini yuklab bo‘lmadi. Qayta urinib ko‘ring."
                }
            } finally {
                downloadingSample = false
            }
        }
    }

    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { startVideo(ExerciseClip.fromPicker(it)) }
    }

    LaunchedEffect(clip, modelMode) {
        val selected = clip ?: return@LaunchedEffect
        try {
            val result = analyzeExerciseVideo(
                context = context,
                clip = selected,
                targetAngle = activeAnalysisPlan.targetAngle,
                movement = activeAnalysisPlan.movement,
                targetReps = activeAnalysisPlan.targetReps,
                maxShallow = activeAnalysisPlan.maxShallow,
                modelMode = modelMode,
            ) {
                videoProgress = it
            }
            videoResult = result
            if (!selected.isPublic) {
                videoThumbnail = extractVideoThumbnail(context, selected)
            }
            if (!result.measurement.savable) {
                notice = "Videodan yetarli o‘lchov olinmadi. Boshqa video tanlang yoki takrorlarni qo‘lda kiriting."
                manual = true
            } else {
                requestCoachForResult(result.measurement, activeAnalysisPlan)
                runKeyframeObservation(result)
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
        videoThumbnail = null
        keyframeReports = emptyList()
        keyframeNote = null
        savedAttemptForUpload = null
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

    fun submitOfflineOrDemo(evidence: JSONObject, title: String, date: LocalDate = exerciseToday(), onSaved: (String?) -> Unit = {}) {
        if (mobile == null) {
            notice = "Namuna qaydi. Shifokorga yuborish uchun veb-panelga ulang."
            onSaved(null)
            return
        }
        val payload = evidence.put("movement", activeMovement.apiKey)
        coachScope.launch {
            val (ok, serverId) = mobile.submitExerciseAttempt(payload, title, date)
            if (ok) {
                notice = null
                onSaved(serverId)
            }
        }
    }

    fun reportPain() {
        clip = null
        videoResult = null
        running = false
        finished = null
        frame = null
        submitOfflineOrDemo(JSONObject().put("source", "self_report").put("reason", "pain"), "Og‘riq xabari")
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
        Modifier
            .fillMaxSize()
            .background(if (running) Color(0xFF090A0D) else colors.background)
            .let { if (mobile == null) it.windowInsetsPadding(WindowInsets.safeDrawing) else it },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (running) {
            ExerciseCamera(Modifier.weight(1f).fillMaxWidth(), activeAnalysisPlan, onFrame = { frame = it }) {
                running = false
                frame = null
                manual = true
                notice = "Kamerani ochib bo‘lmadi. Qayta urinishingiz yoki takrorlarni qo‘lda kiritishingiz mumkin."
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF090A0D))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val reading = frame
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Jonli kamera · Full",
                        color = Color(0xFF9CA3AF),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    reading?.angle?.let {
                        Text(
                            "${activeMovement.jointLabelUz} ${it.roundToInt()}° / ${activeAnalysisPlan.targetAngle}°",
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                Text(
                    when {
                        reading == null -> "Kamera ishga tushmoqda…"
                        reading.ready -> "Kamera tayyor · To‘liq ${reading.result.validReps} · Chala ${reading.result.shallowReps}"
                        else -> "Yon tomoningiz bilan turing. ${activeMovement.pointsLabelUz} kadrda ko‘rinsin."
                    },
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                )
                val activeWarning = reading?.formWarning ?: reading?.result?.pose?.biomechanics?.currentFormWarning
                ShifoPill(
                    label = activeWarning?.let { "AI maslahat: ${it.labelUz}" } ?: "Texnika: Me’yor",
                    tone = if (activeWarning != null) ShifoTone.Warn else ShifoTone.Ok,
                )
                PrimaryAction("To‘xtatish") {
                    running = false
                    val savable = reading?.result?.takeIf { it.savable }
                    finished = savable
                    frame = null
                    if (savable == null) {
                        notice = "Yetarli o‘lchov olinmadi. Qayta urinishingiz yoki takrorlarni qo‘lda kiritishingiz mumkin."
                        manual = true
                    } else {
                        if (audioEnabled) audioCoach?.speakDone()
                        requestCoachForResult(savable, activeAnalysisPlan)
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShifoOutlineButton(
                        label = "Og‘riq bor",
                        urgent = true,
                        enabled = !ui.saving,
                        modifier = Modifier.weight(1f),
                        onClick = ::reportPain,
                    )
                    TextButton(
                        onClick = { dialEmergency103(context) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Tez yordam · 103", color = Color(0xFFFB7185))
                    }
                }
            }
        } else {
            ShifoTopBar(
                badgeLabel = if (mobile == null) "Namuna" else if (mobile.state.isDemo) "Demo" else "Klinika",
                badgeTone = if (mobile == null) ShifoTone.Neutral else ShifoTone.Accent,
                onEmergency103 = { dialEmergency103(context) },
                onOpenSettings = onOpenSettings,
            )
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                PatientPage {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(onClick = onBack) { Text("Bugungi vazifalar") }
                        TextButton(onClick = { dialEmergency103(context) }) { Text("Tez yordam · 103") }
                    }

                    PageTitle(activeMovement.titleUz)

                    // 3 polished Grand Final movement selector
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SampleVideoCatalog.GrandFinalMovements.forEach { item ->
                            val selected = activeMovement == item
                            val isPrescribed = plan?.movement == item
                            val shape = RoundedCornerShape(ShifoRadiusMd)
                            Column(
                                Modifier
                                    .weight(1f)
                                    .heightIn(min = 52.dp)
                                    .clip(shape)
                                    .background(if (selected) colors.surfaceAccent else colors.surfaceLow)
                                    .border(1.dp, if (selected) colors.primary else colors.outlineVariant, shape)
                                    .clickable(enabled = clip == null && !downloadingSample, role = Role.Tab) {
                                        selectedMovementKey = item.apiKey
                                        videoResult = null
                                        finished = null
                                        notice = null
                                        manual = false
                                        keyframeReports = emptyList()
                                        savedAttemptForUpload = null
                                    }
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Text(
                                    text = item.shortTitleUz,
                                    color = if (selected) colors.ink else colors.inkVariant,
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (isPrescribed && mobile != null) {
                                    Text("Rejada", color = colors.primary, style = MaterialTheme.typography.labelMedium)
                                }
                            }
                        }
                    }

                    if (mobile == null) {
                        var movementsOpen by remember { mutableStateOf(false) }
                        Box {
                            TextButton(enabled = clip == null, onClick = { movementsOpen = true }) { Text("Mashq turini tanlash") }
                            DropdownMenu(expanded = movementsOpen, onDismissRequest = { movementsOpen = false }) {
                                PoseMovement.entries.forEach { item ->
                                    DropdownMenuItem(text = { Text(item.shortTitleUz) }, onClick = {
                                        selectedMovementKey = item.apiKey
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

                    notice?.let { PatientNotice(it, tone = ShifoTone.Warn) }
                    ui.message?.let { PatientNotice(it, tone = ShifoTone.Warn) }

                    // Accuracy selector banner + plan info
                    ShifoTonalCard {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = if (plan != null) "Rejadagi maqsad · ${activeAnalysisPlan.targetReps} takror · ${activeAnalysisPlan.targetAngle}°"
                                    else "Mashq rejasi yuklanmagan",
                                    color = colors.ink,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    "Video tahlil modeli: ${modelMode.labelUz}",
                                    color = colors.inkMuted,
                                    style = MaterialTheme.typography.labelLarge,
                                )
                            }
                            if (mobile != null) {
                                val nextMode = if (modelMode == PoseModelMode.Full) PoseModelMode.Heavy else PoseModelMode.Full
                                TextButton(onClick = { mobile.updatePoseModelMode(nextMode) }) {
                                    Text("Almashtirish (${nextMode.shortUz})")
                                }
                            }
                        }
                        TextButton(onClick = { audioEnabled = !audioEnabled }) {
                            Text("Ovozli sanoq: ${if (audioEnabled) "Yoqilgan" else "O‘chirilgan"}")
                        }
                    }

                    PrimaryAction(
                        label = "Kamerani boshlash",
                        enabled = !ui.saving && clip == null && !downloadingSample,
                    ) {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            startCamera()
                        } else {
                            permission.launch(Manifest.permission.CAMERA)
                        }
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ShifoOutlineButton(
                            label = "Video tanlash va tahlil qilish",
                            enabled = !ui.saving && clip == null && !downloadingSample,
                            modifier = Modifier.weight(1f),
                            onClick = { videoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
                        )
                    }

                    // Prepared sample launcher for all 3 polished movements
                    val sampleSpec = SampleVideoCatalog.specFor(activeMovement)
                    val isCached = remember(activeMovement, downloadingSample) {
                        sampleSpec.bundledAssetName != null || SampleVideoCache(context).cachedFileIfValid(sampleSpec) != null
                    }
                    ShifoOutlineButton(
                        label = when {
                            downloadingSample -> "Namuna yuklanmoqda · $downloadProgress%"
                            isCached -> "Tayyor namunani (${modelMode.shortUz}) bilan tahlil qilish"
                            else -> "Tayyor namunani yuklab tahlil qilish (${modelMode.shortUz})"
                        },
                        enabled = clip == null && !ui.saving && !downloadingSample,
                        onClick = { launchPreparedSample(activeMovement) },
                    )

                    if (clip != null) {
                        ShifoTonalCard(accent = true) {
                            Text(
                                "${modelMode.shortUz} video tahlili · $videoProgress%",
                                color = colors.primary,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            LinearProgressIndicator(
                                progress = { (videoProgress / 100f).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth(),
                                color = colors.primary,
                                trackColor = colors.surfaceLow,
                                drawStopIndicator = {},
                            )
                            TextButton(onClick = { clip = null }) { Text("Video tahlilini bekor qilish") }
                        }
                    }

                    // Live camera result
                    val result = finished
                    if (result != null) {
                        ShifoCard(Modifier.animateContentSize()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                SectionTitle("Kamera o‘lchovi · Full")
                                ShifoPill("L3", ShifoTone.Ok)
                            }
                            Text("To‘liq ${result.validReps} · Chala ${result.shallowReps}", color = colors.ink, style = MaterialTheme.typography.titleMedium)
                            result.pose?.let { Text(analyzePoseDiagnostics(it).patientCoachingUz, color = colors.inkVariant) }
                            result.minAngle?.let {
                                Text(
                                    "${if (activeMovement.direction == PoseDirection.Extend) "Eng katta" else "Eng kichik"} burchak ${it.roundToInt()}°",
                                    color = colors.inkMuted,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                            if (aiCoachLoading) PatientNotice("AI murabbiy maslahat tayyorlamoqda…", tone = ShifoTone.Accent)
                            aiCoachAdvice?.let { advice ->
                                Text(
                                    "AI murabbiy (${advice.source}${if (advice.model.isNotBlank()) " · ${advice.model}" else ""})",
                                    color = colors.ok,
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                Text(advice.text, color = colors.ink)
                                Text("Keyingi e’tibor: ${advice.cue}", color = colors.inkMuted)
                            }
                            aiCoachError?.let { Text(it, color = colors.inkMuted) }
                            if (mobile != null && !aiCoachLoading) {
                                TextButton(onClick = { requestCoachForResult(result, activeAnalysisPlan) }) {
                                    Text("AI murabbiy maslahatini yangilash")
                                }
                            }
                            if (plan != null && activeMovement == plan.movement) {
                                PrimaryAction("Natijani saqlash", enabled = !ui.saving, withHaptic = true) {
                                    submitOfflineOrDemo(result.asEvidence(), "Kamera o‘lchovi", runDate) {
                                        finished = null
                                    }
                                }
                            } else if (mobile == null) {
                                PrimaryAction("Natijani saqlash", enabled = !ui.saving) {
                                    submitOfflineOrDemo(result.asEvidence(), "Kamera o‘lchovi", runDate) {
                                        finished = null
                                    }
                                }
                            } else {
                                PatientNotice("Hozircha shifokor rejangizda ${plan?.movement?.shortTitleUz ?: "boshqa mashq"} belgilangan.", tone = ShifoTone.Neutral)
                            }
                        }
                    }

                    // Video analysis result + Keyframe AI + Consented Full Video Upload
                    videoResult?.let { vResult ->
                        if (vResult.measurement.savable && vResult.sha256 != null) {
                            val secText = String.format(Locale.US, "%.1f soniya", vResult.elapsedMs / 1000.0)
                            ShifoCard(Modifier.animateContentSize()) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    SectionTitle(
                                        if (vResult.isPublic) "${vResult.modelMode.shortUz} o‘lchovi · Namuna"
                                        else "${vResult.modelMode.shortUz} o‘lchovi · Tanlangan video",
                                    )
                                    ShifoPill(secText, ShifoTone.Accent)
                                }
                                Text(
                                    "To‘liq ${vResult.measurement.validReps} · Chala ${vResult.measurement.shallowReps}",
                                    color = colors.ink,
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                vResult.measurement.minAngle?.let {
                                    Text(
                                        "${if (vResult.movement.direction == PoseDirection.Extend) "Eng katta" else "Eng kichik"} burchak ${it.roundToInt()}°",
                                        color = colors.inkMuted,
                                    )
                                }
                                vResult.measurement.pose?.let {
                                    Text(analyzePoseDiagnostics(it).patientCoachingUz, color = colors.inkVariant)
                                }

                                // Keyframe AI observations
                                if (keyframeLoading) {
                                    PatientNotice("Muammoli sikl kadrlari AI orqali ko‘rilmoqda…", tone = ShifoTone.Accent)
                                }
                                keyframeReports.forEach { kf ->
                                    ShifoTonalCard(accent = true) {
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                            Text("${kf.cycleNumber}-takror · ${kf.timeRangeLabel}", color = colors.primary, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                            ShifoPill(if (kf.sourceMode == "ai") "AI kuzatuv" else "Lokal kuzatuv", ShifoTone.Neutral)
                                        }
                                        Text(kf.observationUz, color = colors.ink, style = MaterialTheme.typography.bodyMedium)
                                        Text(kf.uncertaintyNoteUz, color = colors.inkMuted, style = MaterialTheme.typography.labelMedium)
                                    }
                                }
                                keyframeNote?.let { Text(it, color = colors.inkMuted, style = MaterialTheme.typography.bodyMedium) }

                                if (plan != null && vResult.movement == plan.movement) {
                                    if (savedAttemptForUpload == null) {
                                        Text(
                                            "Video faqat siz ruxsat bersangiz yuklanadi. Hozir faqat o‘lchov xulosasi saqlanadi.",
                                            color = colors.inkMuted,
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                        PrimaryAction("Natijani tasdiqlash va saqlash", enabled = !ui.saving, withHaptic = true) {
                                            submitOfflineOrDemo(vResult.measurement.asEvidence(vResult.sha256), "Video o‘lchovi") { serverId ->
                                                if (!vResult.isPublic && serverId != null && vResult.clip != null) {
                                                    savedAttemptForUpload = serverId to vResult
                                                    if (keyframeReports.isNotEmpty()) {
                                                        runKeyframeObservation(vResult, attemptId = serverId)
                                                    }
                                                } else {
                                                    videoResult = null
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Consented Video Upload Section
                    savedAttemptForUpload?.let { (attemptId, uploadResult) ->
                        val clipToUpload = uploadResult.clip
                        val uploadUi = mobile?.videoUpload ?: VideoUploadUiState()
                        if (clipToUpload != null && mobile != null) {
                            ShifoTonalCard(accent = true) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Icon(ShifoIcons.Video, contentDescription = null, modifier = Modifier.size(19.dp), tint = colors.primary)
                                    SectionTitle("Shifokorga video yuborish")
                                }
                                videoThumbnail?.let { bmp ->
                                    Image(
                                        bitmap = bmp.asImageBitmap(),
                                        contentDescription = "Tanlangan mashq videosi ko‘rinishi",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxWidth().heightIn(max = 170.dp).clip(RoundedCornerShape(ShifoRadiusMd)),
                                    )
                                }
                                val durationSec = max(1, (uploadResult.durationMs / 1000L).toInt())
                                val sizeMb = String.format(Locale.US, "%.1f MiB", uploadResult.sizeBytes / (1024.0 * 1024.0))
                                Text(
                                    "Davomiyligi: $durationSec s · Hajmi: $sizeMb · Chegara: ≤ 60 s, ≤ 20 MiB",
                                    color = colors.inkMuted,
                                    style = MaterialTheme.typography.labelLarge,
                                )

                                if (uploadUi.completedAttemptId == attemptId) {
                                    PatientNotice("Video shifokorga muvaffaqiyatli yuborildi (maxfiy saqlanadi).", tone = ShifoTone.Ok)
                                    TextButton(onClick = {
                                        savedAttemptForUpload = null
                                        videoResult = null
                                        mobile.resetVideoUploadState()
                                    }) { Text("Yopish") }
                                } else {
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .heightIn(min = 48.dp)
                                            .clip(RoundedCornerShape(ShifoRadiusMd))
                                            .background(colors.surface)
                                            .border(1.dp, colors.outlineVariant, RoundedCornerShape(ShifoRadiusMd))
                                            .clickable(enabled = !uploadUi.uploading, role = Role.Checkbox) {
                                                uploadConsent = !uploadConsent
                                            }
                                            .padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Checkbox(checked = uploadConsent, onCheckedChange = null, enabled = !uploadUi.uploading)
                                        Text(
                                            "Shu urinish videosini shifokorga yuborish (ko‘rikdan so‘ng 7 kun yoki ko‘pi bilan 30 kun saqlanadi).",
                                            color = colors.ink,
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                    }

                                    if (uploadUi.uploading) {
                                        Text("Yuklanmoqda · ${uploadUi.progress}%", color = colors.primary, style = MaterialTheme.typography.labelLarge)
                                        LinearProgressIndicator(
                                            progress = { (uploadUi.progress / 100f).coerceIn(0f, 1f) },
                                            modifier = Modifier.fillMaxWidth(),
                                            color = colors.primary,
                                            trackColor = colors.surfaceLow,
                                            drawStopIndicator = {},
                                        )
                                        ShifoOutlineButton(label = "Bekor qilish", urgent = true, onClick = mobile::cancelConsentedVideoUpload)
                                    } else {
                                        uploadUi.error?.let { PatientNotice(it, tone = ShifoTone.Warn) }
                                        PrimaryAction(
                                            label = "Shu urinish videosini shifokorga yuborish",
                                            enabled = uploadConsent,
                                        ) {
                                            mobile.startConsentedVideoUpload(
                                                attemptId = attemptId,
                                                clip = clipToUpload,
                                                durationMs = uploadResult.durationMs,
                                                sizeBytes = uploadResult.sizeBytes,
                                                mimeType = uploadResult.mimeType,
                                            )
                                        }
                                        TextButton(onClick = {
                                            savedAttemptForUpload = null
                                            videoResult = null
                                        }) {
                                            Text("Videosiz davom etish")
                                        }
                                    }
                                }
                            }
                        }
                    }

                    ShifoOutlineButton(label = "Og‘riq bor", urgent = true, enabled = !ui.saving, onClick = ::reportPain)

                    TextButton(onClick = { manual = !manual }, enabled = clip == null) {
                        Text("Takrorni qo‘lda kiritish")
                    }
                    AnimatedVisibility(visible = manual && clip == null) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            ManualExerciseInput(ui.saving) { reps ->
                                submitOfflineOrDemo(
                                    JSONObject().put("source", "self_report").put("reason", "manual").put("reps", reps),
                                    "Qo‘lda qayd",
                                ) { manual = false }
                            }
                        }
                    }

                    if (clip?.isPublic != false && videoResult?.isPublic != false && activeMovement == PoseMovement.ChairStand) {
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
    OutlinedTextField(
        value = value,
        onValueChange = { if (it.length <= 3 && it.all { char -> char in '0'..'9' }) value = it },
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Takrorlar soni") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
    )
    PrimaryAction("Qo‘lda qayd saqlash", enabled = reps != null && !saving) {
        reps?.let(onSubmit)
    }
}

@Composable
private fun ExerciseHistory(ui: ExerciseUi, onDiscard: (String) -> Unit) {
    val colors = ShifoThemeTokens.colors
    if (ui.outbox.isNotEmpty() || ui.attempts.isNotEmpty()) SectionTitle("Mashq qaydlari va javoblar")
    val received = ui.attempts.mapTo(mutableSetOf()) { it.id }
    ui.outbox.filter { it.serverId !in received }.forEach { attempt ->
        ShifoCard {
            SectionTitle(attempt.label)
            Text(
                when (attempt.status) {
                    "sent" -> "Shifokor paneliga yuborildi"
                    "rejected" -> "Qayd yuborilmadi. Rejani yangilang va qayta qayd eting."
                    else -> "Telefonda saqlandi, hali yuborilmadi."
                },
                color = colors.inkVariant,
            )
            if (attempt.status == "rejected") {
                TextButton(onClick = { onDiscard(attempt.id) }) { Text("Ushbu qaydni olib tashlash") }
            }
        }
    }
    ui.attempts.forEach { attempt ->
        ShifoCard {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                SectionTitle(attempt.title)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (attempt.hasVideo) {
                        ShifoPill(if (attempt.videoExpired) "Video muddati tugagan" else "Video biriktirilgan", ShifoTone.Accent)
                    }
                    ShifoPill("L${attempt.level}", if (attempt.level == 4) ShifoTone.Ok else ShifoTone.Neutral)
                }
            }
            Text("${attempt.movement.shortTitleUz} · ${displayDate(attempt.date)}", color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
            attempt.reps?.let { reps ->
                Text(
                    attempt.shallow?.let { "To‘liq $reps · Chala $it" } ?: "$reps takror",
                    color = colors.ink,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            attempt.patientCoachingUz?.let { Text(it, color = colors.inkVariant, style = MaterialTheme.typography.bodyMedium) }
            val review = attempt.review
            if (review == null) {
                Text("Shifokor paneliga yuborildi", color = colors.inkMuted)
            } else {
                ShifoPill(
                    label = if (review.retake) "Qayta o‘lchash so‘raldi" else "Shifokor ko‘rib chiqdi",
                    tone = if (review.retake) ShifoTone.Warn else ShifoTone.Ok,
                )
                Text(review.body, color = colors.ink, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}
