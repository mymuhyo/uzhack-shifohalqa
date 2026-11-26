package uz.shifohalqa.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class SampleBoxOption(val id: String, val label: String)

private val dorimosSampleOptions = listOf(
    SampleBoxOption("box-5mg", "Namuna 5 mg"),
    SampleBoxOption("box-10mg", "Namuna 10 mg"),
    SampleBoxOption("box-other", "Andoza dori 5 mg"),
    SampleBoxOption("box-unreadable", "Xira quti"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DorimosSheet(
    task: MobileTask,
    isDemo: Boolean,
    mobile: MobileWorkspaceModel,
    onDismiss: () -> Unit,
) {
    val colors = ShifoThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var busy by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var confirmation by remember { mutableStateOf<DorimosOutcome.NeedsConfirmation?>(null) }
    var previewBitmap by remember { mutableStateOf<ImageBitmap?>(null) }
    var pendingPhotoUri by remember { mutableStateOf<Uri?>(null) }

    fun handleOutcome(outcome: DorimosOutcome, isManual: Boolean) {
        when (outcome) {
            is DorimosOutcome.NeedsConfirmation -> {
                confirmation = outcome
                statusMessage = "Qutidan o‘qildi: ${outcome.drugName} · ${outcome.strengthLabel}. Yozuvni tasdiqlang."
            }
            DorimosOutcome.Retake -> {
                confirmation = null
                statusMessage = "Quti yozuvi xira yoki o‘qib bo‘lmadi. Yorug‘roq joyda yaqinroqdan rasmga oling."
            }
            DorimosOutcome.ManualFallback -> {
                confirmation = null
                statusMessage = if (isManual) "Qo‘lda qayd saqlanmadi." else "AI tekshiruvi vaqtincha ishlamadi. Qo‘lda qayd etishingiz mumkin."
            }
            DorimosOutcome.Deferred, DorimosOutcome.Saved, DorimosOutcome.AlreadySaved -> {
                scope.launch {
                    sheetState.hide()
                    onDismiss()
                }
            }
            DorimosOutcome.Expired -> {
                confirmation = null
                statusMessage = "Tasdiqlash muddati tugadi. Qaytadan rasmga oling."
            }
            DorimosOutcome.Rejected -> {
                confirmation = null
                statusMessage = "Qayd qabul qilinmadi. Sahifani yangilang."
            }
        }
    }

    fun scanPhotoUri(uri: Uri) {
        busy = true
        confirmation = null
        statusMessage = "Kamera rasmi AI orqali tekshirilmoqda…"
        scope.launch {
            try {
                val decoded = prepareBoxJpeg(context, uri)
                if (decoded == null) {
                    statusMessage = "Rasmni o‘qib bo‘lmadi. Qayta urinib ko‘ring."
                    return@launch
                }
                previewBitmap = decoded.first
                val outcome = mobile.dorimosScanPhoto(task.id, decoded.second)
                handleOutcome(outcome, isManual = false)
            } catch (_: MobileFailure) {
                statusMessage = "Aloqa uzildi yoki AI javob bermadi. Qayta urinib ko‘ring."
            } finally {
                busy = false
            }
        }
    }

    val takePictureLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = pendingPhotoUri
        if (ok && uri != null) scanPhotoUri(uri)
    }

    fun launchCamera() {
        val uri = createTempBoxPhotoUri(context)
        pendingPhotoUri = uri
        takePictureLauncher.launch(uri)
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera()
        else statusMessage = "Kameraga ruxsat berilmadi. Galereyadan rasm tanlang."
    }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scanPhotoUri(uri)
    }

    ModalBottomSheet(
        onDismissRequest = { if (!busy) onDismiss() },
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !busy, shouldDismissOnClickOutside = !busy),
        sheetState = sheetState,
        sheetGesturesEnabled = !busy,
        containerColor = colors.surface,
        contentColor = colors.ink,
        shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val strengthText = formatStrength(task.strength, task.strengthUnit)
            val fullTitle = if (strengthText.isNotEmpty()) "${task.title} ($strengthText)" else task.title
            SectionTitle("DoriMos · qutini tekshirish")
            Text(
                "$fullTitle qutisini kamera bilan rasmga oling yoki galereyadan tanlang.",
                color = colors.inkVariant,
                style = MaterialTheme.typography.bodyLarge,
            )
            PrimaryAction("Kamera bilan rasmga olish", enabled = !busy) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    launchCamera()
                } else {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                }
            }
            ShifoOutlineButton(
                label = "Galereyadan rasm tanlash",
                enabled = !busy,
                onClick = { galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            )
            previewBitmap?.let { bmp ->
                Image(
                    bitmap = bmp,
                    contentDescription = "Tanlangan dori qutisi",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 190.dp).clip(RoundedCornerShape(ShifoRadiusMd)),
                )
            }

            if (isDemo) {
                Text("Demo namuna qutilar (sintetik):", color = colors.inkMuted, style = MaterialTheme.typography.labelLarge)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    dorimosSampleOptions.take(2).forEach { sample ->
                        ShifoOutlineButton(
                            label = sample.label,
                            enabled = !busy,
                            modifier = Modifier.weight(1f),
                        ) {
                            busy = true
                            confirmation = null
                            statusMessage = "${sample.label} tekshirilmoqda…"
                            scope.launch {
                                try {
                                    handleOutcome(mobile.dorimosScanSample(task.id, sample.id), isManual = false)
                                } catch (_: MobileFailure) {
                                    statusMessage = "Aloqa uzildi. Qayta urinib ko‘ring."
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    dorimosSampleOptions.drop(2).forEach { sample ->
                        ShifoOutlineButton(
                            label = sample.label,
                            enabled = !busy,
                            modifier = Modifier.weight(1f),
                        ) {
                            busy = true
                            confirmation = null
                            statusMessage = "${sample.label} tekshirilmoqda…"
                            scope.launch {
                                try {
                                    handleOutcome(mobile.dorimosScanSample(task.id, sample.id), isManual = false)
                                } catch (_: MobileFailure) {
                                    statusMessage = "Aloqa uzildi. Qayta urinib ko‘ring."
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    }
                }
            }

            statusMessage?.let { PatientNotice(it, tone = if (confirmation != null) ShifoTone.Accent else ShifoTone.Warn) }

            confirmation?.let { item ->
                ShifoTonalCard(accent = true) {
                    ShifoPill("Ishonch: ${(item.confidence * 100).roundToInt()}%", ShifoTone.Ok)
                    SectionTitle("${item.drugName} · ${item.strengthLabel}")
                    Text(
                        "Model: ${item.model} (${item.decisionModel})",
                        color = colors.inkMuted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    PrimaryAction("Qutidagi yozuvni tasdiqlash (L2)", enabled = !busy, withHaptic = true) {
                        busy = true
                        statusMessage = "Tasdiqlanmoqda…"
                        scope.launch {
                            try {
                                handleOutcome(mobile.dorimosConfirm(task.id, item.token), isManual = false)
                            } catch (_: MobileFailure) {
                                statusMessage = "Saqlab bo‘lmadi. Qayta urinib ko‘ring."
                            } finally {
                                busy = false
                            }
                        }
                    }
                    TextButton(onClick = { confirmation = null }, enabled = !busy) { Text("Rad etish") }
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(
                    onClick = {
                        busy = true
                        statusMessage = "Kechiktirilmoqda…"
                        scope.launch {
                            try {
                                handleOutcome(mobile.dorimosDefer(task.id), isManual = true)
                            } catch (_: MobileFailure) {
                                statusMessage = "Saqlab bo‘lmadi."
                            } finally {
                                busy = false
                            }
                        }
                    },
                    enabled = !busy,
                ) {
                    Text("Keyinroq tekshiraman")
                }
                TextButton(
                    onClick = {
                        busy = true
                        statusMessage = "Qo‘lda qayd saqlanmoqda…"
                        scope.launch {
                            try {
                                handleOutcome(mobile.dorimosManual(task.id), isManual = true)
                            } catch (_: MobileFailure) {
                                statusMessage = "Saqlab bo‘lmadi."
                            } finally {
                                busy = false
                            }
                        }
                    },
                    enabled = !busy,
                ) {
                    Text("Qo‘lda qayd · L0")
                }
            }
            TextButton(onClick = onDismiss, enabled = !busy, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text("Yopish")
            }
        }
    }
}

private fun createTempBoxPhotoUri(context: Context): Uri {
    val dir = File(context.cacheDir, "dorimos").apply { mkdirs() }
    val file = File(dir, "box_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
}

private suspend fun prepareBoxJpeg(context: Context, uri: Uri): Pair<ImageBitmap, ByteArray>? = withContext(Dispatchers.IO) {
    val rawBytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@withContext null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null

    var sampleSize = 1
    while (max(bounds.outWidth, bounds.outHeight) / sampleSize > 2048) sampleSize *= 2
    val decoded = BitmapFactory.decodeByteArray(
        rawBytes,
        0,
        rawBytes.size,
        BitmapFactory.Options().apply { inSampleSize = sampleSize },
    ) ?: return@withContext null

    val scale = min(1f, 1280f / max(decoded.width, decoded.height).toFloat())
    val scaled = if (scale < 0.99f) {
        Bitmap.createScaledBitmap(
            decoded,
            max(1, (decoded.width * scale).roundToInt()),
            max(1, (decoded.height * scale).roundToInt()),
            true,
        ).also { if (it !== decoded) decoded.recycle() }
    } else {
        decoded
    }

    val out = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
    scaled.asImageBitmap() to out.toByteArray()
}
