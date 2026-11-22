package uz.shifohalqa.android

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.media.ToneGenerator

internal class UzbekAudioCoach(context: Context) {
    private val soundPool = SoundPool.Builder()
        .setMaxStreams(1)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        .build()

    private val loaded = mutableSetOf<Int>()
    private val clips = mutableMapOf<String, Int>()
    private var activeStreamId = 0
    private var toneGenerator: ToneGenerator? = runCatching {
        ToneGenerator(AudioManager.STREAM_MUSIC, 65)
    }.getOrNull()

    init {
        soundPool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0) loaded.add(sampleId)
        }
        val rawMap = listOf(
            "cue_ready" to R.raw.cue_ready,
            "cue_deeper" to R.raw.cue_deeper,
            "cue_trunk_lean" to R.raw.cue_trunk_lean,
            "cue_elbow_drift" to R.raw.cue_elbow_drift,
            "cue_shoulder_tilt" to R.raw.cue_shoulder_tilt,
            "cue_lost" to R.raw.cue_lost,
            "cue_done" to R.raw.cue_done,
            "rep_1" to R.raw.rep_1,
            "rep_2" to R.raw.rep_2,
            "rep_3" to R.raw.rep_3,
            "rep_4" to R.raw.rep_4,
            "rep_5" to R.raw.rep_5,
            "rep_6" to R.raw.rep_6,
            "rep_7" to R.raw.rep_7,
            "rep_8" to R.raw.rep_8,
            "rep_9" to R.raw.rep_9,
            "rep_10" to R.raw.rep_10,
            "rep_11" to R.raw.rep_11,
            "rep_12" to R.raw.rep_12,
            "rep_13" to R.raw.rep_13,
            "rep_14" to R.raw.rep_14,
            "rep_15" to R.raw.rep_15,
            "rep_16" to R.raw.rep_16,
            "rep_17" to R.raw.rep_17,
            "rep_18" to R.raw.rep_18,
            "rep_19" to R.raw.rep_19,
            "rep_20" to R.raw.rep_20,
        )
        rawMap.forEach { (key, resId) ->
            clips[key] = soundPool.load(context.applicationContext, resId, 1)
        }
    }

    fun speakRep(count: Int) {
        if (count in 1..20) {
            play("rep_$count", ToneGenerator.TONE_PROP_ACK)
        } else {
            playBeep(ToneGenerator.TONE_PROP_ACK)
        }
    }

    fun speakReady() = play("cue_ready", ToneGenerator.TONE_PROP_BEEP2)
    fun speakDeeper() = play("cue_deeper", ToneGenerator.TONE_PROP_NACK)
    fun speakLost() = play("cue_lost", ToneGenerator.TONE_PROP_NACK)
    fun speakDone() = play("cue_done", ToneGenerator.TONE_PROP_PROMPT)

    fun speakWarning(warning: PoseFormWarning) {
        val key = when (warning) {
            PoseFormWarning.TrunkLean -> "cue_trunk_lean"
            PoseFormWarning.ElbowDrift -> "cue_elbow_drift"
            PoseFormWarning.ShoulderAsymmetry -> "cue_shoulder_tilt"
        }
        play(key, ToneGenerator.TONE_PROP_NACK)
    }

    private fun play(key: String, fallbackTone: Int) {
        val sampleId = clips[key]
        if (sampleId != null && sampleId in loaded) {
            if (activeStreamId != 0) soundPool.stop(activeStreamId)
            activeStreamId = soundPool.play(sampleId, 1f, 1f, 1, 0, 1f)
        } else {
            playBeep(fallbackTone)
        }
    }

    private fun playBeep(tone: Int) {
        runCatching { toneGenerator?.startTone(tone, 140) }
    }

    fun stopAll() {
        if (activeStreamId != 0) {
            runCatching { soundPool.stop(activeStreamId) }
            activeStreamId = 0
        }
    }

    fun release() {
        stopAll()
        runCatching { soundPool.release() }
        runCatching { toneGenerator?.release() }
        toneGenerator = null
    }
}
