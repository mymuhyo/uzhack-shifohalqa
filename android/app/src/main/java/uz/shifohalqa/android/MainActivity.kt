package uz.shifohalqa.android

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.edit

class MainActivity : ComponentActivity() {
    private val mobile by viewModels<MobileWorkspaceModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, 0x80172F28.toInt()),
        )
        val demo = PatientDemo(this)
        setContent { ShifoTheme { PatientApp(demo, mobile) } }
    }
}

internal enum class MissedReason(val label: String, val apiValue: String) {
    OUT_OF_SUPPLY("Dori tugadi", "out_of_supply"),
    SIDE_EFFECTS("Nojo‘ya ta’sir bo‘ldi", "side_effects"),
    FORGOT("Unutdim", "forgot"),
    OTHER("Boshqa sabab", "other"),
}

internal data class MedicationEntry(val reason: MissedReason?, val replyShown: Boolean = false) {
    val status get() = if (reason == null) "Ichdim" else "Icha olmadim"
}

internal class PatientDemo(context: Context) {
    private val prefs = context.getSharedPreferences("patient_demo", Context.MODE_PRIVATE)

    var entry by mutableStateOf(readEntry())
        private set

    fun record(reason: MissedReason?) {
        if (entry != null) return
        prefs.edit { putString("entry", reason?.name ?: "TAKEN") }
        entry = MedicationEntry(reason)
    }

    fun showSampleReply() {
        val current = entry ?: return
        if (current.reason != MissedReason.OUT_OF_SUPPLY || current.replyShown) return
        prefs.edit { putBoolean("reply_shown", true) }
        entry = current.copy(replyShown = true)
    }

    fun reset() {
        prefs.edit { clear() }
        entry = null
    }

    private fun readEntry(): MedicationEntry? {
        val saved = prefs.getString("entry", null) ?: return null
        if (saved == "TAKEN") return MedicationEntry(null)
        val reason = MissedReason.entries.find { it.name == saved } ?: return null
        return MedicationEntry(reason, reason == MissedReason.OUT_OF_SUPPLY && prefs.getBoolean("reply_shown", false))
    }
}
