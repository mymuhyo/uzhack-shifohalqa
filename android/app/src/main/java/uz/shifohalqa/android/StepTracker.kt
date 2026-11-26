package uz.shifohalqa.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.max
import kotlin.math.roundToInt

private const val MAX_DAILY_STEPS = 999_999
private val tashkentZone = ZoneId.of("Asia/Tashkent")

internal data class StepSnapshot(
    val date: String,
    val count: Int,
    val source: String,
    val needsSync: Boolean,
)

internal class StepDayAccumulator(
    private val todayProvider: () -> String = { LocalDate.now(tashkentZone).toString() },
) {
    private var date: String = todayProvider()
    private var baseline: Float? = null
    private var carrySensorSteps: Int = 0
    private var sensorSteps: Int = 0
    private var simulatedSteps: Int = 0
    private var serverCarrySteps: Int = 0
    private var lastSource: String = "device_sensor"
    private var lastSyncedCount: Int = -1
    private var lastSyncedSource: String? = null

    private fun rollDateIfNeeded() {
        val today = todayProvider()
        if (today == date) return
        date = today
        baseline = null
        carrySensorSteps = 0
        sensorSteps = 0
        simulatedSteps = 0
        serverCarrySteps = 0
        lastSource = "device_sensor"
        lastSyncedCount = -1
        lastSyncedSource = null
    }

    fun restore(
        storedDate: String,
        storedBaseline: Float?,
        storedCarrySensor: Int,
        storedSensorSteps: Int,
        storedSimulated: Int,
        storedServerCarry: Int,
        storedSource: String,
        storedSyncedCount: Int,
        storedSyncedSource: String?,
    ) {
        val today = todayProvider()
        if (storedDate != today) return
        date = storedDate
        baseline = storedBaseline
        carrySensorSteps = storedCarrySensor.coerceAtLeast(0)
        sensorSteps = storedSensorSteps.coerceAtLeast(0)
        simulatedSteps = storedSimulated.coerceAtLeast(0)
        serverCarrySteps = storedServerCarry.coerceAtLeast(0)
        lastSource = storedSource
        lastSyncedCount = storedSyncedCount
        lastSyncedSource = storedSyncedSource
    }

    fun onSensorCounter(rawCounter: Float): StepSnapshot {
        rollDateIfNeeded()
        if (rawCounter >= 0f && rawCounter.isFinite()) {
            val currentBaseline = baseline
            if (currentBaseline == null) {
                baseline = rawCounter
            } else if (rawCounter < currentBaseline) {
                carrySensorSteps = sensorSteps.coerceAtMost(MAX_DAILY_STEPS)
                baseline = rawCounter
                sensorSteps = carrySensorSteps
            } else {
                val delta = (rawCounter - currentBaseline).roundToInt().coerceAtLeast(0)
                sensorSteps = (carrySensorSteps + delta).coerceAtMost(MAX_DAILY_STEPS)
            }
            if (sensorSteps > 0) lastSource = "device_sensor"
        }
        return snapshot()
    }

    fun addSimulated(delta: Int): StepSnapshot {
        rollDateIfNeeded()
        if (delta > 0) {
            simulatedSteps = (simulatedSteps + delta).coerceAtMost(MAX_DAILY_STEPS)
            lastSource = "demo_sim"
        }
        return snapshot()
    }

    fun mergeServerSteps(serverDate: String, serverCount: Int, serverSource: String?) {
        rollDateIfNeeded()
        if (serverDate != date) return
        val localWithoutCarry = (sensorSteps + simulatedSteps).coerceAtMost(MAX_DAILY_STEPS)
        if (serverCount > localWithoutCarry) {
            serverCarrySteps = (serverCount - localWithoutCarry).coerceAtLeast(0)
        }
        if (serverCount >= snapshot().count && serverSource != null) {
            lastSyncedCount = serverCount
            lastSyncedSource = serverSource
        }
    }

    fun markSynced(syncedDate: String, count: Int, source: String) {
        rollDateIfNeeded()
        if (syncedDate != date) return
        lastSyncedCount = count
        lastSyncedSource = source
    }

    fun snapshot(): StepSnapshot {
        rollDateIfNeeded()
        val count = max(0, (sensorSteps + simulatedSteps + serverCarrySteps)).coerceAtMost(MAX_DAILY_STEPS)
        val source = when {
            simulatedSteps > 0 && lastSource == "demo_sim" -> "demo_sim"
            sensorSteps > 0 -> "device_sensor"
            simulatedSteps > 0 -> "demo_sim"
            else -> lastSource
        }
        val needsSync = count > 0 && (count != lastSyncedCount || source != lastSyncedSource)
        return StepSnapshot(date = date, count = count, source = source, needsSync = needsSync)
    }

    fun debugValues(): Map<String, Any?> = mapOf(
        "date" to date,
        "baseline" to baseline,
        "carrySensorSteps" to carrySensorSteps,
        "sensorSteps" to sensorSteps,
        "simulatedSteps" to simulatedSteps,
        "serverCarrySteps" to serverCarrySteps,
        "lastSource" to lastSource,
        "lastSyncedCount" to lastSyncedCount,
        "lastSyncedSource" to lastSyncedSource,
    )
}

internal class StepTrackerStore(context: Context, scope: String) {
    private val key = java.util.UUID.nameUUIDFromBytes(scope.toByteArray(Charsets.UTF_8))
    private val prefs = context.getSharedPreferences("shifo_daily_steps_$key", Context.MODE_PRIVATE)
    private val accumulator = StepDayAccumulator()

    init {
        val today = LocalDate.now(tashkentZone).toString()
        val storedDate = prefs.getString("date", null)
        if (storedDate == today) {
            val baseline = if (prefs.contains("baseline")) prefs.getFloat("baseline", 0f) else null
            accumulator.restore(
                storedDate = storedDate,
                storedBaseline = baseline,
                storedCarrySensor = prefs.getInt("carry_sensor", 0),
                storedSensorSteps = prefs.getInt("sensor_steps", 0),
                storedSimulated = prefs.getInt("simulated_steps", 0),
                storedServerCarry = prefs.getInt("server_carry", 0),
                storedSource = prefs.getString("last_source", "device_sensor") ?: "device_sensor",
                storedSyncedCount = prefs.getInt("synced_count", -1),
                storedSyncedSource = prefs.getString("synced_source", null),
            )
        }
    }

    @Synchronized
    fun onSensorCounter(rawCounter: Float): StepSnapshot {
        val snap = accumulator.onSensorCounter(rawCounter)
        persist()
        return snap
    }

    @Synchronized
    fun addSimulated(delta: Int): StepSnapshot {
        val snap = accumulator.addSimulated(delta)
        persist()
        return snap
    }

    @Synchronized
    fun mergeServerSteps(serverDate: String, serverCount: Int, serverSource: String?): StepSnapshot {
        accumulator.mergeServerSteps(serverDate, serverCount, serverSource)
        persist()
        return accumulator.snapshot()
    }

    @Synchronized
    fun markSynced(date: String, count: Int, source: String): StepSnapshot {
        accumulator.markSynced(date, count, source)
        persist()
        return accumulator.snapshot()
    }

    @Synchronized
    fun snapshot(): StepSnapshot = accumulator.snapshot()

    private fun persist() {
        val v = accumulator.debugValues()
        prefs.edit().apply {
            putString("date", v["date"] as String)
            val baseline = v["baseline"] as Float?
            if (baseline != null) putFloat("baseline", baseline) else remove("baseline")
            putInt("carry_sensor", v["carrySensorSteps"] as Int)
            putInt("sensor_steps", v["sensorSteps"] as Int)
            putInt("simulated_steps", v["simulatedSteps"] as Int)
            putInt("server_carry", v["serverCarrySteps"] as Int)
            putString("last_source", v["lastSource"] as String)
            putInt("synced_count", v["lastSyncedCount"] as Int)
            val syncedSource = v["lastSyncedSource"] as String?
            if (syncedSource != null) putString("synced_source", syncedSource) else remove("synced_source")
            apply()
        }
    }
}

internal fun hasStepPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
}

internal fun hasStepSensor(context: Context): Boolean {
    val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return false
    return manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
}

internal class StepSensorController(
    private val context: Context,
    private val onCounterValue: (Float) -> Unit,
) : SensorEventListener {
    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private var registered = false

    fun start(): Boolean {
        if (registered) return true
        if (!hasStepPermission(context)) return false
        val sensor = manager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return false
        registered = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
        return registered
    }

    fun stop() {
        if (!registered) return
        manager?.unregisterListener(this)
        registered = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_STEP_COUNTER && event.values.isNotEmpty()) {
            onCounterValue(event.values[0])
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
